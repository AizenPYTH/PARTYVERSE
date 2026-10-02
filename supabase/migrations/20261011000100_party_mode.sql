-- PARTYVERSE — Party mode: several games chained in the same room, with
-- overall standings. A session belongs to a lobby; each round is an ordinary
-- match of that lobby, scored when it is finalized (after_match_finalized).
--
-- Lock order stays lobby → match → party session (the session is always
-- taken last).

create table public.party_sessions (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid not null references public.lobbies (id) on delete cascade,
  host_id uuid references public.profiles (id) on delete set null,
  format text not null check (format in ('classic', 'quick', 'custom', 'friends', 'competitive')),
  playlist text[] not null check (cardinality(playlist) between 1 and 10),
  rounds_total smallint not null check (rounds_total between 1 and 10),
  current_round smallint not null default 0,
  status text not null default 'active' check (status in ('active', 'finished', 'cancelled')),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create unique index party_sessions_one_active on public.party_sessions (lobby_id) where status = 'active';
create index party_sessions_lobby_idx on public.party_sessions (lobby_id, created_at desc);

create table public.party_rounds (
  session_id uuid not null references public.party_sessions (id) on delete cascade,
  round_number smallint not null,
  game_id text not null references public.game_catalog (id),
  match_id uuid references public.matches (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'done', 'skipped')),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  primary key (session_id, round_number)
);

create table public.party_scores (
  session_id uuid not null references public.party_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  points integer not null default 0,
  wins integer not null default 0,
  rounds_played integer not null default 0,
  primary key (session_id, user_id)
);

alter table public.party_sessions enable row level security;
alter table public.party_rounds enable row level security;
alter table public.party_scores enable row level security;
revoke all on public.party_sessions, public.party_rounds, public.party_scores from anon, authenticated;
grant select on public.party_sessions, public.party_rounds, public.party_scores to authenticated;

create policy "Lobby members read party sessions" on public.party_sessions
  for select to authenticated using (app_private.is_lobby_member(lobby_id, auth.uid()));
create policy "Lobby members read party rounds" on public.party_rounds
  for select to authenticated using (exists (
    select 1 from public.party_sessions s where s.id = session_id and app_private.is_lobby_member(s.lobby_id, auth.uid())));
create policy "Lobby members read party scores" on public.party_scores
  for select to authenticated using (exists (
    select 1 from public.party_sessions s where s.id = session_id and app_private.is_lobby_member(s.lobby_id, auth.uid())));

-- Points for one round: 10 for the winner down to 1 for the last; a shared
-- first place (draw) is worth 7.
create or replace function app_private.party_points(p_rank integer, p_players integer, p_result text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_players <= 1 or p_rank is null then 1
    when p_rank = 1 and p_result = 'draw' then 7
    else greatest(1, round(1 + 9.0 * (p_players - p_rank) / (p_players - 1))::integer)
  end;
$$;

-- Games a format may draw from, for a given headcount.
create or replace function app_private.party_pool(p_format text, p_players integer)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(g.id order by g.sort_order), '{}')
    from public.game_catalog g
   where g.availability = 'available'
     and g.network_model in ('turn_based_sql', 'turn_based_engine')
     and p_players between g.min_players and g.max_players
     and case p_format
           when 'quick' then g.avg_duration_minutes <= 5
           when 'friends' then g.category in ('trivia', 'social_deduction', 'memory', 'party') or g.id = 'tic_tac_toe'
           when 'competitive' then g.category = 'strategy'
           else true
         end;
$$;

-- Random playlist from a pool, never the same game twice in a row when the
-- pool allows it.
create or replace function app_private.party_playlist(p_pool text[], p_rounds integer)
returns text[]
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_result text[] := '{}';
  v_batch text[];
  v_game text;
begin
  if cardinality(p_pool) = 0 then
    return v_result;
  end if;
  while cardinality(v_result) < p_rounds loop
    select array_agg(x order by random()) into v_batch from unnest(p_pool) x;
    if cardinality(v_batch) > 1 and v_batch[1] = v_result[cardinality(v_result)] then
      v_batch := v_batch[2:] || v_batch[1];
    end if;
    foreach v_game in array v_batch loop
      exit when cardinality(v_result) >= p_rounds;
      v_result := v_result || v_game;
    end loop;
  end loop;
  return v_result;
end;
$$;

create or replace function public.start_party(
  p_lobby uuid,
  p_format text,
  p_rounds integer default 5,
  p_games text[] default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
  v_lobby public.lobbies := app_private.require_lobby_host(p_lobby, v_uid);
  v_players integer;
  v_playlist text[];
  v_session uuid;
  v_game text;
begin
  if v_lobby.status not in ('waiting', 'ready') then
    raise exception 'PV_LOBBY_IN_GAME';
  end if;
  if v_lobby.source = 'matchmaking' then
    raise exception 'PV_LOBBY_FORBIDDEN';
  end if;
  if exists (select 1 from public.party_sessions where lobby_id = p_lobby and status = 'active') then
    raise exception 'PV_PARTY_ACTIVE';
  end if;
  if p_format not in ('classic', 'quick', 'custom', 'friends', 'competitive') then
    raise exception 'PV_INVALID_SETTINGS' using hint = 'format';
  end if;
  select count(*) into v_players from public.lobby_members where lobby_id = p_lobby and role = 'player';

  if p_format = 'custom' then
    if p_games is null or cardinality(p_games) not between 2 and 10 then
      raise exception 'PV_INVALID_SETTINGS' using hint = 'games';
    end if;
    foreach v_game in array p_games loop
      if not v_game = any (app_private.party_pool('classic', v_players)) then
        raise exception 'PV_GAME_UNAVAILABLE' using hint = v_game;
      end if;
    end loop;
    v_playlist := p_games;
  else
    if p_rounds is null or p_rounds not between 2 and 10 then
      raise exception 'PV_INVALID_SETTINGS' using hint = 'rounds';
    end if;
    v_playlist := app_private.party_playlist(app_private.party_pool(p_format, v_players), p_rounds);
    if cardinality(v_playlist) = 0 then
      raise exception 'PV_PARTY_NO_GAMES';
    end if;
  end if;

  insert into public.party_sessions (lobby_id, host_id, format, playlist, rounds_total)
  values (p_lobby, v_uid, p_format, v_playlist, cardinality(v_playlist))
  returning id into v_session;

  insert into public.party_scores (session_id, user_id)
  select v_session, user_id from public.lobby_members where lobby_id = p_lobby and role = 'player';

  perform app_private.lobby_system_message(p_lobby, 'party_started',
    jsonb_build_object('format', p_format, 'rounds', cardinality(v_playlist)));
  return v_session;
end;
$$;

-- Prepares the next round: switches the room to the round's game with its
-- default settings and marks the players ready. The client then starts the
-- match through the usual path (SQL RPC or game-action). Idempotent while the
-- prepared round has not been played (an aborted match is simply replayed).
create or replace function public.party_next_round(p_lobby uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
  v_lobby public.lobbies := app_private.require_lobby_host(p_lobby, v_uid);
  v_session public.party_sessions;
  v_round public.party_rounds;
  v_game public.game_catalog;
  v_players integer;
  v_number integer;
begin
  if v_lobby.status not in ('waiting', 'ready') then
    raise exception 'PV_LOBBY_IN_GAME';
  end if;
  select * into v_session from public.party_sessions where lobby_id = p_lobby and status = 'active' for update;
  if v_session.id is null then
    raise exception 'PV_PARTY_NOT_FOUND';
  end if;
  select count(*) into v_players from public.lobby_members where lobby_id = p_lobby and role = 'player';

  select * into v_round from public.party_rounds where session_id = v_session.id and status = 'pending';
  if v_round.session_id is null then
    v_number := coalesce((select max(round_number) from public.party_rounds where session_id = v_session.id), 0);
    loop
      v_number := v_number + 1;
      if v_number > v_session.rounds_total then
        update public.party_sessions set status = 'finished', finished_at = now() where id = v_session.id;
        perform app_private.lobby_system_message(p_lobby, 'party_finished', jsonb_build_object('session_id', v_session.id));
        return jsonb_build_object('finished', true, 'session_id', v_session.id);
      end if;
      select * into v_game from public.game_catalog where id = v_session.playlist[v_number];
      if v_game.availability = 'available' and v_players between v_game.min_players and v_game.max_players then
        insert into public.party_rounds (session_id, round_number, game_id)
        values (v_session.id, v_number, v_game.id)
        returning * into v_round;
        exit;
      end if;
      -- The headcount no longer fits this game: skip it.
      insert into public.party_rounds (session_id, round_number, game_id, status, finished_at)
      values (v_session.id, v_number, v_session.playlist[v_number], 'skipped', now());
    end loop;
  else
    select * into v_game from public.game_catalog where id = v_round.game_id;
  end if;

  update public.lobbies
     set game_id = v_game.id,
         mode = 'classic',
         settings = case when game_id = v_game.id then settings
                         else app_private.normalize_game_settings(v_game.id, '{}'::jsonb) end,
         max_players = greatest(least(v_game.max_players, greatest(max_players, v_game.min_players)), v_players),
         ranked = false,
         last_activity_at = now()
   where id = p_lobby;
  update public.lobby_members set is_ready = true where lobby_id = p_lobby and role = 'player';
  insert into public.party_scores (session_id, user_id)
  select v_session.id, user_id from public.lobby_members where lobby_id = p_lobby and role = 'player'
  on conflict do nothing;
  perform app_private.recompute_lobby_status(p_lobby);
  perform app_private.lobby_system_message(p_lobby, 'party_round', jsonb_build_object(
    'round', v_round.round_number, 'rounds', v_session.rounds_total, 'game_id', v_game.id, 'name', v_game.name));

  return jsonb_build_object(
    'finished', false,
    'session_id', v_session.id,
    'round', v_round.round_number,
    'game_id', v_game.id,
    'network_model', v_game.network_model);
end;
$$;

create or replace function public.end_party(p_lobby uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
  v_lobby public.lobbies := app_private.require_lobby_host(p_lobby, v_uid);
  v_session uuid;
begin
  update public.party_sessions
     set status = case when current_round > 0 then 'finished' else 'cancelled' end, finished_at = now()
   where lobby_id = v_lobby.id and status = 'active'
  returning id into v_session;
  if v_session is null then
    raise exception 'PV_PARTY_NOT_FOUND';
  end if;
  delete from public.party_rounds where session_id = v_session and status = 'pending';
  perform app_private.lobby_system_message(p_lobby, 'party_finished', jsonb_build_object('session_id', v_session));
end;
$$;

-- Latest session of the room (active or the last finished one), its rounds
-- and its standings.
create or replace function public.get_party_state(p_lobby uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
  v_session public.party_sessions;
begin
  if not app_private.is_lobby_member(p_lobby, v_uid) then
    raise exception 'PV_LOBBY_NOT_FOUND';
  end if;
  select * into v_session from public.party_sessions where lobby_id = p_lobby order by created_at desc limit 1;
  if v_session.id is null then
    return null;
  end if;
  return jsonb_build_object(
    'session', jsonb_build_object(
      'id', v_session.id, 'format', v_session.format, 'status', v_session.status,
      'rounds_total', v_session.rounds_total, 'current_round', v_session.current_round,
      'playlist', (select coalesce(jsonb_agg(jsonb_build_object('game_id', g.id, 'name', g.name) order by p.ord), '[]'::jsonb)
                     from unnest(v_session.playlist) with ordinality p(game_id, ord)
                     join public.game_catalog g on g.id = p.game_id),
      'created_at', v_session.created_at, 'finished_at', v_session.finished_at),
    'rounds', (select coalesce(jsonb_agg(jsonb_build_object(
                  'round', r.round_number, 'game_id', r.game_id, 'name', g.name, 'status', r.status,
                  'match_id', r.match_id,
                  'winners', (select coalesce(jsonb_agg(mp.user_id), '[]'::jsonb) from public.match_players mp
                               where mp.match_id = r.match_id and mp.rank = 1))
                order by r.round_number), '[]'::jsonb)
                 from public.party_rounds r join public.game_catalog g on g.id = r.game_id
                where r.session_id = v_session.id),
    'standings', (select coalesce(jsonb_agg(jsonb_build_object(
                     'user_id', s.user_id, 'username', p.username, 'display_name', p.display_name,
                     'avatar_id', p.avatar_id, 'points', s.points, 'wins', s.wins, 'rounds_played', s.rounds_played)
                   order by s.points desc, s.wins desc, p.username), '[]'::jsonb)
                    from public.party_scores s join public.profiles p on p.id = s.user_id
                   where s.session_id = v_session.id));
end;
$$;

-- Scores a finished match when it is the pending round of the room's party.
create or replace function app_private.after_match_finalized(p_match uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.matches;
  v_session public.party_sessions;
  v_round public.party_rounds;
  v_players integer;
begin
  select * into v_match from public.matches where id = p_match;
  if v_match.lobby_id is null then
    return;
  end if;
  select * into v_session from public.party_sessions
   where lobby_id = v_match.lobby_id and status = 'active' for update;
  if v_session.id is null then
    return;
  end if;
  select * into v_round from public.party_rounds
   where session_id = v_session.id and status = 'pending' and game_id = v_match.game_id;
  if v_round.session_id is null then
    return;
  end if;

  select count(*) into v_players from public.match_players where match_id = p_match and user_id is not null;
  insert into public.party_scores as s (session_id, user_id, points, wins, rounds_played)
  select v_session.id, mp.user_id, app_private.party_points(mp.rank, v_players, mp.result),
         case when mp.result = 'win' then 1 else 0 end, 1
    from public.match_players mp
   where mp.match_id = p_match and mp.user_id is not null
  on conflict (session_id, user_id) do update
     set points = s.points + excluded.points,
         wins = s.wins + excluded.wins,
         rounds_played = s.rounds_played + 1;

  update public.party_rounds
     set match_id = p_match, status = 'done', finished_at = now()
   where session_id = v_round.session_id and round_number = v_round.round_number;

  update public.party_sessions
     set current_round = v_round.round_number,
         status = case when v_round.round_number >= rounds_total then 'finished' else status end,
         finished_at = case when v_round.round_number >= rounds_total then now() else finished_at end
   where id = v_session.id;
  if v_round.round_number >= v_session.rounds_total then
    perform app_private.lobby_system_message(v_match.lobby_id, 'party_finished', jsonb_build_object('session_id', v_session.id));
  end if;
end;
$$;

-- The room's game is driven by the party while a session is active.
create or replace function public.change_lobby_game(p_lobby uuid, p_game_id text)
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
begin
  if v_lobby.status not in ('waiting', 'ready') then
    raise exception 'PV_LOBBY_IN_GAME';
  end if;
  if v_lobby.source = 'matchmaking' then
    raise exception 'PV_LOBBY_FORBIDDEN';
  end if;
  if exists (select 1 from public.party_sessions where lobby_id = p_lobby and status = 'active') then
    raise exception 'PV_PARTY_ACTIVE';
  end if;
  select * into v_game from public.game_catalog where id = p_game_id;
  if v_game.id is null then
    raise exception 'PV_GAME_NOT_FOUND';
  end if;
  if v_game.availability not in ('available', 'beta') then
    raise exception 'PV_GAME_UNAVAILABLE';
  end if;
  select count(*) into v_players from public.lobby_members where lobby_id = p_lobby and role = 'player';
  if v_players > v_game.max_players then
    raise exception 'PV_TOO_MANY_PLAYERS';
  end if;

  update public.lobbies
     set game_id = v_game.id,
         mode = 'classic',
         settings = app_private.normalize_game_settings(v_game.id, '{}'::jsonb),
         max_players = greatest(least(v_game.max_players, greatest(max_players, v_game.min_players)), v_players),
         ranked = false,
         last_activity_at = now()
   where id = p_lobby
  returning * into v_lobby;

  update public.lobby_members set is_ready = false where lobby_id = p_lobby;
  perform app_private.recompute_lobby_status(p_lobby);
  perform app_private.lobby_system_message(p_lobby, 'game_changed', jsonb_build_object('game_id', v_game.id, 'name', v_game.name));
  select * into v_lobby from public.lobbies where id = p_lobby;
  return v_lobby;
end;
$$;

revoke all on function app_private.party_points(integer, integer, text) from public;
revoke all on function app_private.party_pool(text, integer) from public;
revoke all on function app_private.party_playlist(text[], integer) from public;
revoke all on function public.start_party(uuid, text, integer, text[]) from public, anon;
revoke all on function public.party_next_round(uuid) from public, anon;
revoke all on function public.end_party(uuid) from public, anon;
revoke all on function public.get_party_state(uuid) from public, anon;
grant execute on function public.start_party(uuid, text, integer, text[]) to authenticated;
grant execute on function public.party_next_round(uuid) to authenticated;
grant execute on function public.end_party(uuid) to authenticated;
grant execute on function public.get_party_state(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.party_sessions, public.party_rounds, public.party_scores;
  end if;
end;
$$;
