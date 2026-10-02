-- PARTYVERSE — Foundation
-- Private schema for internal helpers, shared trigger functions, rate limiting
-- and text moderation primitives.
--
-- Conventions (see docs/architecture/database.md):
--   * Every table in `public` has RLS enabled and explicit grants.
--   * Client-facing write operations go through SECURITY DEFINER RPCs that
--     validate input and permissions, never through direct table writes.
--   * Business errors are raised with a stable message code `PV_*` that the
--     client maps to a localized message (src/lib/errors.ts).
--   * All functions pin `search_path = ''` and fully qualify identifiers.

create schema if not exists app_private;
revoke all on schema app_private from public;
-- RLS policies call a few helpers from this schema; the schema is not exposed
-- through the Data API, so usage is safe to grant.
grant usage on schema app_private to authenticated, service_role;

-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. Revoke it so
-- every callable RPC is an explicit decision.
-- (Per-schema default privileges cannot revoke the global PUBLIC grant, hence
-- the global statement.) Each migration then grants EXECUTE explicitly.
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Generic triggers
-- ---------------------------------------------------------------------------
create or replace function app_private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Authentication helpers
-- ---------------------------------------------------------------------------
create table app_private.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null check (action in ('warn', 'mute', 'suspend', 'ban')),
  reason text not null check (char_length(reason) between 1 and 500),
  report_id uuid,
  expires_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index moderation_actions_user_idx
  on app_private.moderation_actions (user_id, action)
  where revoked_at is null;

comment on table app_private.moderation_actions is
  'Sanction history. Written by moderators through service-role tooling only.';

create or replace function app_private.has_active_sanction(p_user uuid, p_actions text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from app_private.moderation_actions ma
    where ma.user_id = p_user
      and ma.action = any (p_actions)
      and ma.revoked_at is null
      and (ma.expires_at is null or ma.expires_at > now())
  );
$$;

-- Returns the caller id or raises. Suspended or banned accounts cannot act.
create or replace function app_private.require_user()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'PV_NOT_AUTHENTICATED';
  end if;
  if app_private.has_active_sanction(v_uid, array['suspend', 'ban']) then
    raise exception 'PV_ACCOUNT_SUSPENDED';
  end if;
  return v_uid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Rate limiting (sliding window, serialized per user/action)
-- ---------------------------------------------------------------------------
create table app_private.rate_limit_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  action text not null,
  created_at timestamptz not null default now()
);
create index rate_limit_events_lookup_idx
  on app_private.rate_limit_events (user_id, action, created_at desc);

create or replace function app_private.enforce_rate_limit(
  p_user uuid,
  p_action text,
  p_max integer,
  p_window interval
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text || ':' || p_action, 0));

  select count(*)
    into v_count
    from app_private.rate_limit_events
   where user_id = p_user
     and action = p_action
     and created_at > now() - p_window;

  if v_count >= p_max then
    raise exception 'PV_RATE_LIMITED' using hint = p_action;
  end if;

  insert into app_private.rate_limit_events (user_id, action) values (p_user, p_action);
end;
$$;

-- ---------------------------------------------------------------------------
-- Text moderation
-- ---------------------------------------------------------------------------
create table app_private.blocked_terms (
  term text primary key check (term = lower(term) and char_length(term) between 2 and 40),
  category text not null check (category in ('reserved', 'profanity')),
  created_at timestamptz not null default now()
);

comment on table app_private.blocked_terms is
  'reserved: forbidden inside usernames (impersonation). profanity: forbidden in '
  'usernames and masked in chat. Extend through moderation tooling.';

insert into app_private.blocked_terms (term, category) values
  ('admin', 'reserved'),
  ('administrator', 'reserved'),
  ('moderator', 'reserved'),
  ('modo', 'reserved'),
  ('staff', 'reserved'),
  ('support', 'reserved'),
  ('official', 'reserved'),
  ('officiel', 'reserved'),
  ('partyverse', 'reserved'),
  ('system', 'reserved'),
  ('root', 'reserved'),
  ('fuck', 'profanity'),
  ('shit', 'profanity'),
  ('bitch', 'profanity'),
  ('cunt', 'profanity'),
  ('asshole', 'profanity'),
  ('connard', 'profanity'),
  ('connasse', 'profanity'),
  ('salope', 'profanity'),
  ('encule', 'profanity'),
  ('pute', 'profanity'),
  ('batard', 'profanity'),
  ('merde', 'profanity');

-- Usernames: reject any reserved or profane term contained in the handle.
create or replace function app_private.username_is_allowed(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
    from app_private.blocked_terms bt
    where position(bt.term in replace(lower(p_username), '_', '')) > 0
  );
$$;

-- Chat: mask whole-word profanity, keeping the first letter for readability.
create or replace function app_private.mask_profanity(p_text text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result text := p_text;
  v_term record;
begin
  for v_term in
    select term from app_private.blocked_terms where category = 'profanity'
  loop
    v_result := regexp_replace(
      v_result,
      '\m' || v_term.term || '\M',
      left(v_term.term, 1) || repeat('*', char_length(v_term.term) - 1),
      'gi'
    );
  end loop;
  return v_result;
end;
$$;

-- Lobby codes: 6 characters from an unambiguous alphabet, sourced from the
-- cryptographically secure generator behind gen_random_uuid().
create or replace function app_private.generate_code(p_length integer default 6)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea := uuid_send(gen_random_uuid());
  v_code text := '';
begin
  -- Only the first 6 bytes of a v4 UUID are free of version/variant bits.
  if p_length not between 1 and 6 then
    raise exception 'PV_INVALID_INPUT';
  end if;
  -- 256 is a multiple of 32, so the modulo keeps the distribution uniform.
  for i in 0 .. p_length - 1 loop
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  return v_code;
end;
$$;
