-- PARTYVERSE — Ranked matchmaking
--
-- Pull-based queue: a ticket is created by enqueue_matchmaking and every
-- poll_matchmaking call (client polls every ~2 s) attempts a pairing. No
-- background worker is required. Pairing locks both tickets (SKIP LOCKED) and
-- creates the lobby and match in the same transaction, so a player can never
-- be assigned twice. The acceptable rating gap widens with waiting time.

create table public.matchmaking_tickets (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  game_id text not null references public.game_catalog (id),
  mode text not null default 'classic',
  rating integer not null,
  status text not null default 'searching' check (status in ('searching', 'matched', 'cancelled', 'expired')),
  lobby_id uuid references public.lobbies (id) on delete set null,
  match_id uuid references public.matches (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '5 minutes'
);
create index matchmaking_searching_idx on public.matchmaking_tickets (game_id, mode, rating)
  where status = 'searching';

create trigger matchmaking_tickets_set_updated_at
  before update on public.matchmaking_tickets
  for each row execute function app_private.set_updated_at();

alter table public.matchmaking_tickets enable row level security;
revoke all on public.matchmaking_tickets from anon, authenticated;
grant select on public.matchmaking_tickets to authenticated;
create policy "Players read their own ticket" on public.matchmaking_tickets
  for select to authenticated using (user_id = auth.uid());

-- Rating window: ±100, +50 every 10 s of waiting, capped at ±600.
create or replace function app_private.matchmaking_window(p_created_at timestamptz)
returns integer
language sql
stable
set search_path = ''
as $$
  select least(100 + 50 * floor(extract(epoch from (now() - p_created_at)) / 10)::integer, 600);
$$;

create or replace function app_private.ticket_json(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'status', t.status,
    'game_id', t.game_id,
    'mode', t.mode,
    'rating', t.rating,
    'lobby_id', t.lobby_id,
    'match_id', t.match_id,
    'waited_seconds', floor(extract(epoch from (now() - t.created_at)))::integer,
    'window', app_private.matchmaking_window(t.created_at),
    'expires_at', t.expires_at
  )
  from public.matchmaking_tickets t where t.user_id = p_user;
$$;

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

  loop
    v_attempt := v_attempt + 1;
    begin
      insert into public.lobbies
        (code, host_id, game_id, visibility, max_players, allow_spectators, ranked, source, settings, status)
      values
        (app_private.generate_code(6), v_other.user_id, v_mine.game_id, 'private', 2, true, true, 'matchmaking',
         app_private.normalize_game_settings(v_mine.game_id, '{}'::jsonb), 'ready')
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

  v_match := app_private.create_match(
    v_lobby.id,
    array(select u from unnest(array[v_other.user_id, p_user]) u order by random()),
    true);

  update public.matchmaking_tickets
     set status = 'matched', lobby_id = v_lobby.id, match_id = v_match
   where user_id in (p_user, v_other.user_id);
end;
$$;

create or replace function public.enqueue_matchmaking(p_game_id text, p_mode text default 'classic')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
  v_game public.game_catalog;
  v_rating integer;
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
  if not exists (
    select 1 from jsonb_array_elements(v_game.modes) m
     where m ->> 'id' = p_mode and coalesce((m ->> 'ranked')::boolean, false)
  ) then
    raise exception 'PV_RANKED_UNAVAILABLE';
  end if;
  if exists (
    select 1 from public.match_players mp join public.matches m on m.id = mp.match_id
     where mp.user_id = v_uid and m.status = 'active'
  ) then
    raise exception 'PV_ALREADY_IN_MATCH';
  end if;

  perform app_private.enforce_rate_limit(v_uid, 'matchmaking', 30, interval '10 minutes');
  perform app_private.leave_other_lobbies(v_uid, null);

  select rating into v_rating from public.player_ratings
   where user_id = v_uid and game_id = p_game_id and mode = p_mode;

  insert into public.matchmaking_tickets (user_id, game_id, mode, rating)
  values (v_uid, p_game_id, p_mode, coalesce(v_rating, 1200))
  on conflict (user_id) do update
    set game_id = excluded.game_id,
        mode = excluded.mode,
        rating = excluded.rating,
        status = 'searching',
        lobby_id = null,
        match_id = null,
        created_at = now(),
        expires_at = now() + interval '5 minutes';

  perform app_private.try_match(v_uid);
  return app_private.ticket_json(v_uid);
end;
$$;

create or replace function public.poll_matchmaking()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
begin
  perform app_private.try_match(v_uid);
  return app_private.ticket_json(v_uid);
end;
$$;

create or replace function public.cancel_matchmaking()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
begin
  -- Waits for a concurrent pairing to finish, then only cancels if still searching.
  perform 1 from public.matchmaking_tickets where user_id = v_uid for update;
  update public.matchmaking_tickets set status = 'cancelled' where user_id = v_uid and status = 'searching';
  return app_private.ticket_json(v_uid);
end;
$$;

grant execute on function
  public.enqueue_matchmaking(text, text),
  public.poll_matchmaking(),
  public.cancel_matchmaking()
to authenticated;
