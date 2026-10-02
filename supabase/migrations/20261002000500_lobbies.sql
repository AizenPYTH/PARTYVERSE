-- PARTYVERSE — Lobbies, membership, invitations, lobby chat, reports
--
-- Lifecycle (docs/architecture/lobbies.md):
--   waiting ⇄ ready → in_progress → waiting (rematch) … → finished | cancelled | expired
--   * ready       : every player is ready and the game's minimum is reached
--   * finished    : closed after at least one match was played
--   * cancelled   : closed before any match
--   * expired     : abandoned, closed by maintenance
-- "Creating" is a client-side form state and never persisted.

create table public.lobbies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  host_id uuid references public.profiles (id) on delete set null,
  game_id text not null references public.game_catalog (id),
  name text not null default '' check (char_length(name) <= 40),
  visibility text not null default 'private' check (visibility in ('public', 'private')),
  max_players smallint not null check (max_players between 1 and 32),
  allow_spectators boolean not null default true,
  auto_start boolean not null default false,
  -- Only matchmaking creates ranked lobbies; friendly lobbies never affect ratings.
  ranked boolean not null default false,
  source text not null default 'custom' check (source in ('custom', 'matchmaking')),
  settings jsonb not null default '{}'::jsonb,
  status text not null default 'waiting'
    check (status in ('waiting', 'ready', 'in_progress', 'finished', 'cancelled', 'expired')),
  current_match_id uuid,
  matches_played integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  closed_at timestamptz
);

create index lobbies_public_open_idx on public.lobbies (game_id, created_at desc)
  where visibility = 'public' and status in ('waiting', 'ready');
create index lobbies_open_activity_idx on public.lobbies (last_activity_at)
  where status in ('waiting', 'ready', 'in_progress');

create trigger lobbies_set_updated_at
  before update on public.lobbies
  for each row execute function app_private.set_updated_at();

create table public.lobby_members (
  lobby_id uuid not null references public.lobbies (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('player', 'spectator')),
  is_ready boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (lobby_id, user_id)
);
create index lobby_members_user_idx on public.lobby_members (user_id);

-- Users removed by the host cannot rejoin the same lobby.
create table public.lobby_kicks (
  lobby_id uuid not null references public.lobbies (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (lobby_id, user_id)
);

create table public.lobby_messages (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid not null references public.lobbies (id) on delete cascade,
  sender_id uuid references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('text', 'quick', 'system')),
  body text not null check (char_length(body) between 1 and 300),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint lobby_messages_sender_kind check ((kind = 'system') = (sender_id is null))
);
create index lobby_messages_lobby_created_idx on public.lobby_messages (lobby_id, created_at desc);

create table public.lobby_invitations (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid not null references public.lobbies (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 minutes',
  responded_at timestamptz,
  constraint lobby_invitations_not_self check (sender_id <> recipient_id)
);
create unique index lobby_invitations_one_pending
  on public.lobby_invitations (lobby_id, recipient_id) where status = 'pending';
create index lobby_invitations_recipient_pending_idx
  on public.lobby_invitations (recipient_id, created_at desc) where status = 'pending';

-- ---------------------------------------------------------------------------
-- Visibility helpers (used by RLS, hence granted to authenticated)
-- ---------------------------------------------------------------------------
create or replace function app_private.is_lobby_member(p_lobby uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.lobby_members where lobby_id = p_lobby and user_id = p_user);
$$;

create or replace function app_private.can_view_lobby(p_lobby uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.is_lobby_member(p_lobby, p_user)
      or exists (select 1 from public.lobbies l
                  where l.id = p_lobby and l.visibility = 'public'
                    and l.status in ('waiting', 'ready', 'in_progress'))
      or exists (select 1 from public.lobby_invitations i
                  where i.lobby_id = p_lobby and i.recipient_id = p_user
                    and i.status = 'pending' and i.expires_at > now());
$$;

grant execute on function
  app_private.is_lobby_member(uuid, uuid),
  app_private.can_view_lobby(uuid, uuid)
to authenticated;

alter table public.lobbies enable row level security;
alter table public.lobby_members enable row level security;
alter table public.lobby_kicks enable row level security;
alter table public.lobby_messages enable row level security;
alter table public.lobby_invitations enable row level security;
revoke all on public.lobbies, public.lobby_members, public.lobby_kicks, public.lobby_messages,
              public.lobby_invitations from anon, authenticated;
grant select on public.lobbies, public.lobby_members, public.lobby_messages, public.lobby_invitations
  to authenticated;

create policy "Visible lobbies" on public.lobbies
  for select to authenticated using (app_private.can_view_lobby(id, auth.uid()));
create policy "Members of visible lobbies" on public.lobby_members
  for select to authenticated using (app_private.can_view_lobby(lobby_id, auth.uid()));
create policy "Members read lobby chat" on public.lobby_messages
  for select to authenticated using (app_private.is_lobby_member(lobby_id, auth.uid()));
create policy "Invitation parties read invitations" on public.lobby_invitations
  for select to authenticated using (auth.uid() in (sender_id, recipient_id));

-- ---------------------------------------------------------------------------
-- Internal lobby helpers
-- ---------------------------------------------------------------------------
create or replace function app_private.lobby_system_message(p_lobby uuid, p_event text, p_meta jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.lobby_messages (lobby_id, sender_id, kind, body, meta)
  values (p_lobby, null, 'system', p_event, coalesce(p_meta, '{}'::jsonb));
$$;

create or replace function app_private.member_meta(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('user_id', p.id, 'username', p.username, 'display_name', p.display_name)
    from public.profiles p where p.id = p_user;
$$;

-- Recomputes waiting/ready from the members' readiness.
create or replace function app_private.recompute_lobby_status(p_lobby uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lobby public.lobbies;
  v_min smallint;
  v_players integer;
  v_unready integer;
  v_status text;
begin
  select * into v_lobby from public.lobbies where id = p_lobby;
  if v_lobby.status not in ('waiting', 'ready') then
    return v_lobby.status;
  end if;

  select min_players into v_min from public.game_catalog where id = v_lobby.game_id;
  select count(*), count(*) filter (where not is_ready)
    into v_players, v_unready
    from public.lobby_members where lobby_id = p_lobby and role = 'player';

  v_status := case when v_players >= v_min and v_unready = 0 then 'ready' else 'waiting' end;
  if v_status <> v_lobby.status then
    update public.lobbies set status = v_status where id = p_lobby;
  end if;
  return v_status;
end;
$$;

create or replace function app_private.touch_lobby(p_lobby uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.lobbies set last_activity_at = now() where id = p_lobby;
$$;

-- Closes a lobby: finished if a match was played, otherwise the given status.
create or replace function app_private.close_lobby(p_lobby uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.lobbies
     set status = case when matches_played > 0 and p_status = 'cancelled' then 'finished' else p_status end,
         closed_at = now(),
         current_match_id = null
   where id = p_lobby and status in ('waiting', 'ready', 'in_progress');
  delete from public.lobby_members where lobby_id = p_lobby;
  update public.lobby_invitations
     set status = 'cancelled', responded_at = now()
   where lobby_id = p_lobby and status = 'pending';
end;
$$;

-- Removes a member, forfeiting their active match, transferring the host role
-- to the longest-standing player, or closing the lobby when no player is left.
create or replace function app_private.remove_lobby_member(p_lobby uuid, p_user uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lobby public.lobbies;
  v_role text;
  v_new_host uuid;
begin
  select * into v_lobby from public.lobbies where id = p_lobby for update;
  select role into v_role from public.lobby_members where lobby_id = p_lobby and user_id = p_user;
  if v_role is null then
    return;
  end if;

  if v_lobby.status = 'in_progress' and v_role = 'player' and v_lobby.current_match_id is not null then
    perform app_private.forfeit_match(v_lobby.current_match_id, p_user, 'abandon');
  end if;

  delete from public.lobby_members where lobby_id = p_lobby and user_id = p_user;
  perform app_private.lobby_system_message(
    p_lobby, 'member_' || p_reason, app_private.member_meta(p_user));

  if v_lobby.host_id = p_user then
    select user_id into v_new_host
      from public.lobby_members
     where lobby_id = p_lobby and role = 'player'
     order by joined_at, user_id
     limit 1;

    if v_new_host is null then
      perform app_private.close_lobby(p_lobby, 'cancelled');
      return;
    end if;

    update public.lobbies set host_id = v_new_host where id = p_lobby;
    perform app_private.lobby_system_message(p_lobby, 'host_changed', app_private.member_meta(v_new_host));
  elsif not exists (select 1 from public.lobby_members where lobby_id = p_lobby and role = 'player') then
    perform app_private.close_lobby(p_lobby, 'cancelled');
    return;
  end if;

  perform app_private.recompute_lobby_status(p_lobby);
  perform app_private.touch_lobby(p_lobby);
end;
$$;

-- A player belongs to at most one open lobby. Leaving other lobbies is
-- refused while the user is playing an active match elsewhere.
create or replace function app_private.leave_other_lobbies(p_user uuid, p_keep uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membership record;
begin
  for v_membership in
    select lm.lobby_id, lm.role, l.status
      from public.lobby_members lm
      join public.lobbies l on l.id = lm.lobby_id
     where lm.user_id = p_user and lm.lobby_id is distinct from p_keep
  loop
    if v_membership.status = 'in_progress' and v_membership.role = 'player' then
      raise exception 'PV_ALREADY_IN_MATCH';
    end if;
    perform app_private.remove_lobby_member(v_membership.lobby_id, p_user, 'left');
  end loop;
end;
$$;

create or replace function app_private.can_access_lobby(p_lobby public.lobbies, p_user uuid, p_via_code boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_via_code
      or p_lobby.visibility = 'public'
      or exists (select 1 from public.lobby_invitations i
                  where i.lobby_id = p_lobby.id and i.recipient_id = p_user
                    and i.status = 'pending' and i.expires_at > now())
      or exists (select 1
                   from public.lobby_members lm
                   join public.user_settings us on us.user_id = lm.user_id
                  where lm.lobby_id = p_lobby.id
                    and us.allow_join_from_friends
                    and app_private.are_friends(lm.user_id, p_user));
$$;

create or replace function app_private.join_lobby_internal(
  p_lobby uuid,
  p_user uuid,
  p_as_spectator boolean,
  p_via_code boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lobby public.lobbies;
  v_existing text;
  v_players integer;
  v_spectators integer;
  v_role text;
begin
  select * into v_lobby from public.lobbies where id = p_lobby for update;
  if v_lobby.id is null then
    raise exception 'PV_LOBBY_NOT_FOUND';
  end if;
  if v_lobby.status not in ('waiting', 'ready', 'in_progress') then
    raise exception 'PV_LOBBY_CLOSED';
  end if;

  select role into v_existing from public.lobby_members where lobby_id = p_lobby and user_id = p_user;
  if v_existing is not null then
    return p_lobby;
  end if;

  if not app_private.can_access_lobby(v_lobby, p_user, p_via_code)
     or exists (select 1 from public.lobby_kicks where lobby_id = p_lobby and user_id = p_user) then
    raise exception 'PV_LOBBY_FORBIDDEN';
  end if;

  -- Never put a user in the same room as someone they blocked (or who blocked them).
  if exists (
    select 1 from public.lobby_members lm
     where lm.lobby_id = p_lobby and app_private.is_blocked_between(lm.user_id, p_user)
  ) then
    raise exception 'PV_LOBBY_FORBIDDEN';
  end if;

  select count(*) filter (where role = 'player'), count(*) filter (where role = 'spectator')
    into v_players, v_spectators
    from public.lobby_members where lobby_id = p_lobby;

  if p_as_spectator or v_lobby.status = 'in_progress' then
    if not v_lobby.allow_spectators then
      if v_lobby.status = 'in_progress' then
        raise exception 'PV_LOBBY_IN_GAME';
      end if;
      raise exception 'PV_SPECTATORS_DISABLED';
    end if;
    if v_spectators >= 20 then
      raise exception 'PV_LOBBY_FULL';
    end if;
    v_role := 'spectator';
  else
    if v_players >= v_lobby.max_players then
      raise exception 'PV_LOBBY_FULL';
    end if;
    v_role := 'player';
  end if;

  perform app_private.leave_other_lobbies(p_user, p_lobby);
  -- Joining a room ends any ranked search (table defined in the matchmaking migration).
  update public.matchmaking_tickets set status = 'cancelled' where user_id = p_user and status = 'searching';

  insert into public.lobby_members (lobby_id, user_id, role) values (p_lobby, p_user, v_role);

  update public.lobby_invitations
     set status = 'accepted', responded_at = now()
   where lobby_id = p_lobby and recipient_id = p_user and status = 'pending';

  perform app_private.lobby_system_message(p_lobby, 'member_joined',
    app_private.member_meta(p_user) || jsonb_build_object('role', v_role));
  perform app_private.recompute_lobby_status(p_lobby);
  perform app_private.touch_lobby(p_lobby);
  return p_lobby;
end;
$$;

create or replace function app_private.require_lobby_host(p_lobby uuid, p_user uuid)
returns public.lobbies
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lobby public.lobbies;
begin
  select * into v_lobby from public.lobbies where id = p_lobby for update;
  if v_lobby.id is null or not app_private.is_lobby_member(p_lobby, p_user) then
    raise exception 'PV_LOBBY_NOT_FOUND';
  end if;
  if v_lobby.host_id is distinct from p_user then
    raise exception 'PV_NOT_LOBBY_HOST';
  end if;
  return v_lobby;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lobby RPCs
-- ---------------------------------------------------------------------------
create or replace function public.create_lobby(
  p_game_id text,
  p_visibility text default 'private',
  p_max_players integer default null,
  p_allow_spectators boolean default true,
  p_auto_start boolean default false,
  p_settings jsonb default '{}'::jsonb,
  p_name text default ''
)
returns public.lobbies
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
  v_game public.game_catalog;
  v_max integer;
  v_lobby public.lobbies;
  v_attempt integer := 0;
begin
  if not exists (select 1 from public.profiles where id = v_uid and onboarding_completed_at is not null) then
    raise exception 'PV_ONBOARDING_REQUIRED';
  end if;

  select * into v_game from public.game_catalog where id = p_game_id;
  if v_game.id is null then
    raise exception 'PV_GAME_NOT_FOUND';
  end if;
  if v_game.availability not in ('available', 'beta') then
    raise exception 'PV_GAME_UNAVAILABLE';
  end if;
  if p_visibility not in ('public', 'private') then
    raise exception 'PV_INVALID_INPUT';
  end if;

  v_max := coalesce(p_max_players, v_game.max_players);
  if v_max < v_game.min_players or v_max > v_game.max_players then
    raise exception 'PV_INVALID_SETTINGS' using hint = 'max_players';
  end if;

  perform app_private.enforce_rate_limit(v_uid, 'create_lobby', 15, interval '10 minutes');
  perform app_private.leave_other_lobbies(v_uid, null);
  update public.matchmaking_tickets set status = 'cancelled' where user_id = v_uid and status = 'searching';

  loop
    v_attempt := v_attempt + 1;
    begin
      insert into public.lobbies
        (code, host_id, game_id, name, visibility, max_players, allow_spectators, auto_start, settings)
      values
        (app_private.generate_code(6), v_uid, p_game_id, btrim(coalesce(p_name, '')), p_visibility, v_max,
         coalesce(p_allow_spectators, true), coalesce(p_auto_start, false),
         app_private.normalize_game_settings(p_game_id, p_settings))
      returning * into v_lobby;
      exit;
    exception when unique_violation then
      if v_attempt >= 5 then
        raise;
      end if;
    end;
  end loop;

  insert into public.lobby_members (lobby_id, user_id, role) values (v_lobby.id, v_uid, 'player');
  perform app_private.lobby_system_message(v_lobby.id, 'lobby_created', app_private.member_meta(v_uid));
  return v_lobby;
end;
$$;

create or replace function public.join_lobby(p_lobby uuid, p_as_spectator boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
begin
  if not exists (select 1 from public.profiles where id = v_uid and onboarding_completed_at is not null) then
    raise exception 'PV_ONBOARDING_REQUIRED';
  end if;
  return app_private.join_lobby_internal(p_lobby, v_uid, coalesce(p_as_spectator, false), false);
end;
$$;

-- Returns null for unknown codes (no exception) so failed attempts still count
-- against the rate limit and cannot be used to enumerate codes for free.
create or replace function public.join_lobby_by_code(p_code text, p_as_spectator boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
  v_lobby uuid;
begin
  if not exists (select 1 from public.profiles where id = v_uid and onboarding_completed_at is not null) then
    raise exception 'PV_ONBOARDING_REQUIRED';
  end if;
  perform app_private.enforce_rate_limit(v_uid, 'join_by_code', 20, interval '10 minutes');

  select id into v_lobby
    from public.lobbies
   where code = upper(btrim(coalesce(p_code, '')))
     and status in ('waiting', 'ready', 'in_progress');
  if v_lobby is null then
    return null;
  end if;
  return app_private.join_lobby_internal(v_lobby, v_uid, coalesce(p_as_spectator, false), true);
end;
$$;

create or replace function public.leave_lobby(p_lobby uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
begin
  perform app_private.remove_lobby_member(p_lobby, v_uid, 'left');
end;
$$;

create or replace function public.kick_lobby_member(p_lobby uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
  v_lobby public.lobbies := app_private.require_lobby_host(p_lobby, v_uid);
  v_role text;
begin
  if p_user = v_uid then
    raise exception 'PV_CANNOT_TARGET_SELF';
  end if;
  select role into v_role from public.lobby_members where lobby_id = p_lobby and user_id = p_user;
  if v_role is null then
    raise exception 'PV_NOT_LOBBY_MEMBER';
  end if;
  if v_lobby.status = 'in_progress' and v_role = 'player' then
    raise exception 'PV_LOBBY_IN_GAME';
  end if;

  insert into public.lobby_kicks (lobby_id, user_id) values (p_lobby, p_user) on conflict do nothing;
  perform app_private.remove_lobby_member(p_lobby, p_user, 'kicked');
end;
$$;

create or replace function public.set_lobby_ready(p_lobby uuid, p_ready boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
  v_lobby public.lobbies;
  v_status text;
begin
  select * into v_lobby from public.lobbies where id = p_lobby for update;
  if v_lobby.id is null or not app_private.is_lobby_member(p_lobby, v_uid) then
    raise exception 'PV_LOBBY_NOT_FOUND';
  end if;
  if v_lobby.status not in ('waiting', 'ready') then
    raise exception 'PV_LOBBY_IN_GAME';
  end if;

  update public.lobby_members
     set is_ready = coalesce(p_ready, false)
   where lobby_id = p_lobby and user_id = v_uid and role = 'player';
  if not found then
    raise exception 'PV_NOT_A_PLAYER';
  end if;

  v_status := app_private.recompute_lobby_status(p_lobby);
  perform app_private.touch_lobby(p_lobby);

  if v_status = 'ready' and v_lobby.auto_start then
    perform app_private.start_lobby_match_internal(p_lobby);
    return 'in_progress';
  end if;
  return v_status;
end;
$$;

create or replace function public.update_lobby_settings(
  p_lobby uuid,
  p_name text default null,
  p_visibility text default null,
  p_max_players integer default null,
  p_allow_spectators boolean default null,
  p_auto_start boolean default null,
  p_settings jsonb default null
)
returns public.lobbies
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
  v_lobby public.lobbies := app_private.require_lobby_host(p_lobby, v_uid);
  v_game public.game_catalog;
  v_players integer;
  v_max integer;
begin
  if v_lobby.status not in ('waiting', 'ready') then
    raise exception 'PV_LOBBY_IN_GAME';
  end if;
  if p_visibility is not null and p_visibility not in ('public', 'private') then
    raise exception 'PV_INVALID_INPUT';
  end if;

  select * into v_game from public.game_catalog where id = v_lobby.game_id;
  select count(*) into v_players from public.lobby_members where lobby_id = p_lobby and role = 'player';
  v_max := coalesce(p_max_players, v_lobby.max_players);
  if v_max < v_game.min_players or v_max > v_game.max_players or v_max < v_players then
    raise exception 'PV_INVALID_SETTINGS' using hint = 'max_players';
  end if;

  update public.lobbies
     set name = coalesce(btrim(p_name), name),
         visibility = coalesce(p_visibility, visibility),
         max_players = v_max,
         allow_spectators = coalesce(p_allow_spectators, allow_spectators),
         auto_start = coalesce(p_auto_start, auto_start),
         settings = case when p_settings is null then settings
                         else app_private.normalize_game_settings(game_id, p_settings) end,
         last_activity_at = now()
   where id = p_lobby
  returning * into v_lobby;

  -- Changing the rules invalidates everyone's "ready".
  update public.lobby_members set is_ready = false where lobby_id = p_lobby;
  perform app_private.recompute_lobby_status(p_lobby);
  perform app_private.lobby_system_message(p_lobby, 'settings_changed', '{}'::jsonb);

  select * into v_lobby from public.lobbies where id = p_lobby;
  return v_lobby;
end;
$$;

create or replace function public.get_lobby_state(p_lobby uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
  v_lobby public.lobbies;
  v_is_member boolean;
begin
  select * into v_lobby from public.lobbies where id = p_lobby;
  if v_lobby.id is null or not app_private.can_view_lobby(p_lobby, v_uid) then
    raise exception 'PV_LOBBY_NOT_FOUND';
  end if;
  v_is_member := app_private.is_lobby_member(p_lobby, v_uid);

  return jsonb_build_object(
    'lobby', jsonb_build_object(
      'id', v_lobby.id,
      'code', case when v_is_member then v_lobby.code end,
      'host_id', v_lobby.host_id,
      'game_id', v_lobby.game_id,
      'name', v_lobby.name,
      'visibility', v_lobby.visibility,
      'max_players', v_lobby.max_players,
      'allow_spectators', v_lobby.allow_spectators,
      'auto_start', v_lobby.auto_start,
      'ranked', v_lobby.ranked,
      'source', v_lobby.source,
      'settings', v_lobby.settings,
      'status', v_lobby.status,
      'current_match_id', v_lobby.current_match_id,
      'matches_played', v_lobby.matches_played,
      'created_at', v_lobby.created_at
    ),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id', p.id,
               'username', p.username,
               'display_name', p.display_name,
               'avatar_id', p.avatar_id,
               'level', p.level,
               'role', lm.role,
               'is_ready', lm.is_ready,
               'joined_at', lm.joined_at,
               'is_online', app_private.is_online(p.id)
             ) order by lm.joined_at, p.id)
        from public.lobby_members lm
        join public.profiles p on p.id = lm.user_id
       where lm.lobby_id = p_lobby
    ), '[]'::jsonb),
    'my_role', (select role from public.lobby_members where lobby_id = p_lobby and user_id = v_uid),
    'server_time', now()
  );
end;
$$;

create or replace function public.list_public_lobbies(p_game_id text default null, p_limit integer default 30)
returns table (
  lobby_id uuid,
  name text,
  game_id text,
  host_id uuid,
  host_username text,
  host_avatar_id text,
  player_count integer,
  max_players smallint,
  status text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
begin
  return query
    select l.id, l.name, l.game_id, l.host_id, p.username, p.avatar_id,
           pc.n, l.max_players, l.status, l.created_at
      from public.lobbies l
      join public.profiles p on p.id = l.host_id
      cross join lateral (
        select count(*)::integer as n from public.lobby_members lm
         where lm.lobby_id = l.id and lm.role = 'player'
      ) pc
     where l.visibility = 'public'
       and l.status in ('waiting', 'ready')
       and (p_game_id is null or l.game_id = p_game_id)
       and pc.n < l.max_players
       and not app_private.is_blocked_between(v_uid, l.host_id)
     order by l.created_at desc
     limit least(greatest(coalesce(p_limit, 30), 1), 50);
end;
$$;

create or replace function public.get_my_active_lobby()
returns table (lobby_id uuid, game_id text, status text, role text, current_match_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
begin
  return query
    select l.id, l.game_id, l.status, lm.role, l.current_match_id
      from public.lobby_members lm
      join public.lobbies l on l.id = lm.lobby_id
     where lm.user_id = v_uid
       and l.status in ('waiting', 'ready', 'in_progress')
     order by lm.joined_at desc
     limit 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------
create or replace function public.invite_to_lobby(p_lobby uuid, p_user uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
  v_lobby public.lobbies;
  v_policy text;
  v_invitation uuid;
begin
  select * into v_lobby from public.lobbies where id = p_lobby;
  if v_lobby.id is null or not app_private.is_lobby_member(p_lobby, v_uid) then
    raise exception 'PV_LOBBY_NOT_FOUND';
  end if;
  if v_lobby.status not in ('waiting', 'ready', 'in_progress') then
    raise exception 'PV_LOBBY_CLOSED';
  end if;
  if p_user = v_uid then
    raise exception 'PV_CANNOT_TARGET_SELF';
  end if;
  perform app_private.require_onboarded_target(p_user);
  if app_private.is_blocked_between(v_uid, p_user) then
    raise exception 'PV_USER_UNAVAILABLE';
  end if;
  if app_private.is_lobby_member(p_lobby, p_user) then
    raise exception 'PV_ALREADY_IN_LOBBY';
  end if;

  select invites_from into v_policy from public.user_settings where user_id = p_user;
  if v_policy = 'nobody' then
    raise exception 'PV_INVITES_DISABLED';
  end if;
  if not app_private.are_friends(v_uid, p_user) then
    raise exception 'PV_NOT_FRIENDS';
  end if;

  perform app_private.enforce_rate_limit(v_uid, 'lobby_invite', 30, interval '10 minutes');

  update public.lobby_invitations
     set expires_at = now() + interval '15 minutes', sender_id = v_uid
   where lobby_id = p_lobby and recipient_id = p_user and status = 'pending'
  returning id into v_invitation;

  if v_invitation is null then
    insert into public.lobby_invitations (lobby_id, sender_id, recipient_id)
    values (p_lobby, v_uid, p_user)
    returning id into v_invitation;
  end if;

  perform app_private.notify(p_user, 'lobby_invite', v_uid, jsonb_build_object(
    'invitation_id', v_invitation, 'lobby_id', p_lobby, 'game_id', v_lobby.game_id));
  return v_invitation;
end;
$$;

create or replace function public.respond_lobby_invitation(p_invitation uuid, p_accept boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
  v_invitation public.lobby_invitations;
  v_status text;
begin
  select * into v_invitation
    from public.lobby_invitations
   where id = p_invitation and recipient_id = v_uid
   for update;
  if v_invitation.id is null or v_invitation.status <> 'pending' then
    raise exception 'PV_INVITATION_NOT_FOUND';
  end if;

  if v_invitation.expires_at <= now() then
    -- Persist the expiry: returning (not raising) keeps the update.
    update public.lobby_invitations set status = 'expired' where id = p_invitation;
    return null;
  end if;

  if not coalesce(p_accept, false) then
    update public.lobby_invitations set status = 'declined', responded_at = now() where id = p_invitation;
    return null;
  end if;

  select status into v_status from public.lobbies where id = v_invitation.lobby_id;
  if v_status not in ('waiting', 'ready', 'in_progress') then
    raise exception 'PV_LOBBY_CLOSED';
  end if;

  return app_private.join_lobby_internal(v_invitation.lobby_id, v_uid, false, false);
end;
$$;

create or replace function public.cancel_lobby_invitation(p_invitation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
begin
  update public.lobby_invitations
     set status = 'cancelled', responded_at = now()
   where id = p_invitation and sender_id = v_uid and status = 'pending';
  if not found then
    raise exception 'PV_INVITATION_NOT_FOUND';
  end if;
end;
$$;

create or replace function public.list_my_invitations()
returns table (
  invitation_id uuid,
  lobby_id uuid,
  game_id text,
  lobby_status text,
  player_count integer,
  max_players smallint,
  sender_id uuid,
  sender_username text,
  sender_display_name text,
  sender_avatar_id text,
  created_at timestamptz,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
begin
  return query
    select i.id, l.id, l.game_id, l.status,
           (select count(*)::integer from public.lobby_members lm where lm.lobby_id = l.id and lm.role = 'player'),
           l.max_players, p.id, p.username, p.display_name, p.avatar_id, i.created_at, i.expires_at
      from public.lobby_invitations i
      join public.lobbies l on l.id = i.lobby_id
      join public.profiles p on p.id = i.sender_id
     where i.recipient_id = v_uid
       and i.status = 'pending'
       and i.expires_at > now()
       and l.status in ('waiting', 'ready', 'in_progress')
     order by i.created_at desc
     limit 50;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lobby chat
-- ---------------------------------------------------------------------------
create or replace function app_private.quick_message_ids()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['gg', 'gl', 'nice', 'wow', 'oops', 'rematch', 'thanks', 'ready'];
$$;

create or replace function public.send_lobby_message(p_lobby uuid, p_body text, p_kind text default 'text')
returns public.lobby_messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
  v_body text := btrim(coalesce(p_body, ''));
  v_message public.lobby_messages;
begin
  if not app_private.is_lobby_member(p_lobby, v_uid) then
    raise exception 'PV_NOT_LOBBY_MEMBER';
  end if;
  if app_private.has_active_sanction(v_uid, array['mute']) then
    raise exception 'PV_MUTED';
  end if;

  if p_kind = 'quick' then
    if not v_body = any (app_private.quick_message_ids()) then
      raise exception 'PV_MESSAGE_INVALID';
    end if;
  elsif p_kind = 'text' then
    if char_length(v_body) not between 1 and 300 then
      raise exception 'PV_MESSAGE_INVALID';
    end if;
    v_body := app_private.mask_profanity(v_body);
    if exists (
      select 1 from public.lobby_messages
       where lobby_id = p_lobby and sender_id = v_uid and body = v_body
         and created_at > now() - interval '30 seconds'
    ) then
      raise exception 'PV_MESSAGE_DUPLICATE';
    end if;
  else
    raise exception 'PV_MESSAGE_INVALID';
  end if;

  perform app_private.enforce_rate_limit(v_uid, 'lobby_message', 6, interval '10 seconds');

  insert into public.lobby_messages (lobby_id, sender_id, kind, body)
  values (p_lobby, v_uid, p_kind, v_body)
  returning * into v_message;
  perform app_private.touch_lobby(p_lobby);
  return v_message;
end;
$$;

create or replace function public.list_lobby_messages(
  p_lobby uuid,
  p_before timestamptz default null,
  p_limit integer default 50
)
returns table (
  id uuid,
  lobby_id uuid,
  sender_id uuid,
  sender_username text,
  sender_display_name text,
  sender_avatar_id text,
  kind text,
  body text,
  meta jsonb,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
begin
  if not app_private.is_lobby_member(p_lobby, v_uid) then
    raise exception 'PV_NOT_LOBBY_MEMBER';
  end if;
  return query
    select m.id, m.lobby_id, m.sender_id, p.username, p.display_name, p.avatar_id,
           m.kind, m.body, m.meta, m.created_at
      from public.lobby_messages m
      left join public.profiles p on p.id = m.sender_id
     where m.lobby_id = p_lobby
       and (p_before is null or m.created_at < p_before)
       and (m.sender_id is null or not exists (
             select 1 from public.blocks b where b.blocker_id = v_uid and b.blocked_id = m.sender_id))
     order by m.created_at desc, m.id desc
     limit least(greatest(coalesce(p_limit, 50), 1), 100);
end;
$$;

-- ---------------------------------------------------------------------------
-- Reports (evidence is captured server-side)
-- ---------------------------------------------------------------------------
create or replace function public.report_user(
  p_target uuid,
  p_context text,
  p_reason text,
  p_details text default '',
  p_context_ref uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
  v_evidence jsonb := '{}'::jsonb;
  v_id uuid;
begin
  if p_target = v_uid then
    raise exception 'PV_CANNOT_TARGET_SELF';
  end if;
  if not exists (select 1 from public.profiles where id = p_target) then
    raise exception 'PV_USER_NOT_FOUND';
  end if;
  if p_context not in ('profile', 'username', 'lobby_chat', 'match')
     or p_reason not in ('spam', 'harassment', 'hate', 'cheating', 'inappropriate_name', 'other')
     or char_length(coalesce(p_details, '')) > 500 then
    raise exception 'PV_INVALID_INPUT';
  end if;

  perform app_private.enforce_rate_limit(v_uid, 'report', 10, interval '1 day');

  if p_context = 'lobby_chat' and p_context_ref is not null then
    if not app_private.is_lobby_member(p_context_ref, v_uid) then
      raise exception 'PV_NOT_LOBBY_MEMBER';
    end if;
    select jsonb_build_object('messages', coalesce(jsonb_agg(jsonb_build_object(
             'body', m.body, 'created_at', m.created_at) order by m.created_at desc), '[]'::jsonb))
      into v_evidence
      from (select body, created_at from public.lobby_messages
             where lobby_id = p_context_ref and sender_id = p_target
             order by created_at desc limit 20) m;
  end if;

  v_evidence := v_evidence || jsonb_build_object(
    'username', (select username from public.profiles where id = p_target),
    'display_name', (select display_name from public.profiles where id = p_target));

  insert into public.reports (reporter_id, target_user_id, context, context_ref, reason, details, evidence)
  values (v_uid, p_target, p_context, p_context_ref, p_reason, coalesce(p_details, ''), v_evidence)
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function
  public.create_lobby(text, text, integer, boolean, boolean, jsonb, text),
  public.join_lobby(uuid, boolean),
  public.join_lobby_by_code(text, boolean),
  public.leave_lobby(uuid),
  public.kick_lobby_member(uuid, uuid),
  public.set_lobby_ready(uuid, boolean),
  public.update_lobby_settings(uuid, text, text, integer, boolean, boolean, jsonb),
  public.get_lobby_state(uuid),
  public.list_public_lobbies(text, integer),
  public.get_my_active_lobby(),
  public.invite_to_lobby(uuid, uuid),
  public.respond_lobby_invitation(uuid, boolean),
  public.cancel_lobby_invitation(uuid),
  public.list_my_invitations(),
  public.send_lobby_message(uuid, text, text),
  public.list_lobby_messages(uuid, timestamptz, integer),
  public.report_user(uuid, text, text, text, uuid)
to authenticated;
