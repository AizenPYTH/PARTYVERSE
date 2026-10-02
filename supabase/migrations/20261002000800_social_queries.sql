-- PARTYVERSE — Privacy-aware read models: friends + presence, profiles, stats,
-- leaderboards, home overview; account deletion preparation.

-- Presence as seen by a viewer. Activity is derived from real lobby/match
-- membership, never self-declared, so it cannot drift from reality.
--   presence: online | away | dnd | in_game | in_lobby | offline
create or replace function app_private.presence_for(p_viewer uuid, p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_settings public.user_settings;
  v_status text;
  v_match record;
  v_lobby record;
begin
  select * into v_settings from public.user_settings where user_id = p_user;
  select status into v_status from public.presence where user_id = p_user;

  if not coalesce(v_settings.show_presence, true) or v_status = 'invisible' or not app_private.is_online(p_user) then
    return jsonb_build_object('presence', 'offline');
  end if;

  select m.id, m.game_id, m.lobby_id, l.allow_spectators
    into v_match
    from public.match_players mp
    join public.matches m on m.id = mp.match_id
    left join public.lobbies l on l.id = m.lobby_id
   where mp.user_id = p_user and m.status = 'active'
   order by m.started_at desc
   limit 1;
  if v_match.id is not null then
    return jsonb_build_object(
      'presence', 'in_game',
      'game_id', v_match.game_id,
      'lobby_id', case when v_match.allow_spectators and v_settings.allow_join_from_friends
                       then v_match.lobby_id end);
  end if;

  select l.id, l.game_id, l.max_players,
         (select count(*) from public.lobby_members x where x.lobby_id = l.id and x.role = 'player') as players
    into v_lobby
    from public.lobby_members lm
    join public.lobbies l on l.id = lm.lobby_id
   where lm.user_id = p_user and l.status in ('waiting', 'ready')
   order by lm.joined_at desc
   limit 1;
  if v_lobby.id is not null then
    return jsonb_build_object(
      'presence', 'in_lobby',
      'game_id', v_lobby.game_id,
      'lobby_id', case when v_settings.allow_join_from_friends then v_lobby.id end,
      'lobby_player_count', v_lobby.players,
      'lobby_max_players', v_lobby.max_players);
  end if;

  return jsonb_build_object('presence', coalesce(v_status, 'online'));
end;
$$;

create or replace function public.list_friends()
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_id text,
  level integer,
  presence text,
  game_id text,
  lobby_id uuid,
  lobby_player_count integer,
  lobby_max_players integer,
  friends_since timestamptz
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
    with f as (
      select fr.user_high as friend_id, fr.created_at from public.friendships fr where fr.user_low = v_uid
      union all
      select fr.user_low, fr.created_at from public.friendships fr where fr.user_high = v_uid
    ), enriched as (
      select p.id, p.username, p.display_name, p.avatar_id, p.level,
             app_private.presence_for(v_uid, p.id) as pr, f.created_at
        from f join public.profiles p on p.id = f.friend_id
    )
    select e.id, e.username, e.display_name, e.avatar_id, e.level,
           e.pr ->> 'presence', e.pr ->> 'game_id', (e.pr ->> 'lobby_id')::uuid,
           (e.pr ->> 'lobby_player_count')::integer, (e.pr ->> 'lobby_max_players')::integer,
           e.created_at
      from enriched e
     order by case e.pr ->> 'presence'
                when 'online' then 0 when 'in_lobby' then 1 when 'in_game' then 2
                when 'away' then 3 when 'dnd' then 4 else 5 end,
              e.username;
end;
$$;

create or replace function app_private.mutual_friend_count(p_a uuid, p_b uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
    from app_private.friend_ids(p_a) a
   where a in (select app_private.friend_ids(p_b));
$$;

create or replace function public.list_friend_requests()
returns table (
  request_id uuid,
  direction text,
  user_id uuid,
  username text,
  display_name text,
  avatar_id text,
  level integer,
  mutual_friends integer,
  last_game_together text,
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
    select r.id,
           case when r.receiver_id = v_uid then 'incoming' else 'outgoing' end,
           p.id, p.username, p.display_name, p.avatar_id, p.level,
           app_private.mutual_friend_count(v_uid, p.id),
           (select m.game_id
              from public.match_players a
              join public.match_players b on b.match_id = a.match_id and b.user_id = p.id
              join public.matches m on m.id = a.match_id
             where a.user_id = v_uid
             order by m.started_at desc limit 1),
           r.created_at
      from public.friend_requests r
      join public.profiles p on p.id = case when r.receiver_id = v_uid then r.sender_id else r.receiver_id end
     where r.status = 'pending' and v_uid in (r.sender_id, r.receiver_id)
     order by r.created_at desc;
end;
$$;

-- "Amis récemment rencontrés": opponents of the last 30 days who are not friends.
create or replace function public.list_recent_players(p_limit integer default 20)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_id text,
  level integer,
  game_id text,
  last_played_at timestamptz,
  relationship text
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
    select distinct on (p.id) p.id, p.username, p.display_name, p.avatar_id, p.level,
           m.game_id, m.started_at, app_private.relationship(v_uid, p.id)
      from public.match_players me
      join public.matches m on m.id = me.match_id
      join public.match_players o on o.match_id = m.id and o.user_id <> v_uid
      join public.profiles p on p.id = o.user_id
     where me.user_id = v_uid
       and m.started_at > now() - interval '30 days'
       and not app_private.are_friends(v_uid, p.id)
       and not app_private.is_blocked_between(v_uid, p.id)
     order by p.id, m.started_at desc
     limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;

create or replace function public.list_blocked_users()
returns table (user_id uuid, username text, display_name text, avatar_id text, blocked_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
begin
  return query
    select p.id, p.username, p.display_name, p.avatar_id, b.created_at
      from public.blocks b join public.profiles p on p.id = b.blocked_id
     where b.blocker_id = v_uid
     order by b.created_at desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles and stats
-- ---------------------------------------------------------------------------
create or replace function app_private.can_view_stats(p_viewer uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_viewer = p_user
      or exists (select 1 from public.user_settings where user_id = p_user and profile_visibility = 'public')
      or app_private.are_friends(p_viewer, p_user);
$$;

create or replace function app_private.stats_json(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'played', coalesce(sum(s.played), 0),
    'wins', coalesce(sum(s.wins), 0),
    'losses', coalesce(sum(s.losses), 0),
    'draws', coalesce(sum(s.draws), 0),
    'total_seconds', coalesce(sum(s.total_seconds), 0),
    'best_win_streak', coalesce(max(s.best_win_streak), 0),
    'games', coalesce(jsonb_agg(jsonb_build_object(
        'game_id', s.game_id,
        'played', s.played,
        'wins', s.wins,
        'losses', s.losses,
        'draws', s.draws,
        'current_win_streak', s.current_win_streak,
        'best_win_streak', s.best_win_streak,
        'rating', (select r.rating from public.player_ratings r
                    where r.user_id = p_user and r.game_id = s.game_id and r.mode = 'classic'),
        'friends_rank', (
          select 1 + count(*) from public.player_ratings r2
           where r2.game_id = s.game_id and r2.mode = 'classic'
             and r2.user_id in (select app_private.friend_ids(p_user))
             and r2.rating > coalesce((select r.rating from public.player_ratings r
                                        where r.user_id = p_user and r.game_id = s.game_id and r.mode = 'classic'), 0)
        )
      ) order by s.played desc) filter (where s.game_id is not null), '[]'::jsonb)
  )
  from public.player_game_stats s
  where s.user_id = p_user;
$$;

create or replace function public.get_player_profile(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
  v_profile public.profiles;
  v_visible boolean;
begin
  select * into v_profile from public.profiles where id = p_user;
  if v_profile.id is null
     or (v_profile.onboarding_completed_at is null and p_user <> v_uid)
     or exists (select 1 from public.blocks where blocker_id = p_user and blocked_id = v_uid) then
    raise exception 'PV_USER_NOT_FOUND';
  end if;

  v_visible := app_private.can_view_stats(v_uid, p_user);
  return jsonb_build_object(
    'profile', jsonb_build_object(
      'id', v_profile.id,
      'username', v_profile.username,
      'display_name', v_profile.display_name,
      'avatar_id', v_profile.avatar_id,
      'title_id', v_profile.title_id,
      'level', v_profile.level,
      'xp', v_profile.xp,
      'bio', v_profile.bio,
      'favorite_games', to_jsonb(v_profile.favorite_games),
      'created_at', v_profile.created_at
    ),
    'progress', jsonb_build_object(
      'level_start_xp', app_private.xp_for_level(v_profile.level),
      'next_level_xp', app_private.xp_for_level(least(v_profile.level + 1, 100))
    ),
    'relationship', app_private.relationship(v_uid, p_user),
    'mutual_friends', case when v_uid = p_user then 0 else app_private.mutual_friend_count(v_uid, p_user) end,
    'friend_count', (select count(*) from app_private.friend_ids(p_user)),
    'presence', case when v_uid = p_user then null else app_private.presence_for(v_uid, p_user) end,
    'stats_visible', v_visible,
    'stats', case when v_visible then app_private.stats_json(p_user) end
  );
end;
$$;

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
  ended_at timestamptz
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
           o.user_id, p.username, p.avatar_id, m.ended_at
      from public.match_players me
      join public.matches m on m.id = me.match_id
      left join public.match_players o on o.match_id = m.id and o.seat <> me.seat
      left join public.profiles p on p.id = o.user_id
     where me.user_id = v_target and m.status = 'finished'
     order by m.ended_at desc
     limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;

create or replace function public.get_leaderboard(
  p_game_id text,
  p_scope text default 'global',
  p_mode text default 'classic',
  p_limit integer default 50
)
returns table (
  rank bigint,
  user_id uuid,
  username text,
  display_name text,
  avatar_id text,
  level integer,
  rating integer,
  games_played integer,
  is_me boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
begin
  if p_scope not in ('global', 'friends') then
    raise exception 'PV_INVALID_INPUT';
  end if;
  return query
    with ranked as (
      select r.user_id, r.rating, r.games_played,
             rank() over (order by r.rating desc) as rnk
        from public.player_ratings r
       where r.game_id = p_game_id and r.mode = p_mode and r.games_played > 0
         and (p_scope = 'global'
              or r.user_id = v_uid
              or r.user_id in (select app_private.friend_ids(v_uid)))
    )
    select x.rnk, p.id, p.username, p.display_name, p.avatar_id, p.level, x.rating, x.games_played,
           p.id = v_uid
      from ranked x join public.profiles p on p.id = x.user_id
     where x.rnk <= least(greatest(coalesce(p_limit, 50), 1), 100) or x.user_id = v_uid
     order by x.rnk, p.username;
end;
$$;

-- Everything the home screen needs in one round trip.
create or replace function public.get_home_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
  v_profile public.profiles;
begin
  select * into v_profile from public.profiles where id = v_uid;
  return jsonb_build_object(
    'profile', jsonb_build_object(
      'id', v_profile.id,
      'username', v_profile.username,
      'display_name', v_profile.display_name,
      'avatar_id', v_profile.avatar_id,
      'title_id', v_profile.title_id,
      'level', v_profile.level,
      'xp', v_profile.xp,
      'onboarding_completed', v_profile.onboarding_completed_at is not null
    ),
    'progress', jsonb_build_object(
      'level_start_xp', app_private.xp_for_level(v_profile.level),
      'next_level_xp', app_private.xp_for_level(least(v_profile.level + 1, 100))
    ),
    'unread_notifications', (select count(*) from public.notifications where user_id = v_uid and read_at is null),
    'pending_friend_requests', (select count(*) from public.friend_requests where receiver_id = v_uid and status = 'pending'),
    'active_lobby', (select to_jsonb(a) from public.get_my_active_lobby() a limit 1),
    'active_match', (select to_jsonb(a) from public.get_my_active_match() a limit 1)
  );
end;
$$;

-- Called by the delete-account Edge Function (as the user) before the auth
-- user is removed: forfeits active matches, leaves lobbies, clears queues.
create or replace function public.prepare_account_deletion()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
  v_lobby uuid;
begin
  update public.matchmaking_tickets set status = 'cancelled' where user_id = v_uid and status = 'searching';
  for v_lobby in select lobby_id from public.lobby_members where user_id = v_uid loop
    perform app_private.remove_lobby_member(v_lobby, v_uid, 'left');
  end loop;
  update public.presence set signed_out_at = now() where user_id = v_uid;
end;
$$;

grant execute on function
  public.list_friends(),
  public.list_friend_requests(),
  public.list_recent_players(integer),
  public.list_blocked_users(),
  public.get_player_profile(uuid),
  public.list_match_history(uuid, integer),
  public.get_leaderboard(text, text, text, integer),
  public.get_home_overview(),
  public.prepare_account_deletion()
to authenticated;
