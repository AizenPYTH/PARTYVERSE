-- PARTYVERSE — Progression: achievements, daily/weekly quests, play streak,
-- XP leaderboard. Everything is computed server-side from real matches.
--
-- Anti-abuse: only "counted" matches feed quests and achievements — finished
-- matches with at least two moves by players (an instant resignation or an
-- abandoned room does not count). Progress is always recomputed from the
-- source tables (never incremented by the client), and rewards are paid
-- through award_xp with a deterministic reference, so a claim is paid once.

alter table public.xp_events drop constraint xp_events_source_check;
alter table public.xp_events add constraint xp_events_source_check
  check (source in ('match', 'quest', 'event', 'tournament', 'grant', 'achievement'));

-- ---------------------------------------------------------------------------
-- Counted matches
-- ---------------------------------------------------------------------------
create or replace function app_private.counted_matches(p_user uuid, p_since timestamptz)
returns table (match_id uuid, game_id text, result text, ended_at timestamptz, with_friend boolean, party_round boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.game_id, mp.result, m.ended_at,
         exists (select 1 from public.match_players o
                  where o.match_id = m.id and o.user_id <> p_user and app_private.are_friends(p_user, o.user_id)),
         exists (select 1 from public.party_rounds r where r.match_id = m.id)
    from public.match_players mp
    join public.matches m on m.id = mp.match_id
   where mp.user_id = p_user
     and m.status = 'finished'
     and m.ended_at >= p_since
     and (select count(*) from public.match_moves mv where mv.match_id = m.id and mv.user_id is not null) >= 2;
$$;

-- Consecutive UTC days, ending today or yesterday, with at least one counted match.
create or replace function app_private.play_streak(p_user uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days date[];
  v_day date := (now() at time zone 'UTC')::date;
  v_streak integer := 0;
begin
  select array_agg(distinct (c.ended_at at time zone 'UTC')::date)
    into v_days
    from app_private.counted_matches(p_user, now() - interval '400 days') c;
  if v_days is null then
    return 0;
  end if;
  if not v_day = any (v_days) then
    v_day := v_day - 1;
  end if;
  while v_day = any (v_days) loop
    v_streak := v_streak + 1;
    v_day := v_day - 1;
  end loop;
  return v_streak;
end;
$$;

-- ---------------------------------------------------------------------------
-- Achievements
-- ---------------------------------------------------------------------------
create table public.achievements (
  id text primary key,
  name text not null,
  description text not null,
  category text not null check (category in ('games', 'mastery', 'social', 'party')),
  metric text not null check (metric in (
    'matches', 'wins', 'distinct_games', 'best_streak', 'friends', 'groups', 'party_wins', 'level', 'rating_peak', 'play_streak'
  )),
  threshold integer not null check (threshold > 0),
  reward_xp integer not null check (reward_xp between 0 and 1000),
  sort_order integer not null default 0
);

create table public.player_achievements (
  user_id uuid not null references public.profiles (id) on delete cascade,
  achievement_id text not null references public.achievements (id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

alter table public.achievements enable row level security;
alter table public.player_achievements enable row level security;
revoke all on public.achievements, public.player_achievements from anon, authenticated;
grant select on public.achievements, public.player_achievements to authenticated;
create policy "Achievements are public to players" on public.achievements for select to authenticated using (true);
create policy "Players read their own achievements" on public.player_achievements
  for select to authenticated using (user_id = auth.uid());

insert into public.achievements (id, name, description, category, metric, threshold, reward_xp, sort_order) values
  ('first_match', 'Premiers pas', 'Termine ta première partie.', 'games', 'matches', 1, 20, 10),
  ('matches_10', 'Habitué', 'Termine 10 parties.', 'games', 'matches', 10, 50, 11),
  ('matches_50', 'Pilier du salon', 'Termine 50 parties.', 'games', 'matches', 50, 150, 12),
  ('matches_200', 'Infatigable', 'Termine 200 parties.', 'games', 'matches', 200, 400, 13),
  ('first_win', 'Première victoire', 'Gagne une partie.', 'mastery', 'wins', 1, 30, 20),
  ('wins_10', 'Compétiteur', 'Gagne 10 parties.', 'mastery', 'wins', 10, 80, 21),
  ('wins_50', 'Redoutable', 'Gagne 50 parties.', 'mastery', 'wins', 50, 200, 22),
  ('wins_200', 'Légende', 'Gagne 200 parties.', 'mastery', 'wins', 200, 500, 23),
  ('streak_5', 'Inarrêtable', 'Enchaîne 5 victoires dans un même jeu.', 'mastery', 'best_streak', 5, 120, 24),
  ('rating_1300', 'Classé', 'Atteins 1300 Elo dans un mode classé.', 'mastery', 'rating_peak', 1300, 150, 25),
  ('explorer_5', 'Explorateur', 'Joue à 5 jeux différents.', 'games', 'distinct_games', 5, 80, 30),
  ('explorer_10', 'Touche-à-tout', 'Joue à 10 jeux différents.', 'games', 'distinct_games', 10, 200, 31),
  ('daily_3', 'Rituel', 'Joue 3 jours d’affilée.', 'games', 'play_streak', 3, 60, 32),
  ('daily_7', 'Assidu', 'Joue 7 jours d’affilée.', 'games', 'play_streak', 7, 150, 33),
  ('friends_5', 'Bien entouré', 'Compte 5 amis.', 'social', 'friends', 5, 60, 40),
  ('group_member', 'Esprit d’équipe', 'Rejoins ou crée un groupe.', 'social', 'groups', 1, 40, 41),
  ('party_winner', 'Roi de la Party', 'Termine premier d’une Party.', 'party', 'party_wins', 1, 100, 50),
  ('level_10', 'Niveau 10', 'Atteins le niveau 10.', 'mastery', 'level', 10, 100, 60),
  ('level_25', 'Niveau 25', 'Atteins le niveau 25.', 'mastery', 'level', 25, 250, 61);

create or replace function app_private.player_metrics(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with counted as (select * from app_private.counted_matches(p_user, '-infinity'))
  select jsonb_build_object(
    'matches', (select count(*) from counted),
    'wins', (select count(*) from counted where result = 'win'),
    'distinct_games', (select count(distinct game_id) from counted),
    'best_streak', coalesce((select max(best_win_streak) from public.player_game_stats where user_id = p_user), 0),
    'friends', (select count(*) from app_private.friend_ids(p_user)),
    'groups', (select count(*) from public.group_members where user_id = p_user),
    'party_wins', (
      select count(*) from public.party_sessions s
       where s.status = 'finished' and s.current_round > 0
         and exists (select 1 from public.party_scores me where me.session_id = s.id and me.user_id = p_user
                       and me.points = (select max(points) from public.party_scores x where x.session_id = s.id))),
    'level', (select level from public.profiles where id = p_user),
    'rating_peak', coalesce((select max(rating) from public.player_ratings where user_id = p_user and games_played > 0), 0),
    'play_streak', app_private.play_streak(p_user));
$$;

-- Unlocks every reached achievement once and pays its reward.
create or replace function app_private.evaluate_achievements(p_user uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_metrics jsonb := app_private.player_metrics(p_user);
  v_achievement record;
  v_unlocked integer := 0;
begin
  for v_achievement in
    select a.* from public.achievements a
     where not exists (select 1 from public.player_achievements pa where pa.user_id = p_user and pa.achievement_id = a.id)
       and coalesce((v_metrics ->> a.metric)::integer, 0) >= a.threshold
     order by a.sort_order
  loop
    insert into public.player_achievements (user_id, achievement_id) values (p_user, v_achievement.id)
    on conflict do nothing;
    if found then
      v_unlocked := v_unlocked + 1;
      perform app_private.award_xp(p_user, 'achievement', md5(p_user::text || ':' || v_achievement.id)::uuid,
                                   v_achievement.reward_xp, v_achievement.id);
      perform app_private.notify(p_user, 'achievement', null,
        jsonb_build_object('achievement_id', v_achievement.id, 'name', v_achievement.name));
    end if;
  end loop;
  return v_unlocked;
end;
$$;

-- ---------------------------------------------------------------------------
-- Quests
-- ---------------------------------------------------------------------------
create table public.quest_definitions (
  id text primary key,
  period text not null check (period in ('daily', 'weekly')),
  name text not null,
  metric text not null check (metric in ('matches', 'wins', 'distinct_games', 'friend_matches', 'party_rounds')),
  target integer not null check (target > 0),
  reward_xp integer not null check (reward_xp between 1 and 1000),
  active boolean not null default true
);

create table public.player_quest_claims (
  user_id uuid not null references public.profiles (id) on delete cascade,
  quest_id text not null references public.quest_definitions (id) on delete cascade,
  period_key date not null,
  claimed_at timestamptz not null default now(),
  primary key (user_id, quest_id, period_key)
);

alter table public.quest_definitions enable row level security;
alter table public.player_quest_claims enable row level security;
revoke all on public.quest_definitions, public.player_quest_claims from anon, authenticated;
grant select on public.quest_definitions, public.player_quest_claims to authenticated;
create policy "Quest catalog is public to players" on public.quest_definitions for select to authenticated using (true);
create policy "Players read their own claims" on public.player_quest_claims
  for select to authenticated using (user_id = auth.uid());

insert into public.quest_definitions (id, period, name, metric, target, reward_xp) values
  ('d_play_3', 'daily', 'Joue 3 parties', 'matches', 3, 40),
  ('d_win_1', 'daily', 'Gagne une partie', 'wins', 1, 40),
  ('d_win_2', 'daily', 'Gagne 2 parties', 'wins', 2, 60),
  ('d_variety_2', 'daily', 'Joue à 2 jeux différents', 'distinct_games', 2, 50),
  ('d_friend_1', 'daily', 'Joue une partie avec un ami', 'friend_matches', 1, 50),
  ('d_play_5', 'daily', 'Joue 5 parties', 'matches', 5, 70),
  ('w_play_15', 'weekly', 'Joue 15 parties', 'matches', 15, 150),
  ('w_win_8', 'weekly', 'Gagne 8 parties', 'wins', 8, 200),
  ('w_variety_5', 'weekly', 'Joue à 5 jeux différents', 'distinct_games', 5, 180),
  ('w_friend_5', 'weekly', 'Joue 5 parties avec des amis', 'friend_matches', 5, 180),
  ('w_party_3', 'weekly', 'Joue 3 manches de Party', 'party_rounds', 3, 150);

create or replace function app_private.quest_period_start(p_period text)
returns date
language sql
stable
set search_path = ''
as $$
  select case p_period
           when 'daily' then (now() at time zone 'UTC')::date
           else (date_trunc('week', now() at time zone 'UTC'))::date
         end;
$$;

-- The player's quests of the current day/week: 3 per period, a personal and
-- deterministic rotation of the pool.
create or replace function app_private.assigned_quests(p_user uuid)
returns table (quest_id text, period text, period_key date)
language sql
stable
security definer
set search_path = ''
as $$
  select q.id, q.period, app_private.quest_period_start(q.period)
    from (select q.*, row_number() over (
                   partition by q.period
                   order by md5(p_user::text || ':' || q.id || ':' || app_private.quest_period_start(q.period)::text)) as n
            from public.quest_definitions q where q.active) q
   where q.n <= 3;
$$;

create or replace function app_private.quest_progress(p_user uuid, p_metric text, p_since date)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case p_metric
           when 'matches' then count(*)
           when 'wins' then count(*) filter (where result = 'win')
           when 'distinct_games' then count(distinct game_id)
           when 'friend_matches' then count(*) filter (where with_friend)
           when 'party_rounds' then count(*) filter (where party_round)
         end::integer
    from app_private.counted_matches(p_user, p_since::timestamptz);
$$;

create or replace function public.claim_quest(p_quest text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
  v_assigned record;
  v_quest public.quest_definitions;
begin
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':quest', 0));
  select * into v_assigned from app_private.assigned_quests(v_uid) a where a.quest_id = p_quest;
  if v_assigned.quest_id is null then
    raise exception 'PV_QUEST_NOT_FOUND';
  end if;
  select * into v_quest from public.quest_definitions where id = p_quest;
  if exists (select 1 from public.player_quest_claims where user_id = v_uid and quest_id = p_quest and period_key = v_assigned.period_key) then
    raise exception 'PV_ALREADY_DONE';
  end if;
  if app_private.quest_progress(v_uid, v_quest.metric, v_assigned.period_key) < v_quest.target then
    raise exception 'PV_QUEST_INCOMPLETE';
  end if;
  insert into public.player_quest_claims (user_id, quest_id, period_key) values (v_uid, p_quest, v_assigned.period_key);
  return app_private.award_xp(v_uid, 'quest', md5(v_uid::text || ':' || p_quest || ':' || v_assigned.period_key::text)::uuid,
                              v_quest.reward_xp, p_quest);
end;
$$;

-- ---------------------------------------------------------------------------
-- Reads
-- ---------------------------------------------------------------------------
create or replace function public.get_my_progression()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
  v_metrics jsonb;
  v_profile public.profiles;
begin
  -- Catch up on achievements reached outside matches (friends, groups).
  perform app_private.evaluate_achievements(v_uid);
  v_metrics := app_private.player_metrics(v_uid);
  select * into v_profile from public.profiles where id = v_uid;
  return jsonb_build_object(
    'level', v_profile.level,
    'xp', v_profile.xp,
    'level_xp', app_private.xp_for_level(v_profile.level),
    'next_level_xp', app_private.xp_for_level(v_profile.level + 1),
    'play_streak', (v_metrics ->> 'play_streak')::integer,
    'quests', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', q.id, 'period', q.period, 'name', q.name, 'target', q.target, 'reward_xp', q.reward_xp,
                  'progress', least(q.target, app_private.quest_progress(v_uid, q.metric, a.period_key)),
                  'claimed', exists (select 1 from public.player_quest_claims c
                                      where c.user_id = v_uid and c.quest_id = q.id and c.period_key = a.period_key),
                  'resets_at', (a.period_key + case q.period when 'daily' then 1 else 7 end)::timestamp at time zone 'UTC')
                order by q.period, q.reward_xp), '[]'::jsonb)
                 from app_private.assigned_quests(v_uid) a join public.quest_definitions q on q.id = a.quest_id),
    'achievements', (select coalesce(jsonb_agg(jsonb_build_object(
                        'id', a.id, 'name', a.name, 'description', a.description, 'category', a.category,
                        'threshold', a.threshold, 'reward_xp', a.reward_xp,
                        'progress', least(a.threshold, coalesce((v_metrics ->> a.metric)::integer, 0)),
                        'unlocked_at', pa.unlocked_at)
                      order by (pa.unlocked_at is null), a.sort_order), '[]'::jsonb)
                       from public.achievements a
                       left join public.player_achievements pa on pa.achievement_id = a.id and pa.user_id = v_uid));
end;
$$;

-- Unlocked achievements of a profile the viewer may see.
create or replace function public.get_player_achievements(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
begin
  if not app_private.can_view_stats(v_uid, p_user) or app_private.is_blocked_between(v_uid, p_user) then
    return '[]'::jsonb;
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'category', a.category, 'unlocked_at', pa.unlocked_at)
                                    order by pa.unlocked_at desc), '[]'::jsonb)
            from public.player_achievements pa join public.achievements a on a.id = pa.achievement_id
           where pa.user_id = p_user);
end;
$$;

-- Level / XP ranking, all time or this week, global or among friends.
create or replace function public.get_xp_leaderboard(p_scope text default 'global', p_period text default 'week', p_limit integer default 50)
returns table (rank bigint, user_id uuid, username text, display_name text, avatar_id text, level integer, xp bigint, is_me boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
  v_since timestamptz := (date_trunc('week', now() at time zone 'UTC')) at time zone 'UTC';
begin
  if p_scope not in ('global', 'friends') or p_period not in ('week', 'all') then
    raise exception 'PV_INVALID_INPUT';
  end if;
  return query
    with scores as (
      select p.id, case when p_period = 'all' then p.xp::bigint
                        else coalesce((select sum(e.amount) from public.xp_events e where e.user_id = p.id and e.created_at >= v_since), 0)::bigint
                   end as score
        from public.profiles p
       where p.onboarding_completed_at is not null
         and (p_scope = 'global' or p.id = v_uid or p.id in (select app_private.friend_ids(v_uid)))
    ),
    ranked as (select s.id, s.score, rank() over (order by s.score desc) as rnk from scores s where s.score > 0 or s.id = v_uid)
    select r.rnk, p.id, p.username, p.display_name, p.avatar_id, p.level, r.score, p.id = v_uid
      from ranked r join public.profiles p on p.id = r.id
     where r.rnk <= least(greatest(coalesce(p_limit, 50), 1), 100) or r.id = v_uid
     order by r.rnk, p.username;
end;
$$;

-- ---------------------------------------------------------------------------
-- Match hook
-- ---------------------------------------------------------------------------
create or replace function app_private.progression_after_match(p_match uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player record;
begin
  for v_player in select user_id from public.match_players where match_id = p_match and user_id is not null loop
    perform app_private.evaluate_achievements(v_player.user_id);
  end loop;
end;
$$;

create or replace function app_private.after_match_finalized(p_match uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.party_after_match(p_match);
  perform app_private.groups_after_match(p_match);
  perform app_private.progression_after_match(p_match);
end;
$$;

do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.claim_quest(text)', 'public.get_my_progression()', 'public.get_player_achievements(uuid)',
    'public.get_xp_leaderboard(text, text, integer)'
  ] loop
    execute format('revoke all on function %s from public, anon', v_fn);
    execute format('grant execute on function %s to authenticated', v_fn);
  end loop;
  foreach v_fn in array array[
    'app_private.counted_matches(uuid, timestamptz)', 'app_private.play_streak(uuid)', 'app_private.player_metrics(uuid)',
    'app_private.evaluate_achievements(uuid)', 'app_private.assigned_quests(uuid)', 'app_private.quest_progress(uuid, text, date)',
    'app_private.progression_after_match(uuid)', 'app_private.after_match_finalized(uuid)'
  ] loop
    execute format('revoke all on function %s from public', v_fn);
  end loop;
end;
$$;
