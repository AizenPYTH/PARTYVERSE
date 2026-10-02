-- PARTYVERSE — Social graph: friend requests, friendships, blocks, presence, reports

create table public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  receiver_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint friend_requests_not_self check (sender_id <> receiver_id)
);

-- At most one pending request per unordered pair.
create unique index friend_requests_one_pending_per_pair
  on public.friend_requests (least(sender_id, receiver_id), greatest(sender_id, receiver_id))
  where status = 'pending';
create index friend_requests_receiver_pending_idx on public.friend_requests (receiver_id) where status = 'pending';
create index friend_requests_sender_pending_idx on public.friend_requests (sender_id) where status = 'pending';

-- Canonical ordering (user_low < user_high) so a pair is stored once.
create table public.friendships (
  user_low uuid not null references public.profiles (id) on delete cascade,
  user_high uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_low, user_high),
  constraint friendships_ordered check (user_low < user_high)
);
create index friendships_user_high_idx on public.friendships (user_high);

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_not_self check (blocker_id <> blocked_id)
);
create index blocks_blocked_idx on public.blocks (blocked_id);

alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;
alter table public.blocks enable row level security;
revoke all on public.friend_requests, public.friendships, public.blocks from anon, authenticated;
grant select on public.friend_requests, public.friendships, public.blocks to authenticated;

create policy "Request parties read requests" on public.friend_requests
  for select to authenticated using (auth.uid() in (sender_id, receiver_id));
create policy "Friends read their friendships" on public.friendships
  for select to authenticated using (auth.uid() in (user_low, user_high));
create policy "Blockers read their blocks" on public.blocks
  for select to authenticated using (blocker_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Relationship helpers
-- ---------------------------------------------------------------------------
create or replace function app_private.are_friends(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friendships
     where user_low = least(p_a, p_b) and user_high = greatest(p_a, p_b)
  );
$$;

create or replace function app_private.is_blocked_between(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks
     where (blocker_id = p_a and blocked_id = p_b)
        or (blocker_id = p_b and blocked_id = p_a)
  );
$$;

create or replace function app_private.friend_ids(p_user uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select user_high from public.friendships where user_low = p_user
  union all
  select user_low from public.friendships where user_high = p_user;
$$;

create or replace function app_private.require_onboarded_target(p_target uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles where id = p_target and onboarding_completed_at is not null
  ) then
    raise exception 'PV_USER_NOT_FOUND';
  end if;
end;
$$;

-- 'friend' | 'incoming_request' | 'outgoing_request' | 'blocked' | 'none' | 'self'
create or replace function app_private.relationship(p_viewer uuid, p_target uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_viewer = p_target then 'self'
    when exists (select 1 from public.blocks where blocker_id = p_viewer and blocked_id = p_target) then 'blocked'
    when app_private.are_friends(p_viewer, p_target) then 'friend'
    when exists (select 1 from public.friend_requests
                  where sender_id = p_target and receiver_id = p_viewer and status = 'pending') then 'incoming_request'
    when exists (select 1 from public.friend_requests
                  where sender_id = p_viewer and receiver_id = p_target and status = 'pending') then 'outgoing_request'
    else 'none'
  end;
$$;

create or replace function app_private.create_friendship(p_a uuid, p_b uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.friendships (user_low, user_high)
  values (least(p_a, p_b), greatest(p_a, p_b))
  on conflict do nothing;
$$;

-- ---------------------------------------------------------------------------
-- Friend RPCs
-- ---------------------------------------------------------------------------
create or replace function public.send_friend_request(p_target uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
  v_policy text;
  v_reverse uuid;
begin
  if p_target = v_uid then
    raise exception 'PV_CANNOT_TARGET_SELF';
  end if;
  perform app_private.require_onboarded_target(p_target);

  if app_private.is_blocked_between(v_uid, p_target) then
    raise exception 'PV_USER_UNAVAILABLE';
  end if;
  if app_private.are_friends(v_uid, p_target) then
    raise exception 'PV_ALREADY_FRIENDS';
  end if;

  -- Serialize concurrent requests on the same pair.
  perform pg_advisory_xact_lock(hashtextextended(least(v_uid, p_target)::text || greatest(v_uid, p_target)::text, 0));

  -- A pending request in the other direction means both want it: accept.
  select id into v_reverse
    from public.friend_requests
   where sender_id = p_target and receiver_id = v_uid and status = 'pending';
  if v_reverse is not null then
    update public.friend_requests set status = 'accepted', responded_at = now() where id = v_reverse;
    perform app_private.create_friendship(v_uid, p_target);
    perform app_private.notify(p_target, 'friend_accepted', v_uid, '{}'::jsonb);
    return 'accepted';
  end if;

  if exists (select 1 from public.friend_requests
              where sender_id = v_uid and receiver_id = p_target and status = 'pending') then
    return 'pending';
  end if;

  select friend_requests_from into v_policy from public.user_settings where user_id = p_target;
  if v_policy = 'nobody' then
    raise exception 'PV_FRIEND_REQUESTS_DISABLED';
  elsif v_policy = 'friends_of_friends' and not exists (
    select 1 from app_private.friend_ids(v_uid) f
     where app_private.are_friends(f, p_target)
  ) then
    raise exception 'PV_FRIEND_REQUESTS_DISABLED';
  end if;

  perform app_private.enforce_rate_limit(v_uid, 'friend_request', 30, interval '1 hour');

  insert into public.friend_requests (sender_id, receiver_id) values (v_uid, p_target);
  perform app_private.notify(p_target, 'friend_request', v_uid, '{}'::jsonb);
  return 'pending';
end;
$$;

create or replace function public.respond_friend_request(p_request uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
  v_request public.friend_requests;
begin
  select * into v_request
    from public.friend_requests
   where id = p_request and receiver_id = v_uid
   for update;

  if v_request.id is null or v_request.status <> 'pending' then
    raise exception 'PV_REQUEST_NOT_FOUND';
  end if;

  if p_accept then
    if app_private.is_blocked_between(v_uid, v_request.sender_id) then
      raise exception 'PV_USER_UNAVAILABLE';
    end if;
    update public.friend_requests set status = 'accepted', responded_at = now() where id = p_request;
    perform app_private.create_friendship(v_uid, v_request.sender_id);
    perform app_private.notify(v_request.sender_id, 'friend_accepted', v_uid, '{}'::jsonb);
    return 'accepted';
  end if;

  update public.friend_requests set status = 'declined', responded_at = now() where id = p_request;
  return 'declined';
end;
$$;

create or replace function public.cancel_friend_request(p_request uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
begin
  update public.friend_requests
     set status = 'cancelled', responded_at = now()
   where id = p_request and sender_id = v_uid and status = 'pending';
  if not found then
    raise exception 'PV_REQUEST_NOT_FOUND';
  end if;
end;
$$;

create or replace function public.remove_friend(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
begin
  delete from public.friendships
   where user_low = least(v_uid, p_user) and user_high = greatest(v_uid, p_user);
end;
$$;

create or replace function public.block_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
begin
  if p_user = v_uid then
    raise exception 'PV_CANNOT_TARGET_SELF';
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'PV_USER_NOT_FOUND';
  end if;

  insert into public.blocks (blocker_id, blocked_id) values (v_uid, p_user) on conflict do nothing;
  delete from public.friendships
   where user_low = least(v_uid, p_user) and user_high = greatest(v_uid, p_user);
  update public.friend_requests
     set status = 'cancelled', responded_at = now()
   where status = 'pending'
     and ((sender_id = v_uid and receiver_id = p_user) or (sender_id = p_user and receiver_id = v_uid));
  -- Remove notifications the blocked user caused for the blocker.
  delete from public.notifications where user_id = v_uid and actor_id = p_user;
end;
$$;

create or replace function public.unblock_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
begin
  delete from public.blocks where blocker_id = v_uid and blocked_id = p_user;
end;
$$;

-- ---------------------------------------------------------------------------
-- Player search
-- ---------------------------------------------------------------------------
create or replace function public.search_players(p_query text, p_limit integer default 20)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_id text,
  level integer,
  relationship text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
  v_query text := lower(btrim(coalesce(p_query, '')));
  v_pattern text;
begin
  if char_length(v_query) < 2 or char_length(v_query) > 32 then
    raise exception 'PV_INVALID_INPUT';
  end if;
  -- Escape LIKE metacharacters so user input is matched literally.
  v_pattern := replace(replace(replace(v_query, '\', '\\'), '%', '\%'), '_', '\_');

  return query
    select p.id, p.username, p.display_name, p.avatar_id, p.level,
           app_private.relationship(v_uid, p.id)
      from public.profiles p
     where p.onboarding_completed_at is not null
       and p.id <> v_uid
       and (p.username like v_pattern || '%' or lower(p.display_name) like '%' || v_pattern || '%')
       and not app_private.is_blocked_between(v_uid, p.id)
     order by (p.username = v_query) desc, (p.username like v_pattern || '%') desc, p.username
     limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;

-- ---------------------------------------------------------------------------
-- Presence (heartbeat based; see docs/architecture/presence.md)
-- ---------------------------------------------------------------------------
create table public.presence (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  status text not null default 'online' check (status in ('online', 'away', 'dnd', 'invisible')),
  heartbeat_at timestamptz not null default now(),
  signed_out_at timestamptz
);

-- No direct client access: presence is only exposed through privacy-aware RPCs.
alter table public.presence enable row level security;
revoke all on public.presence from anon, authenticated;

-- A user is online only while their heartbeat is fresh (2 missed beats max).
create or replace function app_private.is_online(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.presence pr
     where pr.user_id = p_user
       and pr.signed_out_at is null
       and pr.heartbeat_at > now() - interval '75 seconds'
  );
$$;

create or replace function public.presence_heartbeat(p_status text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
begin
  if p_status is not null and p_status not in ('online', 'away', 'dnd', 'invisible') then
    raise exception 'PV_INVALID_INPUT';
  end if;

  insert into public.presence (user_id, status, heartbeat_at, signed_out_at)
  values (v_uid, coalesce(p_status, 'online'), now(), null)
  on conflict (user_id) do update
    set status = coalesce(p_status, public.presence.status),
        heartbeat_at = now(),
        signed_out_at = null;
end;
$$;

create or replace function public.presence_sign_out()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
begin
  update public.presence set signed_out_at = now() where user_id = v_uid;
end;
$$;

create or replace function public.get_my_presence_status()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
  v_status text;
begin
  select status into v_status from public.presence where user_id = v_uid;
  return coalesce(v_status, 'online');
end;
$$;

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles (id) on delete set null,
  target_user_id uuid references public.profiles (id) on delete set null,
  context text not null check (context in ('profile', 'username', 'lobby_chat', 'match')),
  context_ref uuid,
  reason text not null check (reason in ('spam', 'harassment', 'hate', 'cheating', 'inappropriate_name', 'other')),
  details text not null default '' check (char_length(details) <= 500),
  -- Snapshot captured server-side (e.g. the reported user's recent messages).
  evidence jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'reviewing', 'actioned', 'dismissed')),
  resolution_note text,
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index reports_status_created_idx on public.reports (status, created_at);
create index reports_target_idx on public.reports (target_user_id);

alter table public.reports enable row level security;
revoke all on public.reports from anon, authenticated;
grant select on public.reports to authenticated;
create policy "Reporters read their own reports" on public.reports
  for select to authenticated using (reporter_id = auth.uid());

grant execute on function
  public.send_friend_request(uuid),
  public.respond_friend_request(uuid, boolean),
  public.cancel_friend_request(uuid),
  public.remove_friend(uuid),
  public.block_user(uuid),
  public.unblock_user(uuid),
  public.search_players(text, integer),
  public.presence_heartbeat(text),
  public.presence_sign_out(),
  public.get_my_presence_status()
to authenticated;
