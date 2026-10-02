-- PARTYVERSE — Matches, authoritative Connect Four engine, results, ratings, stats, XP
--
-- Turn-based games run as SQL commands: each move locks the match row, checks
-- the expected version, validates the move against the authoritative state,
-- persists it and resolves the outcome in one transaction. Clients never send
-- results; they only send intents (drop a token in column N).

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid references public.lobbies (id) on delete set null,
  game_id text not null references public.game_catalog (id),
  mode text not null default 'classic',
  ranked boolean not null default false,
  status text not null default 'active' check (status in ('active', 'finished', 'aborted')),
  -- Public game state. Secret per-player state (future games) lives elsewhere.
  state jsonb not null,
  -- Incremented on every state change; clients send it back to detect races.
  version integer not null default 0,
  current_turn_seat smallint,
  turn_seconds integer not null check (turn_seconds between 5 and 3600),
  turn_deadline timestamptz,
  outcome text check (outcome in ('win', 'draw', 'resignation', 'timeout', 'abandon')),
  winner_seat smallint,
  engine_version integer not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  constraint matches_finished_consistency check (
    (status = 'active' and ended_at is null and outcome is null)
    or (status <> 'active' and ended_at is not null)
  )
);
create index matches_lobby_idx on public.matches (lobby_id, started_at desc);
create index matches_active_deadline_idx on public.matches (turn_deadline) where status = 'active';

alter table public.lobbies
  add constraint lobbies_current_match_fk
  foreign key (current_match_id) references public.matches (id) on delete set null;

create table public.match_players (
  match_id uuid not null references public.matches (id) on delete cascade,
  seat smallint not null check (seat >= 0),
  user_id uuid references public.profiles (id) on delete set null,
  result text check (result in ('win', 'loss', 'draw')),
  rating_before integer,
  rating_after integer,
  xp_awarded integer not null default 0,
  primary key (match_id, seat),
  unique (match_id, user_id)
);
create index match_players_user_idx on public.match_players (user_id, match_id);

create table public.match_moves (
  match_id uuid not null references public.matches (id) on delete cascade,
  move_number integer not null check (move_number >= 1),
  seat smallint not null,
  user_id uuid references public.profiles (id) on delete set null,
  action jsonb not null,
  created_at timestamptz not null default now(),
  primary key (match_id, move_number)
);

create table public.player_ratings (
  user_id uuid not null references public.profiles (id) on delete cascade,
  game_id text not null references public.game_catalog (id),
  mode text not null default 'classic',
  rating integer not null default 1200,
  peak_rating integer not null default 1200,
  games_played integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, game_id, mode)
);
create index player_ratings_leaderboard_idx on public.player_ratings (game_id, mode, rating desc);

create table public.player_game_stats (
  user_id uuid not null references public.profiles (id) on delete cascade,
  game_id text not null references public.game_catalog (id),
  played integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  draws integer not null default 0,
  current_win_streak integer not null default 0,
  best_win_streak integer not null default 0,
  total_seconds bigint not null default 0,
  last_played_at timestamptz,
  primary key (user_id, game_id)
);

-- ---------------------------------------------------------------------------
-- Visibility
-- ---------------------------------------------------------------------------
create or replace function app_private.can_view_match(p_match uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.match_players where match_id = p_match and user_id = p_user)
      or exists (select 1 from public.matches m
                  where m.id = p_match and m.lobby_id is not null
                    and app_private.is_lobby_member(m.lobby_id, p_user));
$$;
grant execute on function app_private.can_view_match(uuid, uuid) to authenticated;

alter table public.matches enable row level security;
alter table public.match_players enable row level security;
alter table public.match_moves enable row level security;
alter table public.player_ratings enable row level security;
alter table public.player_game_stats enable row level security;
revoke all on public.matches, public.match_players, public.match_moves, public.player_ratings,
              public.player_game_stats from anon, authenticated;
grant select on public.matches, public.match_players, public.match_moves, public.player_ratings
  to authenticated;
grant select on public.player_game_stats to authenticated;

create policy "Participants and spectators read matches" on public.matches
  for select to authenticated using (app_private.can_view_match(id, auth.uid()));
create policy "Participants and spectators read match players" on public.match_players
  for select to authenticated using (app_private.can_view_match(match_id, auth.uid()));
create policy "Participants and spectators read moves" on public.match_moves
  for select to authenticated using (app_private.can_view_match(match_id, auth.uid()));
-- Ratings are a public ladder.
create policy "Ratings are public to players" on public.player_ratings
  for select to authenticated using (true);
-- Detailed stats: own rows only; others go through privacy-aware RPCs.
create policy "Players read their own stats" on public.player_game_stats
  for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Connect Four engine (mirrored for display in src/features/games/connect-four/engine.ts;
-- conformance is checked by tests/db/connect-four.test.ts against shared vectors)
-- State: { "columns": [[seat, ...] x7 bottom→top], "move_count": n, "winning_cells": [[col,row]...] }
-- ---------------------------------------------------------------------------
create or replace function app_private.c4_cell(p_columns jsonb, p_col integer, p_row integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_col between 0 and 6 and p_row between 0 and 5
         and p_row < jsonb_array_length(p_columns -> p_col)
      then (p_columns -> p_col ->> p_row)::integer
    else -1
  end;
$$;

-- Returns the winning line through (col,row) for seat, or null.
create or replace function app_private.c4_winning_cells(
  p_columns jsonb, p_col integer, p_row integer, p_seat integer
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_dirs constant integer[][] := array[[1, 0], [0, 1], [1, 1], [1, -1]];
  v_cells jsonb;
  v_dc integer;
  v_dr integer;
  v_sign integer;
  v_c integer;
  v_r integer;
begin
  for i in 1 .. 4 loop
    v_dc := v_dirs[i][1];
    v_dr := v_dirs[i][2];
    v_cells := jsonb_build_array(jsonb_build_array(p_col, p_row));
    foreach v_sign in array array[1, -1] loop
      v_c := p_col + v_dc * v_sign;
      v_r := p_row + v_dr * v_sign;
      while app_private.c4_cell(p_columns, v_c, v_r) = p_seat loop
        v_cells := v_cells || jsonb_build_array(jsonb_build_array(v_c, v_r));
        v_c := v_c + v_dc * v_sign;
        v_r := v_r + v_dr * v_sign;
      end loop;
    end loop;
    if jsonb_array_length(v_cells) >= 4 then
      return v_cells;
    end if;
  end loop;
  return null;
end;
$$;

create or replace function app_private.initial_match_state(p_game_id text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
begin
  case p_game_id
    when 'connect_four' then
      return '{"columns":[[],[],[],[],[],[],[]],"move_count":0,"winning_cells":[],"last_move":null}'::jsonb;
    else
      raise exception 'PV_GAME_NOT_PLAYABLE';
  end case;
end;
$$;

-- ---------------------------------------------------------------------------
-- Match creation
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
  v_turn_seconds := coalesce((v_lobby.settings ->> 'turn_seconds')::integer, 60);

  insert into public.matches
    (lobby_id, game_id, ranked, state, current_turn_seat, turn_seconds, turn_deadline, engine_version)
  values
    (p_lobby, v_game.id, p_ranked, app_private.initial_match_state(v_game.id), 0, v_turn_seconds,
     now() + make_interval(secs => v_turn_seconds), v_game.engine_version)
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

-- Seat 0 moves first. In a rematch the previous loser starts; after a draw the
-- previous second player starts; otherwise the order is random.
create or replace function app_private.seat_order(p_lobby uuid, p_players uuid[])
returns uuid[]
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_last record;
  v_first uuid;
begin
  select m.id, m.winner_seat into v_last
    from public.matches m
   where m.lobby_id = p_lobby and m.status = 'finished'
   order by m.ended_at desc
   limit 1;

  if v_last.id is not null and cardinality(p_players) = 2 and not exists (
    select unnest(p_players) except select user_id from public.match_players where match_id = v_last.id
  ) then
    select user_id into v_first
      from public.match_players
     where match_id = v_last.id
       and seat = case when v_last.winner_seat is null then 1 else 1 - v_last.winner_seat end;
    return array[v_first] || array(select u from unnest(p_players) u where u <> v_first);
  end if;

  return array(select u from unnest(p_players) u order by random());
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

create or replace function public.start_lobby_match(p_lobby uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
begin
  perform app_private.require_lobby_host(p_lobby, v_uid);
  return app_private.start_lobby_match_internal(p_lobby);
end;
$$;

-- ---------------------------------------------------------------------------
-- Results: ratings, stats, XP
-- ---------------------------------------------------------------------------
create or replace function app_private.apply_elo(p_match uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.matches;
  v_a record;
  v_b record;
  v_ra integer;
  v_rb integer;
  v_ga integer;
  v_gb integer;
  v_sa numeric;
  v_ea numeric;
  v_na integer;
  v_nb integer;
begin
  select * into v_match from public.matches where id = p_match;
  select * into v_a from public.match_players where match_id = p_match and seat = 0;
  select * into v_b from public.match_players where match_id = p_match and seat = 1;
  if v_a.user_id is null or v_b.user_id is null then
    return;
  end if;

  insert into public.player_ratings (user_id, game_id, mode)
  values (v_a.user_id, v_match.game_id, v_match.mode), (v_b.user_id, v_match.game_id, v_match.mode)
  on conflict do nothing;

  -- Lock both rows in a deterministic order to avoid deadlocks.
  perform 1 from public.player_ratings
   where game_id = v_match.game_id and mode = v_match.mode and user_id in (v_a.user_id, v_b.user_id)
   order by user_id
   for update;

  select rating, games_played into v_ra, v_ga from public.player_ratings
   where user_id = v_a.user_id and game_id = v_match.game_id and mode = v_match.mode;
  select rating, games_played into v_rb, v_gb from public.player_ratings
   where user_id = v_b.user_id and game_id = v_match.game_id and mode = v_match.mode;

  v_sa := case v_a.result when 'win' then 1 when 'draw' then 0.5 else 0 end;
  v_ea := 1 / (1 + power(10::numeric, (v_rb - v_ra) / 400.0));
  v_na := round(v_ra + (case when v_ga < 20 then 40 else 24 end) * (v_sa - v_ea));
  v_nb := round(v_rb + (case when v_gb < 20 then 40 else 24 end) * ((1 - v_sa) - (1 - v_ea)));

  update public.player_ratings
     set rating = v_na, peak_rating = greatest(peak_rating, v_na), games_played = games_played + 1, updated_at = now()
   where user_id = v_a.user_id and game_id = v_match.game_id and mode = v_match.mode;
  update public.player_ratings
     set rating = v_nb, peak_rating = greatest(peak_rating, v_nb), games_played = games_played + 1, updated_at = now()
   where user_id = v_b.user_id and game_id = v_match.game_id and mode = v_match.mode;

  update public.match_players set rating_before = v_ra, rating_after = v_na where match_id = p_match and seat = 0;
  update public.match_players set rating_before = v_rb, rating_after = v_nb where match_id = p_match and seat = 1;
end;
$$;

create or replace function app_private.record_stats(p_user uuid, p_game text, p_result text, p_seconds bigint)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.player_game_stats as s
    (user_id, game_id, played, wins, losses, draws, current_win_streak, best_win_streak, total_seconds, last_played_at)
  values
    (p_user, p_game, 1,
     (p_result = 'win')::integer, (p_result = 'loss')::integer, (p_result = 'draw')::integer,
     (p_result = 'win')::integer, (p_result = 'win')::integer, p_seconds, now())
  on conflict (user_id, game_id) do update
    set played = s.played + 1,
        wins = s.wins + (p_result = 'win')::integer,
        losses = s.losses + (p_result = 'loss')::integer,
        draws = s.draws + (p_result = 'draw')::integer,
        current_win_streak = case when p_result = 'win' then s.current_win_streak + 1 else 0 end,
        best_win_streak = greatest(s.best_win_streak,
                                   case when p_result = 'win' then s.current_win_streak + 1 else 0 end),
        total_seconds = s.total_seconds + p_seconds,
        last_played_at = now();
$$;

-- XP policy (docs/game-design/progression.md): win 40, draw 20, loss 10.
-- Anti-farming: no XP for matches decided before 4 moves without a natural
-- finish, 30 rewarded matches per day, 10 per day against the same opponent.
create or replace function app_private.match_xp(p_match uuid, p_user uuid, p_result text)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_match public.matches;
  v_today integer;
  v_same_opponent integer;
begin
  select * into v_match from public.matches where id = p_match;

  if v_match.outcome in ('resignation', 'timeout', 'abandon')
     and coalesce((v_match.state ->> 'move_count')::integer, 0) < 4 then
    return 0;
  end if;

  select count(*) into v_today
    from public.xp_events
   where user_id = p_user and source = 'match' and amount > 0
     and created_at > date_trunc('day', now());
  if v_today >= 30 then
    return 0;
  end if;

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
end;
$$;

-- Ends a locked active match and applies every consequence atomically.
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
declare
  v_match public.matches;
  v_player record;
  v_seconds bigint;
  v_xp integer;
begin
  update public.matches
     set status = 'finished',
         outcome = p_outcome,
         winner_seat = p_winner_seat,
         state = coalesce(p_state, state),
         current_turn_seat = null,
         turn_deadline = null,
         ended_at = now(),
         version = version + 1
   where id = p_match and status = 'active'
  returning * into v_match;
  if v_match.id is null then
    raise exception 'PV_MATCH_NOT_ACTIVE';
  end if;

  update public.match_players
     set result = case when p_winner_seat is null then 'draw'
                       when seat = p_winner_seat then 'win'
                       else 'loss' end
   where match_id = p_match;

  if v_match.ranked then
    perform app_private.apply_elo(p_match);
  end if;

  v_seconds := greatest(extract(epoch from (v_match.ended_at - v_match.started_at))::bigint, 0);
  for v_player in
    select user_id, result from public.match_players where match_id = p_match and user_id is not null
  loop
    perform app_private.record_stats(v_player.user_id, v_match.game_id, v_player.result, v_seconds);
    v_xp := app_private.award_xp(
      v_player.user_id, 'match', p_match,
      app_private.match_xp(p_match, v_player.user_id, v_player.result),
      v_match.game_id || ':' || v_player.result);
    update public.match_players set xp_awarded = v_xp where match_id = p_match and user_id = v_player.user_id;
  end loop;

  if v_match.lobby_id is not null then
    -- Back to the lobby for a rematch. Ranked lobbies turn casual so a rematch
    -- between the same two players cannot be used to farm rating.
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
      'winner_user_id', (select user_id from public.match_players where match_id = p_match and seat = p_winner_seat)));
  end if;
end;
$$;

-- Lock order is always lobby → match, everywhere, to rule out deadlocks between
-- concurrent moves and lobby departures.
create or replace function app_private.lock_match(p_match uuid)
returns public.matches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lobby uuid;
  v_match public.matches;
begin
  select lobby_id into v_lobby from public.matches where id = p_match;
  if v_lobby is not null then
    perform 1 from public.lobbies where id = v_lobby for update;
  end if;
  select * into v_match from public.matches where id = p_match for update;
  return v_match;
end;
$$;

-- Two-player forfeit: the other seat wins.
create or replace function app_private.forfeit_match(p_match uuid, p_user uuid, p_outcome text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.matches;
  v_seat smallint;
begin
  v_match := app_private.lock_match(p_match);
  if v_match.id is null or v_match.status <> 'active' then
    return;
  end if;
  select seat into v_seat from public.match_players where match_id = p_match and user_id = p_user;
  if v_seat is null then
    raise exception 'PV_NOT_A_PLAYER';
  end if;
  perform app_private.finalize_match(p_match, (1 - v_seat)::smallint, p_outcome, null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Match RPCs
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
begin
  select * into v_match from public.matches where id = p_match;
  if v_match.id is null or not app_private.can_view_match(p_match, v_uid) then
    raise exception 'PV_MATCH_NOT_FOUND';
  end if;

  select count(*) into v_round
    from public.matches m
   where m.lobby_id = v_match.lobby_id and m.started_at <= v_match.started_at;

  return jsonb_build_object(
    'match', jsonb_build_object(
      'id', v_match.id,
      'lobby_id', v_match.lobby_id,
      'game_id', v_match.game_id,
      'mode', v_match.mode,
      'ranked', v_match.ranked,
      'status', v_match.status,
      'state', v_match.state,
      'version', v_match.version,
      'current_turn_seat', v_match.current_turn_seat,
      'turn_seconds', v_match.turn_seconds,
      'turn_deadline', v_match.turn_deadline,
      'outcome', v_match.outcome,
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
               'rating_before', mp.rating_before,
               'rating_after', mp.rating_after,
               'xp_awarded', mp.xp_awarded,
               'win_streak', coalesce(s.current_win_streak, 0),
               'series_wins', (
                  select count(*) from public.matches m2
                    join public.match_players w on w.match_id = m2.id and w.seat = m2.winner_seat
                   where m2.lobby_id = v_match.lobby_id and m2.status = 'finished'
                     and m2.started_at <= v_match.started_at and w.user_id = mp.user_id),
               'is_online', case when mp.user_id is null then false else app_private.is_online(mp.user_id) end
             ) order by mp.seat)
        from public.match_players mp
        left join public.profiles p on p.id = mp.user_id
        left join public.player_game_stats s on s.user_id = mp.user_id and s.game_id = v_match.game_id
       where mp.match_id = p_match
    ), '[]'::jsonb),
    'my_seat', (select seat from public.match_players where match_id = p_match and user_id = v_uid),
    'server_time', now()
  );
end;
$$;

create or replace function public.submit_connect_four_move(
  p_match uuid,
  p_column integer,
  p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
  v_match public.matches;
  v_seat smallint;
  v_columns jsonb;
  v_row integer;
  v_move_count integer;
  v_win jsonb;
  v_state jsonb;
begin
  v_match := app_private.lock_match(p_match);
  if v_match.id is null or not app_private.can_view_match(p_match, v_uid) then
    raise exception 'PV_MATCH_NOT_FOUND';
  end if;
  if v_match.game_id <> 'connect_four' then
    raise exception 'PV_WRONG_GAME';
  end if;
  if v_match.status <> 'active' then
    raise exception 'PV_MATCH_NOT_ACTIVE';
  end if;

  select seat into v_seat from public.match_players where match_id = p_match and user_id = v_uid;
  if v_seat is null then
    raise exception 'PV_NOT_A_PLAYER';
  end if;
  if p_expected_version is distinct from v_match.version then
    raise exception 'PV_STALE_STATE';
  end if;
  if v_seat <> v_match.current_turn_seat then
    raise exception 'PV_NOT_YOUR_TURN';
  end if;
  if v_match.turn_deadline <= now() then
    raise exception 'PV_TURN_EXPIRED';
  end if;
  if p_column is null or p_column not between 0 and 6 then
    raise exception 'PV_INVALID_MOVE';
  end if;

  v_columns := v_match.state -> 'columns';
  v_row := jsonb_array_length(v_columns -> p_column);
  if v_row >= 6 then
    raise exception 'PV_COLUMN_FULL';
  end if;

  v_columns := jsonb_set(v_columns, array[p_column::text], (v_columns -> p_column) || to_jsonb(v_seat));
  v_move_count := (v_match.state ->> 'move_count')::integer + 1;

  insert into public.match_moves (match_id, move_number, seat, user_id, action)
  values (p_match, v_move_count, v_seat, v_uid, jsonb_build_object('column', p_column, 'row', v_row));

  v_win := app_private.c4_winning_cells(v_columns, p_column, v_row, v_seat);
  v_state := jsonb_build_object(
    'columns', v_columns,
    'move_count', v_move_count,
    'winning_cells', coalesce(v_win, '[]'::jsonb),
    'last_move', jsonb_build_object('column', p_column, 'row', v_row, 'seat', v_seat)
  );

  if v_win is not null then
    perform app_private.finalize_match(p_match, v_seat, 'win', v_state);
  elsif v_move_count >= 42 then
    perform app_private.finalize_match(p_match, null, 'draw', v_state);
  else
    update public.matches
       set state = v_state,
           version = version + 1,
           current_turn_seat = 1 - v_seat,
           turn_deadline = now() + make_interval(secs => turn_seconds)
     where id = p_match;
    update public.lobbies set last_activity_at = now() where id = v_match.lobby_id;
  end if;

  return public.get_match_state(p_match);
end;
$$;

create or replace function public.resign_match(p_match uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
  v_status text;
begin
  select status into v_status from public.matches where id = p_match;
  if v_status is null or not exists (select 1 from public.match_players where match_id = p_match and user_id = v_uid) then
    raise exception 'PV_MATCH_NOT_FOUND';
  end if;
  if v_status <> 'active' then
    raise exception 'PV_MATCH_NOT_ACTIVE';
  end if;
  perform app_private.forfeit_match(p_match, v_uid, 'resignation');
  return public.get_match_state(p_match);
end;
$$;

-- The server clock is the authority. Any participant may ask the server to
-- enforce an expired turn; the player on turn loses.
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
  if v_match.status = 'active' then
    if v_match.turn_deadline > now() then
      raise exception 'PV_TURN_NOT_EXPIRED';
    end if;
    perform app_private.finalize_match(p_match, (1 - v_match.current_turn_seat)::smallint, 'timeout', null);
  end if;
  return public.get_match_state(p_match);
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
    select m.id, m.lobby_id, m.game_id, (m.current_turn_seat = me.seat),
           coalesce((m.state ->> 'move_count')::integer, 0),
           (select p.username from public.match_players o join public.profiles p on p.id = o.user_id
             where o.match_id = m.id and o.seat <> me.seat order by o.seat limit 1)
      from public.match_players me
      join public.matches m on m.id = me.match_id
     where me.user_id = v_uid and m.status = 'active'
     order by m.started_at desc
     limit 1;
end;
$$;

grant execute on function
  public.start_lobby_match(uuid),
  public.get_match_state(uuid),
  public.submit_connect_four_move(uuid, integer, integer),
  public.resign_match(uuid),
  public.claim_match_timeout(uuid),
  public.get_my_active_match()
to authenticated;
