-- PARTYVERSE — Engine framework (v0.2)
--
-- Generalizes matches beyond two-player SQL games:
--   * N-player results (ranks, scores), leavers, aborted matches;
--   * hidden information: server-only state and per-seat private state;
--   * engine_* RPCs, callable by the service role only, used by the
--     `game-action` Edge Function that runs the TypeScript rule engines.
-- The SQL layer keeps the authority on locking, versions, deadlines,
-- seat permissions, results, XP and ratings.

-- ---------------------------------------------------------------------------
-- Catalog and schema changes
-- ---------------------------------------------------------------------------
alter table public.game_catalog drop constraint game_catalog_network_model_check;
alter table public.game_catalog add constraint game_catalog_network_model_check
  check (network_model in ('turn_based_sql', 'turn_based_engine', 'turn_based_edge', 'realtime_server'));
alter table public.game_catalog drop constraint game_catalog_category_check;
alter table public.game_catalog add constraint game_catalog_category_check check (category in (
  'strategy', 'party', 'trivia', 'social_deduction', 'skill', 'cooperative', 'racing', 'drawing', 'words', 'memory'
));

alter table public.lobbies add column mode text not null default 'classic';

alter table public.matches add column active_seats smallint[] not null default '{}';
alter table public.matches add column settings jsonb not null default '{}'::jsonb;
alter table public.matches add column result_detail jsonb not null default '{}'::jsonb;
alter table public.matches drop constraint matches_outcome_check;
alter table public.matches add constraint matches_outcome_check
  check (outcome in ('win', 'draw', 'completed', 'resignation', 'timeout', 'abandon', 'aborted'));

alter table public.match_players add column score numeric;
alter table public.match_players add column rank smallint;
alter table public.match_players add column left_at timestamptz;

-- System events (timeouts) have no seat.
alter table public.match_moves alter column seat drop not null;

-- Server-only state (full engine state, including every secret). No grants:
-- only SECURITY DEFINER functions and the service role can read it.
create table public.match_server_state (
  match_id uuid primary key references public.matches (id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.match_server_state enable row level security;
revoke all on public.match_server_state from anon, authenticated;

-- What a single seat may see (own ships, own word, own answer…).
create table public.match_private_state (
  match_id uuid not null references public.matches (id) on delete cascade,
  seat smallint not null,
  user_id uuid references public.profiles (id) on delete cascade,
  state jsonb not null,
  primary key (match_id, seat)
);
create index match_private_state_user_idx on public.match_private_state (user_id);
alter table public.match_private_state enable row level security;
revoke all on public.match_private_state from anon, authenticated;
grant select on public.match_private_state to authenticated;
create policy "Players read their own private state" on public.match_private_state
  for select to authenticated using (user_id = auth.uid());

create or replace function app_private.is_engine_game(p_game_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.game_catalog where id = p_game_id and network_model = 'turn_based_engine');
$$;

-- Extension point: replaced by later migrations (party, quests, achievements).
create or replace function app_private.after_match_finalized(p_match uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  return;
end;
$$;

-- ---------------------------------------------------------------------------
-- Results
-- ---------------------------------------------------------------------------
drop function if exists app_private.match_xp(uuid, uuid, text);

-- XP policy (docs/game-design/progression.md).
create or replace function app_private.match_xp(
  p_match uuid,
  p_user uuid,
  p_result text,
  p_rank integer,
  p_players integer
)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_match public.matches;
  v_moves integer;
  v_today integer;
  v_same_opponent integer;
begin
  select * into v_match from public.matches where id = p_match;
  select count(*) into v_moves from public.match_moves where match_id = p_match and user_id is not null;

  -- Matches decided by resignation/time/departure before 4 real moves earn nothing.
  if v_match.outcome in ('resignation', 'timeout', 'abandon') and v_moves < 4 then
    return 0;
  end if;

  select count(*) into v_today
    from public.xp_events
   where user_id = p_user and source = 'match' and amount > 0
     and created_at > date_trunc('day', now());
  if v_today >= 30 then
    return 0;
  end if;

  if p_players = 2 then
    select count(*) into v_same_opponent
      from public.match_players me
      join public.match_players opp on opp.match_id = me.match_id and opp.user_id <> me.user_id
      join public.matches m on m.id = me.match_id
     where me.user_id = p_user
       and m.id <> p_match
       and m.status = 'finished'
       and m.ended_at > date_trunc('day', now())
       and opp.user_id in (select user_id from public.match_players where match_id = p_match and user_id <> p_user);
    if v_same_opponent >= 10 then
      return 0;
    end if;
    return case p_result when 'win' then 40 when 'draw' then 20 else 10 end;
  end if;

  return case
    when p_rank = 1 then 40
    when p_rank = 2 then 25
    else 10
  end;
end;
$$;

-- Ends a locked active match with explicit per-seat results and applies every
-- consequence atomically. p_results: [{seat, result, rank, score}].
create or replace function app_private.finalize_match_results(
  p_match uuid,
  p_results jsonb,
  p_outcome text,
  p_state jsonb,
  p_detail jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.matches;
  v_player record;
  v_seconds bigint;
  v_players integer;
  v_xp integer;
  v_winner smallint;
begin
  if jsonb_typeof(p_results) <> 'array' then
    raise exception 'PV_INVALID_INPUT' using hint = 'results';
  end if;

  select case when count(*) = 1 then max((r ->> 'seat')::smallint) end into v_winner
    from jsonb_array_elements(p_results) r
   where r ->> 'result' = 'win';

  update public.matches
     set status = 'finished',
         outcome = p_outcome,
         winner_seat = v_winner,
         state = coalesce(p_state, state),
         result_detail = coalesce(p_detail, '{}'::jsonb),
         active_seats = '{}',
         current_turn_seat = null,
         turn_deadline = null,
         ended_at = now(),
         version = version + 1
   where id = p_match and status = 'active'
  returning * into v_match;
  if v_match.id is null then
    raise exception 'PV_MATCH_NOT_ACTIVE';
  end if;

  update public.match_players mp
     set result = r.result,
         rank = r.rank,
         score = r.score
    from jsonb_to_recordset(p_results) as r(seat smallint, result text, rank smallint, score numeric)
   where mp.match_id = p_match and mp.seat = r.seat and r.result in ('win', 'loss', 'draw');

  -- Seats the engine did not rank lose.
  update public.match_players
     set result = 'loss',
         rank = (select coalesce(max(rank), 0) + 1 from public.match_players where match_id = p_match)
   where match_id = p_match and result is null;

  select count(*) into v_players from public.match_players where match_id = p_match;
  if v_match.ranked and v_players = 2 then
    perform app_private.apply_elo(p_match);
  end if;

  v_seconds := greatest(extract(epoch from (v_match.ended_at - v_match.started_at))::bigint, 0);
  for v_player in
    select user_id, result, rank from public.match_players where match_id = p_match and user_id is not null
  loop
    perform app_private.record_stats(v_player.user_id, v_match.game_id, v_player.result, v_seconds);
    v_xp := app_private.award_xp(
      v_player.user_id, 'match', p_match,
      app_private.match_xp(p_match, v_player.user_id, v_player.result, v_player.rank, v_players),
      v_match.game_id || ':' || v_player.result);
    update public.match_players set xp_awarded = v_xp where match_id = p_match and user_id = v_player.user_id;
  end loop;

  if v_match.lobby_id is not null then
    -- Back to the lobby for a rematch. Ranked lobbies turn casual so a rematch
    -- between the same players cannot be used to farm rating.
    update public.lobbies
       set status = 'waiting',
           current_match_id = null,
           matches_played = matches_played + 1,
           ranked = false,
           last_activity_at = now()
     where id = v_match.lobby_id and current_match_id = p_match;
    update public.lobby_members set is_ready = false where lobby_id = v_match.lobby_id;
    perform app_private.lobby_system_message(v_match.lobby_id, 'match_ended', jsonb_build_object(
      'match_id', p_match, 'outcome', p_outcome,
      'winner_user_id', (select user_id from public.match_players where match_id = p_match and seat = v_winner)));
  end if;

  perform app_private.after_match_finalized(p_match);
end;
$$;

-- Two-player convenience wrapper (Connect Four, forfeits). Null winner = draw.
create or replace function app_private.finalize_match(
  p_match uuid,
  p_winner_seat smallint,
  p_outcome text,
  p_state jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.finalize_match_results(
    p_match,
    (select jsonb_agg(jsonb_build_object(
              'seat', seat,
              'result', case when p_winner_seat is null then 'draw' when seat = p_winner_seat then 'win' else 'loss' end,
              'rank', case when p_winner_seat is null or seat = p_winner_seat then 1 else 2 end))
       from public.match_players where match_id = p_match),
    p_outcome,
    p_state,
    jsonb_build_object('reason', p_outcome));
end;
$$;

-- Ends a match without results (nobody left to finish it). No stats, no XP.
create or replace function app_private.abort_match(p_match uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.matches;
begin
  update public.matches
     set status = 'aborted', outcome = 'aborted', result_detail = jsonb_build_object('reason', p_reason),
         active_seats = '{}', current_turn_seat = null, turn_deadline = null, ended_at = now(), version = version + 1
   where id = p_match and status = 'active'
  returning * into v_match;
  if v_match.id is null or v_match.lobby_id is null then
    return;
  end if;
  update public.lobbies
     set status = 'waiting', current_match_id = null, ranked = false, last_activity_at = now()
   where id = v_match.lobby_id and current_match_id = p_match;
  update public.lobby_members set is_ready = false where lobby_id = v_match.lobby_id;
  perform app_private.lobby_system_message(v_match.lobby_id, 'match_aborted', jsonb_build_object('match_id', p_match));
end;
$$;

-- A player leaves or resigns. Duels: the opponent wins. Larger games: the
-- player is marked absent; the match ends when fewer than two remain.
create or replace function app_private.forfeit_match(p_match uuid, p_user uuid, p_outcome text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.matches;
  v_seat smallint;
  v_players integer;
  v_remaining smallint[];
begin
  v_match := app_private.lock_match(p_match);
  if v_match.id is null or v_match.status <> 'active' then
    return;
  end if;
  select seat into v_seat from public.match_players where match_id = p_match and user_id = p_user and left_at is null;
  if v_seat is null then
    raise exception 'PV_NOT_A_PLAYER';
  end if;

  select count(*) into v_players from public.match_players where match_id = p_match;
  if v_players <= 2 then
    perform app_private.finalize_match(
      p_match, (select seat from public.match_players where match_id = p_match and seat <> v_seat), p_outcome, null);
    return;
  end if;

  update public.match_players set left_at = now() where match_id = p_match and seat = v_seat;
  select array_agg(seat order by seat) into v_remaining
    from public.match_players where match_id = p_match and left_at is null;

  if cardinality(v_remaining) <= 1 then
    perform app_private.finalize_match_results(
      p_match,
      (select jsonb_agg(jsonb_build_object(
                'seat', seat,
                'result', case when left_at is null then 'win' else 'loss' end,
                'rank', case when left_at is null then 1 else 2 end))
         from public.match_players where match_id = p_match),
      p_outcome, null, jsonb_build_object('reason', 'last_player_standing'));
    return;
  end if;

  update public.matches
     set active_seats = array(select unnest(active_seats) except select v_seat),
         version = version + 1
   where id = p_match;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reading a match (players and spectators)
-- ---------------------------------------------------------------------------
create or replace function public.get_match_state(p_match uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
  v_match public.matches;
  v_round integer;
  v_seat smallint;
begin
  select * into v_match from public.matches where id = p_match;
  if v_match.id is null or not app_private.can_view_match(p_match, v_uid) then
    raise exception 'PV_MATCH_NOT_FOUND';
  end if;

  select count(*) into v_round
    from public.matches m
   where m.lobby_id = v_match.lobby_id and m.started_at <= v_match.started_at;
  select seat into v_seat from public.match_players where match_id = p_match and user_id = v_uid;

  return jsonb_build_object(
    'match', jsonb_build_object(
      'id', v_match.id,
      'lobby_id', v_match.lobby_id,
      'game_id', v_match.game_id,
      'network_model', (select network_model from public.game_catalog where id = v_match.game_id),
      'mode', v_match.mode,
      'ranked', v_match.ranked,
      'status', v_match.status,
      'state', v_match.state,
      'settings', v_match.settings,
      'version', v_match.version,
      'current_turn_seat', v_match.current_turn_seat,
      'active_seats', case
        when cardinality(v_match.active_seats) > 0 then to_jsonb(v_match.active_seats)
        when v_match.current_turn_seat is not null and v_match.status = 'active' then jsonb_build_array(v_match.current_turn_seat)
        else '[]'::jsonb end,
      'turn_seconds', v_match.turn_seconds,
      'turn_deadline', v_match.turn_deadline,
      'outcome', v_match.outcome,
      'result_detail', v_match.result_detail,
      'winner_seat', v_match.winner_seat,
      'started_at', v_match.started_at,
      'ended_at', v_match.ended_at,
      'round', greatest(v_round, 1)
    ),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
               'seat', mp.seat,
               'user_id', mp.user_id,
               'username', p.username,
               'display_name', p.display_name,
               'avatar_id', p.avatar_id,
               'level', p.level,
               'result', mp.result,
               'rank', mp.rank,
               'score', mp.score,
               'left', mp.left_at is not null,
               'rating_before', mp.rating_before,
               'rating_after', mp.rating_after,
               'xp_awarded', mp.xp_awarded,
               'win_streak', coalesce(s.current_win_streak, 0),
               'series_wins', (
                  select count(*) from public.matches m2
                    join public.match_players w on w.match_id = m2.id and w.result = 'win'
                   where m2.lobby_id = v_match.lobby_id and m2.status = 'finished'
                     and m2.started_at <= v_match.started_at and w.user_id = mp.user_id),
               'is_online', case when mp.user_id is null then false else app_private.is_online(mp.user_id) end
             ) order by mp.seat)
        from public.match_players mp
        left join public.profiles p on p.id = mp.user_id
        left join public.player_game_stats s on s.user_id = mp.user_id and s.game_id = v_match.game_id
       where mp.match_id = p_match
    ), '[]'::jsonb),
    'my_seat', v_seat,
    'private_state', (select state from public.match_private_state where match_id = p_match and seat = v_seat and user_id = v_uid),
    'server_time', now()
  );
end;
$$;

create or replace function public.get_my_active_match()
returns table (match_id uuid, lobby_id uuid, game_id text, my_turn boolean, move_count integer, opponent_username text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
begin
  return query
    select m.id, m.lobby_id, m.game_id,
           (m.current_turn_seat = me.seat or me.seat = any (m.active_seats)),
           (select count(*)::integer from public.match_moves mv where mv.match_id = m.id and mv.user_id is not null),
           (select p.username from public.match_players o join public.profiles p on p.id = o.user_id
             where o.match_id = m.id and o.seat <> me.seat order by o.seat limit 1)
      from public.match_players me
      join public.matches m on m.id = me.match_id
     where me.user_id = v_uid and m.status = 'active' and me.left_at is null
     order by m.started_at desc
     limit 1;
end;
$$;

drop function if exists public.list_match_history(uuid, integer);
create or replace function public.list_match_history(p_user uuid default null, p_limit integer default 20)
returns table (
  match_id uuid,
  game_id text,
  outcome text,
  result text,
  ranked boolean,
  rating_before integer,
  rating_after integer,
  xp_awarded integer,
  opponent_id uuid,
  opponent_username text,
  opponent_avatar_id text,
  ended_at timestamptz,
  player_count integer,
  rank smallint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
  v_target uuid := coalesce(p_user, v_uid);
begin
  if not app_private.can_view_stats(v_uid, v_target)
     or exists (select 1 from public.blocks where blocker_id = v_target and blocked_id = v_uid) then
    raise exception 'PV_PROFILE_PRIVATE';
  end if;
  return query
    select m.id, m.game_id, m.outcome, me.result, m.ranked, me.rating_before, me.rating_after, me.xp_awarded,
           o.user_id, p.username, p.avatar_id, m.ended_at,
           (select count(*)::integer from public.match_players c where c.match_id = m.id), me.rank
      from public.match_players me
      join public.matches m on m.id = me.match_id
      left join lateral (
        select x.user_id from public.match_players x
         where x.match_id = m.id and x.seat <> me.seat
         order by x.rank nulls last, x.seat limit 1
      ) o on true
      left join public.profiles p on p.id = o.user_id
     where me.user_id = v_target and m.status = 'finished'
     order by m.ended_at desc
     limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;

grant execute on function public.list_match_history(uuid, integer) to authenticated;

-- SQL-engine games only; engine games use the game-action function.
create or replace function public.claim_match_timeout(p_match uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
  v_match public.matches;
begin
  v_match := app_private.lock_match(p_match);
  if v_match.id is null or not exists (select 1 from public.match_players where match_id = p_match and user_id = v_uid) then
    raise exception 'PV_MATCH_NOT_FOUND';
  end if;
  if app_private.is_engine_game(v_match.game_id) then
    raise exception 'PV_WRONG_GAME';
  end if;
  if v_match.status = 'active' then
    if v_match.turn_deadline > now() then
      raise exception 'PV_TURN_NOT_EXPIRED';
    end if;
    perform app_private.finalize_match(p_match, (1 - v_match.current_turn_seat)::smallint, 'timeout', null);
  end if;
  return public.get_match_state(p_match);
end;
$$;

-- ---------------------------------------------------------------------------
-- Starting matches
-- ---------------------------------------------------------------------------
create or replace function app_private.create_match(p_lobby uuid, p_players uuid[], p_ranked boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lobby public.lobbies;
  v_game public.game_catalog;
  v_match uuid;
  v_turn_seconds integer;
begin
  select * into v_lobby from public.lobbies where id = p_lobby;
  select * into v_game from public.game_catalog where id = v_lobby.game_id;
  if v_game.network_model <> 'turn_based_sql' then
    raise exception 'PV_WRONG_GAME';
  end if;
  v_turn_seconds := coalesce((v_lobby.settings ->> 'turn_seconds')::integer, 60);

  insert into public.matches
    (lobby_id, game_id, mode, ranked, state, settings, current_turn_seat, turn_seconds, turn_deadline, engine_version)
  values
    (p_lobby, v_game.id, v_lobby.mode, p_ranked, app_private.initial_match_state(v_game.id), v_lobby.settings, 0,
     v_turn_seconds, now() + make_interval(secs => v_turn_seconds), v_game.engine_version)
  returning id into v_match;

  insert into public.match_players (match_id, seat, user_id)
  select v_match, (ord - 1)::smallint, uid
    from unnest(p_players) with ordinality as t(uid, ord);

  update public.lobbies
     set status = 'in_progress', current_match_id = v_match, last_activity_at = now()
   where id = p_lobby;

  perform app_private.lobby_system_message(p_lobby, 'match_started', jsonb_build_object('match_id', v_match));
  return v_match;
end;
$$;

create or replace function app_private.start_lobby_match_internal(p_lobby uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lobby public.lobbies;
  v_game public.game_catalog;
  v_players uuid[];
begin
  select * into v_lobby from public.lobbies where id = p_lobby for update;
  if v_lobby.status = 'in_progress' then
    raise exception 'PV_LOBBY_IN_GAME';
  end if;
  if app_private.recompute_lobby_status(p_lobby) <> 'ready' then
    raise exception 'PV_PLAYERS_NOT_READY';
  end if;

  select * into v_game from public.game_catalog where id = v_lobby.game_id;
  if v_game.availability not in ('available', 'beta') then
    raise exception 'PV_GAME_UNAVAILABLE';
  end if;
  if v_game.network_model <> 'turn_based_sql' then
    raise exception 'PV_WRONG_GAME';
  end if;

  select array_agg(user_id order by joined_at) into v_players
    from public.lobby_members where lobby_id = p_lobby and role = 'player';
  if cardinality(v_players) < v_game.min_players then
    raise exception 'PV_NOT_ENOUGH_PLAYERS';
  end if;
  if cardinality(v_players) > v_game.max_players then
    raise exception 'PV_TOO_MANY_PLAYERS';
  end if;

  return app_private.create_match(p_lobby, app_private.seat_order(p_lobby, v_players), v_lobby.ranked);
end;
$$;

-- Auto-start only runs in SQL for SQL games; for engine games the client that
-- completes readiness asks the game-action function to start (it re-checks).
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

  if v_status = 'ready' and v_lobby.auto_start and not app_private.is_engine_game(v_lobby.game_id) then
    perform app_private.start_lobby_match_internal(p_lobby);
    return 'in_progress';
  end if;
  return v_status;
end;
$$;

-- Validates that p_user may start p_lobby now; returns the ordered seats.
create or replace function app_private.engine_start_checks(p_lobby uuid, p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lobby public.lobbies;
  v_game public.game_catalog;
  v_players uuid[];
begin
  select * into v_lobby from public.lobbies where id = p_lobby;
  if v_lobby.id is null or not app_private.is_lobby_member(p_lobby, p_user) then
    raise exception 'PV_LOBBY_NOT_FOUND';
  end if;
  if app_private.has_active_sanction(p_user, array['suspend', 'ban']) then
    raise exception 'PV_ACCOUNT_SUSPENDED';
  end if;
  if v_lobby.status = 'in_progress' then
    raise exception 'PV_LOBBY_IN_GAME';
  end if;
  if v_lobby.status not in ('waiting', 'ready') then
    raise exception 'PV_LOBBY_CLOSED';
  end if;
  if v_lobby.host_id is distinct from p_user and not v_lobby.auto_start and v_lobby.source <> 'matchmaking' then
    raise exception 'PV_NOT_LOBBY_HOST';
  end if;

  select * into v_game from public.game_catalog where id = v_lobby.game_id;
  if v_game.network_model <> 'turn_based_engine' then
    raise exception 'PV_WRONG_GAME';
  end if;
  if v_game.availability not in ('available', 'beta') then
    raise exception 'PV_GAME_UNAVAILABLE';
  end if;

  select array_agg(user_id order by joined_at, user_id) into v_players
    from public.lobby_members where lobby_id = p_lobby and role = 'player';
  if cardinality(v_players) < v_game.min_players then
    raise exception 'PV_NOT_ENOUGH_PLAYERS';
  end if;
  if cardinality(v_players) > v_game.max_players then
    raise exception 'PV_TOO_MANY_PLAYERS';
  end if;
  if exists (select 1 from public.lobby_members where lobby_id = p_lobby and role = 'player' and not is_ready) then
    raise exception 'PV_PLAYERS_NOT_READY';
  end if;

  return jsonb_build_object('lobby', to_jsonb(v_lobby), 'game', to_jsonb(v_game), 'players', to_jsonb(v_players));
end;
$$;

-- Game data the engine needs at start (question banks, word pairs). Each
-- game's migration adds its loader; unknown games get no data.
create or replace function app_private.engine_start_data(p_game_id text, p_settings jsonb, p_players integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  case p_game_id
    when 'quiz_rush' then return app_private.quiz_start_data(p_settings);
    when 'impostor' then return app_private.impostor_start_data(p_settings);
    else return null;
  end case;
end;
$$;

-- Service role (game-action function): everything needed to run engine.init.
create or replace function public.engine_prepare_start(p_lobby uuid, p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_checks jsonb := app_private.engine_start_checks(p_lobby, p_user);
  v_lobby jsonb := v_checks -> 'lobby';
  v_players uuid[] := array(select jsonb_array_elements_text(v_checks -> 'players')::uuid);
begin
  return jsonb_build_object(
    'lobby_id', p_lobby,
    'game_id', v_lobby ->> 'game_id',
    'mode', v_lobby ->> 'mode',
    'ranked', (v_lobby ->> 'ranked')::boolean,
    'settings', v_lobby -> 'settings',
    'seats', to_jsonb(app_private.seat_order(p_lobby, v_players)),
    'seed', gen_random_uuid(),
    'server_time', (extract(epoch from now()) * 1000)::bigint,
    'data', app_private.engine_start_data(v_lobby ->> 'game_id', v_lobby -> 'settings', cardinality(v_players))
  );
end;
$$;

create or replace function app_private.validate_transition(p_transition jsonb, p_seats integer)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if jsonb_typeof(p_transition) <> 'object'
     or jsonb_typeof(p_transition -> 'public_state') is null
     or jsonb_typeof(p_transition -> 'server_state') is null
     or jsonb_typeof(p_transition -> 'active_seats') <> 'array'
     or coalesce(jsonb_typeof(p_transition -> 'private_states'), 'array') <> 'array'
     or coalesce(jsonb_typeof(p_transition -> 'deadline_ms'), 'null') not in ('number', 'null')
     or exists (select 1 from jsonb_array_elements(p_transition -> 'active_seats') s
                 where jsonb_typeof(s) <> 'number' or s::integer not between 0 and p_seats - 1) then
    raise exception 'PV_INVALID_INPUT' using hint = 'transition';
  end if;
end;
$$;

create or replace function app_private.write_engine_states(p_match uuid, p_transition jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.match_server_state (match_id, state, updated_at)
  values (p_match, p_transition -> 'server_state', now())
  on conflict (match_id) do update set state = excluded.state, updated_at = now();

  insert into public.match_private_state (match_id, seat, user_id, state)
  select p_match, (ps ->> 'seat')::smallint, mp.user_id, ps -> 'state'
    from jsonb_array_elements(coalesce(p_transition -> 'private_states', '[]'::jsonb)) ps
    join public.match_players mp on mp.match_id = p_match and mp.seat = (ps ->> 'seat')::smallint
  on conflict (match_id, seat) do update set state = excluded.state;
end;
$$;

create or replace function public.engine_create_match(p_lobby uuid, p_user uuid, p_seats uuid[], p_transition jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_checks jsonb;
  v_lobby public.lobbies;
  v_players uuid[];
  v_match uuid;
  v_deadline numeric := (p_transition ->> 'deadline_ms')::numeric;
begin
  perform 1 from public.lobbies where id = p_lobby for update;
  -- Re-validate under the lock: nobody may have left, joined or unreadied.
  v_checks := app_private.engine_start_checks(p_lobby, p_user);
  select * into v_lobby from public.lobbies where id = p_lobby;
  v_players := array(select jsonb_array_elements_text(v_checks -> 'players')::uuid);
  if cardinality(p_seats) <> cardinality(v_players)
     or exists (select unnest(p_seats) except select unnest(v_players)) then
    raise exception 'PV_STALE_STATE';
  end if;
  perform app_private.validate_transition(p_transition, cardinality(p_seats));

  insert into public.matches
    (lobby_id, game_id, mode, ranked, state, settings, active_seats, current_turn_seat,
     turn_seconds, turn_deadline, engine_version)
  values
    (p_lobby, v_lobby.game_id, v_lobby.mode, v_lobby.ranked, p_transition -> 'public_state', v_lobby.settings,
     array(select jsonb_array_elements_text(p_transition -> 'active_seats')::smallint),
     (p_transition ->> 'turn_seat')::smallint,
     least(greatest(coalesce((v_lobby.settings ->> 'turn_seconds')::integer, 60), 5), 3600),
     case when v_deadline is null then null else now() + make_interval(secs => v_deadline / 1000) end,
     (select engine_version from public.game_catalog where id = v_lobby.game_id))
  returning id into v_match;

  insert into public.match_players (match_id, seat, user_id)
  select v_match, (ord - 1)::smallint, uid from unnest(p_seats) with ordinality as t(uid, ord);

  perform app_private.write_engine_states(v_match, p_transition);

  update public.lobbies
     set status = 'in_progress', current_match_id = v_match, last_activity_at = now()
   where id = p_lobby;
  perform app_private.lobby_system_message(p_lobby, 'match_started', jsonb_build_object('match_id', v_match));
  return v_match;
end;
$$;

-- Service role: the full state of a match for the engine.
create or replace function public.engine_load(p_match uuid, p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_match public.matches;
begin
  select * into v_match from public.matches where id = p_match;
  if v_match.id is null or not exists (
    select 1 from public.match_players where match_id = p_match and user_id = p_user
  ) then
    raise exception 'PV_MATCH_NOT_FOUND';
  end if;
  if not app_private.is_engine_game(v_match.game_id) then
    raise exception 'PV_WRONG_GAME';
  end if;
  return jsonb_build_object(
    'match_id', v_match.id,
    'game_id', v_match.game_id,
    'status', v_match.status,
    'version', v_match.version,
    'settings', v_match.settings,
    'seat', (select seat from public.match_players where match_id = p_match and user_id = p_user and left_at is null),
    'seats', (select count(*) from public.match_players where match_id = p_match),
    'absent_seats', coalesce((select jsonb_agg(seat order by seat) from public.match_players
                               where match_id = p_match and left_at is not null), '[]'::jsonb),
    'active_seats', to_jsonb(v_match.active_seats),
    'server_state', (select state from public.match_server_state where match_id = p_match),
    'turn_deadline_ms', (extract(epoch from v_match.turn_deadline) * 1000)::bigint,
    'server_time', (extract(epoch from now()) * 1000)::bigint
  );
end;
$$;

-- Service role: commits one engine transition under the match lock.
--   p_kind: 'action' (a player's move) | 'timeout' (deadline enforcement)
create or replace function public.engine_commit(
  p_match uuid,
  p_user uuid,
  p_expected_version integer,
  p_kind text,
  p_action jsonb,
  p_transition jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.matches;
  v_seat smallint;
  v_seats integer;
  v_deadline numeric := (p_transition ->> 'deadline_ms')::numeric;
  v_outcome jsonb := p_transition -> 'outcome';
begin
  v_match := app_private.lock_match(p_match);
  if v_match.id is null then
    raise exception 'PV_MATCH_NOT_FOUND';
  end if;
  if not app_private.is_engine_game(v_match.game_id) then
    raise exception 'PV_WRONG_GAME';
  end if;
  if v_match.status <> 'active' then
    raise exception 'PV_MATCH_NOT_ACTIVE';
  end if;
  if p_expected_version is distinct from v_match.version then
    raise exception 'PV_STALE_STATE';
  end if;
  select count(*) into v_seats from public.match_players where match_id = p_match;
  perform app_private.validate_transition(p_transition, v_seats);

  select seat into v_seat from public.match_players where match_id = p_match and user_id = p_user and left_at is null;
  if p_kind = 'action' then
    if v_seat is null then
      raise exception 'PV_NOT_A_PLAYER';
    end if;
    if not v_seat = any (v_match.active_seats) then
      raise exception 'PV_NOT_YOUR_TURN';
    end if;
    if v_match.turn_deadline is not null and v_match.turn_deadline <= now() then
      raise exception 'PV_TURN_EXPIRED';
    end if;
  elsif p_kind = 'timeout' then
    if p_user is not null and not exists (select 1 from public.match_players where match_id = p_match and user_id = p_user) then
      raise exception 'PV_NOT_A_PLAYER';
    end if;
    if v_match.turn_deadline is null or v_match.turn_deadline > now() then
      raise exception 'PV_TURN_NOT_EXPIRED';
    end if;
  else
    raise exception 'PV_INVALID_INPUT' using hint = 'kind';
  end if;

  insert into public.match_moves (match_id, move_number, seat, user_id, action)
  values (
    p_match,
    coalesce((select max(move_number) from public.match_moves where match_id = p_match), 0) + 1,
    case when p_kind = 'action' then v_seat end,
    case when p_kind = 'action' then p_user end,
    jsonb_build_object('kind', p_kind, 'action', p_action, 'log', p_transition -> 'log'));

  perform app_private.write_engine_states(p_match, p_transition);

  if v_outcome is not null and jsonb_typeof(v_outcome) = 'object' then
    if v_outcome ->> 'outcome' not in ('win', 'draw', 'completed', 'resignation', 'timeout') then
      raise exception 'PV_INVALID_INPUT' using hint = 'outcome';
    end if;
    perform app_private.finalize_match_results(
      p_match, v_outcome -> 'results', v_outcome ->> 'outcome', p_transition -> 'public_state',
      jsonb_build_object('reason', v_outcome ->> 'reason'));
  else
    update public.matches
       set state = p_transition -> 'public_state',
           version = version + 1,
           active_seats = array(select jsonb_array_elements_text(p_transition -> 'active_seats')::smallint
                                 except select seat from public.match_players where match_id = p_match and left_at is not null),
           current_turn_seat = (p_transition ->> 'turn_seat')::smallint,
           turn_deadline = case when v_deadline is null then null else now() + make_interval(secs => v_deadline / 1000) end
     where id = p_match;
  end if;

  update public.lobbies set last_activity_at = now() where id = v_match.lobby_id;
  return (select version from public.matches where id = p_match);
end;
$$;

revoke all on function public.engine_prepare_start(uuid, uuid) from public, anon, authenticated;
revoke all on function public.engine_create_match(uuid, uuid, uuid[], jsonb) from public, anon, authenticated;
revoke all on function public.engine_load(uuid, uuid) from public, anon, authenticated;
revoke all on function public.engine_commit(uuid, uuid, integer, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function
  public.engine_prepare_start(uuid, uuid),
  public.engine_create_match(uuid, uuid, uuid[], jsonb),
  public.engine_load(uuid, uuid),
  public.engine_commit(uuid, uuid, integer, text, jsonb, jsonb)
to service_role;

-- ---------------------------------------------------------------------------
-- Matchmaking: per-mode settings and engine games
-- ---------------------------------------------------------------------------
create or replace function app_private.try_match(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mine public.matchmaking_tickets;
  v_other public.matchmaking_tickets;
  v_lobby public.lobbies;
  v_game public.game_catalog;
  v_settings jsonb;
  v_match uuid;
  v_attempt integer := 0;
begin
  select * into v_mine from public.matchmaking_tickets where user_id = p_user for update skip locked;
  if v_mine.user_id is null or v_mine.status <> 'searching' then
    return;
  end if;
  if v_mine.expires_at <= now() then
    update public.matchmaking_tickets set status = 'expired' where user_id = p_user;
    return;
  end if;

  select * into v_other
    from public.matchmaking_tickets t
   where t.status = 'searching'
     and t.user_id <> p_user
     and t.game_id = v_mine.game_id
     and t.mode = v_mine.mode
     and t.expires_at > now()
     and abs(t.rating - v_mine.rating)
         <= greatest(app_private.matchmaking_window(t.created_at), app_private.matchmaking_window(v_mine.created_at))
     and not app_private.is_blocked_between(t.user_id, p_user)
     and app_private.is_online(t.user_id)
   order by abs(t.rating - v_mine.rating), t.created_at
   limit 1
   for update skip locked;

  if v_other.user_id is null then
    return;
  end if;

  select * into v_game from public.game_catalog where id = v_mine.game_id;
  v_settings := app_private.normalize_game_settings(v_game.id, coalesce((
    select m -> 'settings' from jsonb_array_elements(v_game.modes) m where m ->> 'id' = v_mine.mode), '{}'::jsonb));

  loop
    v_attempt := v_attempt + 1;
    begin
      insert into public.lobbies
        (code, host_id, game_id, mode, visibility, max_players, allow_spectators, ranked, source, settings, status)
      values
        (app_private.generate_code(6), v_other.user_id, v_mine.game_id, v_mine.mode, 'private', 2, true, true,
         'matchmaking', v_settings, 'ready')
      returning * into v_lobby;
      exit;
    exception when unique_violation then
      if v_attempt >= 5 then
        raise;
      end if;
    end;
  end loop;

  insert into public.lobby_members (lobby_id, user_id, role, is_ready, joined_at)
  values (v_lobby.id, v_other.user_id, 'player', true, v_other.created_at),
         (v_lobby.id, p_user, 'player', true, v_mine.created_at);

  -- SQL games start right away; engine games are started by the first client
  -- that reaches the room (game-action function), which re-validates it.
  if v_game.network_model = 'turn_based_sql' then
    v_match := app_private.create_match(
      v_lobby.id,
      array(select u from unnest(array[v_other.user_id, p_user]) u order by random()),
      true);
  end if;

  update public.matchmaking_tickets
     set status = 'matched', lobby_id = v_lobby.id, match_id = v_match
   where user_id in (p_user, v_other.user_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Maintenance: engine-aware clock enforcement
-- ---------------------------------------------------------------------------
create or replace function app_private.run_maintenance()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expired_invites integer;
  v_expired_tickets integer;
  v_timeouts integer := 0;
  v_aborted integer := 0;
  v_disconnected integer := 0;
  v_expired_lobbies integer := 0;
  v_row record;
  v_engine boolean;
begin
  update public.lobby_invitations set status = 'expired'
   where status = 'pending' and expires_at <= now();
  get diagnostics v_expired_invites = row_count;

  update public.matchmaking_tickets set status = 'expired'
   where status = 'searching' and expires_at <= now();
  get diagnostics v_expired_tickets = row_count;

  -- SQL games: enforce unclaimed turn clocks after 15 s. Engine games are
  -- normally enforced by clients through the game-action function; if no
  -- client did it within 2 minutes (everyone gone), fall back here.
  for v_row in
    select m.id, m.game_id from public.matches m
     where m.status = 'active' and m.turn_deadline < now() - interval '15 seconds'
  loop
    begin
      v_engine := app_private.is_engine_game(v_row.game_id);
      perform app_private.lock_match(v_row.id);
      if v_engine then
        if exists (select 1 from public.matches where id = v_row.id and status = 'active'
                     and turn_deadline < now() - interval '2 minutes') then
          if (select count(*) from public.match_players where match_id = v_row.id) = 2
             and (select current_turn_seat from public.matches where id = v_row.id) is not null then
            perform app_private.finalize_match(
              v_row.id, (select (1 - current_turn_seat)::smallint from public.matches where id = v_row.id), 'timeout', null);
            v_timeouts := v_timeouts + 1;
          else
            perform app_private.abort_match(v_row.id, 'abandoned');
            v_aborted := v_aborted + 1;
          end if;
        end if;
      elsif exists (select 1 from public.matches where id = v_row.id and status = 'active'
                      and turn_deadline < now() - interval '15 seconds') then
        perform app_private.finalize_match(
          v_row.id, (select (1 - current_turn_seat)::smallint from public.matches where id = v_row.id), 'timeout', null);
        v_timeouts := v_timeouts + 1;
      end if;
    exception when others then
      raise warning 'maintenance: clock enforcement for match % failed: %', v_row.id, sqlerrm;
    end;
  end loop;

  for v_row in
    select lm.lobby_id, lm.user_id
      from public.lobby_members lm
      join public.lobbies l on l.id = lm.lobby_id
      left join public.presence pr on pr.user_id = lm.user_id
     where l.status in ('waiting', 'ready')
       and lm.joined_at < now() - interval '5 minutes'
       and (pr.user_id is null or pr.signed_out_at is not null or pr.heartbeat_at < now() - interval '5 minutes')
  loop
    perform app_private.remove_lobby_member(v_row.lobby_id, v_row.user_id, 'disconnected');
    v_disconnected := v_disconnected + 1;
  end loop;

  for v_row in
    select id from public.lobbies
     where status in ('waiting', 'ready') and last_activity_at < now() - interval '2 hours'
  loop
    perform app_private.close_lobby(v_row.id, 'expired');
    v_expired_lobbies := v_expired_lobbies + 1;
  end loop;

  delete from app_private.rate_limit_events where created_at < now() - interval '1 day';
  delete from public.notifications where read_at is not null and read_at < now() - interval '90 days';
  delete from public.lobby_messages m
   using public.lobbies l
   where l.id = m.lobby_id and l.closed_at is not null and l.closed_at < now() - interval '30 days';

  return jsonb_build_object(
    'expired_invitations', v_expired_invites,
    'expired_tickets', v_expired_tickets,
    'timeouts', v_timeouts,
    'aborted_matches', v_aborted,
    'disconnected_members', v_disconnected,
    'expired_lobbies', v_expired_lobbies);
end;
$$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.match_private_state;
  end if;
end;
$$;
