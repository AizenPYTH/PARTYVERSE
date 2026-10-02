-- PARTYVERSE — Profiles, settings, cosmetic inventory, progression, notifications

-- ---------------------------------------------------------------------------
-- Cosmetic catalog and inventory
-- ---------------------------------------------------------------------------
create table public.cosmetic_items (
  id text primary key check (id ~ '^[a-z0-9-]{2,48}$'),
  kind text not null check (kind in ('avatar', 'frame', 'badge', 'title', 'theme', 'victory_effect')),
  name text not null check (char_length(name) between 1 and 40),
  rarity text not null default 'common' check (rarity in ('common', 'rare', 'epic', 'legendary')),
  -- Explicit unlock condition: {"type":"starter"} | {"type":"level","level":5}
  unlock_rule jsonb not null check (unlock_rule ? 'type'),
  sort_order integer not null default 100,
  created_at timestamptz not null default now()
);

create index cosmetic_items_level_unlock_idx
  on public.cosmetic_items (((unlock_rule ->> 'level')::integer))
  where unlock_rule ->> 'type' = 'level';

alter table public.cosmetic_items enable row level security;
revoke all on public.cosmetic_items from anon, authenticated;
grant select on public.cosmetic_items to authenticated;
create policy "Cosmetic catalog is readable" on public.cosmetic_items
  for select to authenticated using (true);

insert into public.cosmetic_items (id, kind, name, rarity, unlock_rule, sort_order) values
  ('orbit-violet', 'avatar', 'Orbite violette', 'common', '{"type":"starter"}', 1),
  ('nova-cyan', 'avatar', 'Nova cyan', 'common', '{"type":"starter"}', 2),
  ('pulse-pink', 'avatar', 'Pulsar rose', 'common', '{"type":"starter"}', 3),
  ('comet-amber', 'avatar', 'Comète ambre', 'common', '{"type":"starter"}', 4),
  ('nebula-green', 'avatar', 'Nébuleuse verte', 'common', '{"type":"starter"}', 5),
  ('quasar-blue', 'avatar', 'Quasar bleu', 'common', '{"type":"starter"}', 6),
  ('flare-red', 'avatar', 'Éruption rouge', 'common', '{"type":"starter"}', 7),
  ('moon-silver', 'avatar', 'Lune argent', 'common', '{"type":"starter"}', 8),
  ('galaxy-prism', 'avatar', 'Galaxie prisme', 'rare', '{"type":"level","level":3}', 20),
  ('eclipse-gold', 'avatar', 'Éclipse dorée', 'epic', '{"type":"level","level":5}', 21),
  ('supernova', 'avatar', 'Supernova', 'legendary', '{"type":"level","level":10}', 22),
  ('rookie', 'title', 'Recrue', 'common', '{"type":"starter"}', 1),
  ('challenger', 'title', 'Challenger', 'rare', '{"type":"level","level":3}', 2),
  ('strategist', 'title', 'Stratège', 'epic', '{"type":"level","level":5}', 3),
  ('legend', 'title', 'Légende', 'legendary', '{"type":"level","level":10}', 4);

-- ---------------------------------------------------------------------------
-- Progression: level curve (mirrored in src/features/progression/levels.ts)
-- XP needed to go from level L to L+1 = 100 + 50 * (L - 1)
-- ---------------------------------------------------------------------------
create or replace function app_private.xp_for_level(p_level integer)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select (100 * (p_level - 1) + 25 * (p_level - 1) * (p_level - 2))::bigint;
$$;

create or replace function app_private.level_for_xp(p_xp bigint)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_level integer := 1;
begin
  while v_level < 100 and app_private.xp_for_level(v_level + 1) <= p_xp loop
    v_level := v_level + 1;
  end loop;
  return v_level;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  -- Unique handle, chosen during onboarding. Stored lowercase.
  username text unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null default '' check (char_length(display_name) <= 32),
  avatar_id text not null default 'orbit-violet' references public.cosmetic_items (id),
  title_id text references public.cosmetic_items (id),
  bio text not null default '' check (char_length(bio) <= 160),
  favorite_games text[] not null default '{}' check (cardinality(favorite_games) <= 10),
  xp bigint not null default 0 check (xp >= 0),
  level integer not null default 1 check (level between 1 and 100),
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.profiles.xp is 'Server-managed. Clients cannot write it.';

create index profiles_username_prefix_idx on public.profiles (username text_pattern_ops);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function app_private.set_updated_at();

create table public.player_inventory (
  user_id uuid not null references public.profiles (id) on delete cascade,
  item_id text not null references public.cosmetic_items (id),
  source text not null check (source in ('starter', 'level', 'achievement', 'event', 'grant')),
  acquired_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

alter table public.player_inventory enable row level security;
revoke all on public.player_inventory from anon, authenticated;
grant select on public.player_inventory to authenticated;
create policy "Players read their own inventory" on public.player_inventory
  for select to authenticated using (user_id = auth.uid());

create or replace function app_private.owns_item(p_user uuid, p_item text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.cosmetic_items ci
     where ci.id = p_item and ci.unlock_rule ->> 'type' = 'starter'
  ) or exists (
    select 1 from public.player_inventory pi
     where pi.user_id = p_user and pi.item_id = p_item
  );
$$;

-- Guards client-editable columns that need cross-table validation.
create or replace function app_private.profiles_validate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game text;
begin
  if new.avatar_id is distinct from old.avatar_id then
    if not exists (select 1 from public.cosmetic_items where id = new.avatar_id and kind = 'avatar')
       or not app_private.owns_item(new.id, new.avatar_id) then
      raise exception 'PV_ITEM_NOT_OWNED';
    end if;
  end if;

  if new.title_id is distinct from old.title_id and new.title_id is not null then
    if not exists (select 1 from public.cosmetic_items where id = new.title_id and kind = 'title')
       or not app_private.owns_item(new.id, new.title_id) then
      raise exception 'PV_ITEM_NOT_OWNED';
    end if;
  end if;

  if new.favorite_games is distinct from old.favorite_games then
    foreach v_game in array new.favorite_games loop
      if not exists (select 1 from public.game_catalog where id = v_game) then
        raise exception 'PV_GAME_NOT_FOUND' using hint = v_game;
      end if;
    end loop;
    select coalesce(array_agg(distinct g), '{}') into new.favorite_games
      from unnest(new.favorite_games) g;
  end if;

  new.display_name := btrim(new.display_name);
  new.bio := btrim(new.bio);
  return new;
end;
$$;

create trigger profiles_validate
  before update on public.profiles
  for each row execute function app_private.profiles_validate();

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
-- Public identity fields are readable by any signed-in player (needed to show
-- lobby members, opponents, search results). Private stats are exposed only
-- through privacy-aware RPCs.
grant select on public.profiles to authenticated;
grant update (display_name, avatar_id, title_id, bio, favorite_games) on public.profiles to authenticated;

create policy "Profiles are readable by signed-in players" on public.profiles
  for select to authenticated using (true);
create policy "Players update their own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- Settings (private to the owner)
-- ---------------------------------------------------------------------------
create table public.user_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  profile_visibility text not null default 'public' check (profile_visibility in ('public', 'friends')),
  friend_requests_from text not null default 'everyone'
    check (friend_requests_from in ('everyone', 'friends_of_friends', 'nobody')),
  invites_from text not null default 'friends' check (invites_from in ('friends', 'nobody')),
  allow_join_from_friends boolean not null default true,
  show_presence boolean not null default true,
  -- { "<notification type>": false } disables a type. Missing keys = enabled.
  notification_prefs jsonb not null default '{}'::jsonb check (jsonb_typeof(notification_prefs) = 'object'),
  updated_at timestamptz not null default now()
);

create trigger user_settings_set_updated_at
  before update on public.user_settings
  for each row execute function app_private.set_updated_at();

alter table public.user_settings enable row level security;
revoke all on public.user_settings from anon, authenticated;
grant select, update (profile_visibility, friend_requests_from, invites_from, allow_join_from_friends,
                      show_presence, notification_prefs)
  on public.user_settings to authenticated;
create policy "Players read their own settings" on public.user_settings
  for select to authenticated using (user_id = auth.uid());
create policy "Players update their own settings" on public.user_settings
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Account bootstrap
-- ---------------------------------------------------------------------------
create or replace function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  insert into public.user_settings (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app_private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Notifications (in-app inbox; push delivery is a later layer)
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in (
    'friend_request', 'friend_accepted', 'lobby_invite', 'level_up', 'item_unlocked', 'system'
  )),
  actor_id uuid references public.profiles (id) on delete set null,
  -- Non-sensitive references only (ids, game id, level). Never message bodies.
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index notifications_user_unread_idx on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select, delete on public.notifications to authenticated;
create policy "Players read their notifications" on public.notifications
  for select to authenticated using (user_id = auth.uid());
create policy "Players delete their notifications" on public.notifications
  for delete to authenticated using (user_id = auth.uid());

-- Inserts a notification unless the recipient disabled the type or an
-- identical unread one was created in the last 10 minutes (anti-spam).
create or replace function app_private.notify(
  p_user uuid,
  p_type text,
  p_actor uuid,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prefs jsonb;
begin
  select notification_prefs into v_prefs from public.user_settings where user_id = p_user;
  if coalesce((v_prefs ->> p_type)::boolean, true) = false then
    return;
  end if;

  if exists (
    select 1 from public.notifications n
     where n.user_id = p_user
       and n.type = p_type
       and n.actor_id is not distinct from p_actor
       and n.payload = p_payload
       and n.read_at is null
       and n.created_at > now() - interval '10 minutes'
  ) then
    return;
  end if;

  insert into public.notifications (user_id, type, actor_id, payload)
  values (p_user, p_type, p_actor, p_payload);
end;
$$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
  v_count integer;
begin
  update public.notifications
     set read_at = now()
   where user_id = v_uid
     and read_at is null
     and (p_ids is null or id = any (p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- XP ledger (idempotent awards) and level history
-- ---------------------------------------------------------------------------
create table public.xp_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  source text not null check (source in ('match', 'quest', 'event', 'tournament', 'grant')),
  ref_id uuid not null,
  amount integer not null check (amount >= 0),
  reason text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, source, ref_id)
);
create index xp_events_user_created_idx on public.xp_events (user_id, created_at desc);

create table public.level_history (
  user_id uuid not null references public.profiles (id) on delete cascade,
  level integer not null,
  reached_at timestamptz not null default now(),
  primary key (user_id, level)
);

alter table public.xp_events enable row level security;
alter table public.level_history enable row level security;
revoke all on public.xp_events, public.level_history from anon, authenticated;
grant select on public.xp_events, public.level_history to authenticated;
create policy "Players read their XP ledger" on public.xp_events
  for select to authenticated using (user_id = auth.uid());
create policy "Players read their level history" on public.level_history
  for select to authenticated using (user_id = auth.uid());

-- Awards XP once per (user, source, ref). Handles level ups, unlocks and
-- notifications. Returns the amount actually awarded (0 if already awarded).
create or replace function app_private.award_xp(
  p_user uuid,
  p_source text,
  p_ref uuid,
  p_amount integer,
  p_reason text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_level integer;
  v_new_level integer;
  v_xp bigint;
  v_item record;
begin
  if p_amount <= 0 then
    return 0;
  end if;

  insert into public.xp_events (user_id, source, ref_id, amount, reason)
  values (p_user, p_source, p_ref, p_amount, p_reason)
  on conflict (user_id, source, ref_id) do nothing;
  if not found then
    return 0;
  end if;

  select level into v_old_level from public.profiles where id = p_user for update;

  update public.profiles
     set xp = xp + p_amount
   where id = p_user
  returning xp into v_xp;

  v_new_level := app_private.level_for_xp(v_xp);
  if v_new_level > v_old_level then
    update public.profiles set level = v_new_level where id = p_user;

    insert into public.level_history (user_id, level)
    select p_user, l from generate_series(v_old_level + 1, v_new_level) l
    on conflict do nothing;

    perform app_private.notify(p_user, 'level_up', null, jsonb_build_object('level', v_new_level));

    for v_item in
      select ci.id
        from public.cosmetic_items ci
       where ci.unlock_rule ->> 'type' = 'level'
         and (ci.unlock_rule ->> 'level')::integer <= v_new_level
    loop
      insert into public.player_inventory (user_id, item_id, source)
      values (p_user, v_item.id, 'level')
      on conflict do nothing;
      if found then
        perform app_private.notify(p_user, 'item_unlocked', null, jsonb_build_object('item_id', v_item.id));
      end if;
    end loop;
  end if;

  return p_amount;
end;
$$;

-- ---------------------------------------------------------------------------
-- Onboarding / identity RPCs
-- ---------------------------------------------------------------------------
create or replace function app_private.validate_username(p_username text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_username text := lower(btrim(coalesce(p_username, '')));
begin
  if v_username !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'PV_USERNAME_INVALID';
  end if;
  if not app_private.username_is_allowed(v_username) then
    raise exception 'PV_USERNAME_RESERVED';
  end if;
  return v_username;
end;
$$;

create or replace function public.is_username_available(p_username text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
  v_username text := app_private.validate_username(p_username);
begin
  return not exists (select 1 from public.profiles where username = v_username and id <> v_uid);
end;
$$;

create or replace function public.complete_onboarding(
  p_username text,
  p_display_name text,
  p_avatar_id text,
  p_favorite_games text[]
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
  v_username text := app_private.validate_username(p_username);
  v_profile public.profiles;
begin
  perform app_private.enforce_rate_limit(v_uid, 'complete_onboarding', 10, interval '10 minutes');

  if exists (select 1 from public.profiles where username = v_username and id <> v_uid) then
    raise exception 'PV_USERNAME_TAKEN';
  end if;

  begin
    update public.profiles
       set username = v_username,
           display_name = coalesce(nullif(btrim(p_display_name), ''), v_username),
           avatar_id = coalesce(p_avatar_id, avatar_id),
           favorite_games = coalesce(p_favorite_games, '{}'),
           title_id = coalesce(title_id, 'rookie'),
           onboarding_completed_at = coalesce(onboarding_completed_at, now())
     where id = v_uid
    returning * into v_profile;
  exception when unique_violation then
    raise exception 'PV_USERNAME_TAKEN';
  end;

  if v_profile.id is null then
    raise exception 'PV_USER_NOT_FOUND';
  end if;
  return v_profile;
end;
$$;

-- Username changes are limited to protect identity continuity.
create or replace function public.change_username(p_username text)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
  v_username text := app_private.validate_username(p_username);
  v_profile public.profiles;
begin
  perform app_private.enforce_rate_limit(v_uid, 'change_username', 2, interval '7 days');
  begin
    update public.profiles set username = v_username where id = v_uid returning * into v_profile;
  exception when unique_violation then
    raise exception 'PV_USERNAME_TAKEN';
  end;
  return v_profile;
end;
$$;

grant execute on function
  public.mark_notifications_read(uuid[]),
  public.is_username_available(text),
  public.complete_onboarding(text, text, text, text[]),
  public.change_username(text)
to authenticated;
