-- PARTYVERSE — Push notifications (Expo push service).
--
-- Flow: every in-app notification (public.notifications) enqueues one push
-- per active device of the recipient into app_private.push_outbox, unless
-- the player disabled push for that type. The `push-dispatch` Edge Function
-- (service role) claims batches, sends them to Expo and reports results;
-- tokens Expo reports as unregistered are disabled. Push texts are built here
-- in French and never contain message bodies.

alter table public.user_settings
  add column push_prefs jsonb not null default '{}'::jsonb check (jsonb_typeof(push_prefs) = 'object'),
  add column streak_reminders boolean not null default false;
grant update (push_prefs, streak_reminders) on public.user_settings to authenticated;

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  token text not null unique check (token ~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$'),
  platform text not null check (platform in ('ios', 'android', 'web')),
  device_name text not null default '' check (char_length(device_name) <= 80),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  disabled_at timestamptz
);
create index push_tokens_user_idx on public.push_tokens (user_id) where disabled_at is null;

alter table public.push_tokens enable row level security;
revoke all on public.push_tokens from anon, authenticated;
grant select (id, platform, device_name, created_at, last_seen_at, disabled_at) on public.push_tokens to authenticated;
create policy "Players see their own devices" on public.push_tokens for select to authenticated using (user_id = auth.uid());

create table app_private.push_outbox (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  token_id uuid not null references public.push_tokens (id) on delete cascade,
  notification_id uuid references public.notifications (id) on delete cascade,
  dedupe_key text unique,
  title text not null,
  body text not null,
  url text not null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  attempts smallint not null default 0,
  sent_at timestamptz,
  error text
);
create index push_outbox_pending_idx on app_private.push_outbox (created_at) where sent_at is null;
alter table app_private.push_outbox enable row level security;
revoke all on app_private.push_outbox from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Client RPCs
-- ---------------------------------------------------------------------------
create or replace function public.register_push_token(p_token text, p_platform text, p_device_name text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
begin
  if p_platform not in ('ios', 'android', 'web')
     or p_token !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$' then
    raise exception 'PV_INVALID_INPUT' using hint = 'push_token';
  end if;
  perform app_private.enforce_rate_limit(v_uid, 'register_push_token', 20, interval '1 hour');
  if (select count(*) from public.push_tokens where user_id = v_uid and disabled_at is null and token <> p_token) >= 10 then
    -- Keep the ten most recent devices.
    update public.push_tokens set disabled_at = now()
     where id = (select id from public.push_tokens where user_id = v_uid and disabled_at is null order by last_seen_at limit 1);
  end if;
  -- A device token belongs to the account currently signed in on it.
  insert into public.push_tokens (user_id, token, platform, device_name)
  values (v_uid, p_token, p_platform, left(coalesce(p_device_name, ''), 80))
  on conflict (token) do update
     set user_id = excluded.user_id, platform = excluded.platform, device_name = excluded.device_name,
         last_seen_at = now(), disabled_at = null;
end;
$$;

create or replace function public.unregister_push_token(p_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.push_tokens set disabled_at = now() where token = p_token and user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Texts and destinations
-- ---------------------------------------------------------------------------
create or replace function app_private.push_content(p_notification public.notifications)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor text;
  v_game text;
  v_payload jsonb := p_notification.payload;
begin
  select coalesce(nullif(display_name, ''), username, 'Un joueur') into v_actor from public.profiles where id = p_notification.actor_id;
  v_actor := coalesce(v_actor, 'Un joueur');
  select name into v_game from public.game_catalog where id = v_payload ->> 'game_id';
  return case p_notification.type
    when 'friend_request' then jsonb_build_object('title', 'Nouvelle demande d’ami', 'body', v_actor || ' veut devenir ton ami.', 'url', '/friends')
    when 'friend_accepted' then jsonb_build_object('title', 'Demande acceptée', 'body', v_actor || ' a accepté ta demande d’ami.',
                                                   'url', '/player/' || p_notification.actor_id)
    when 'lobby_invite' then jsonb_build_object('title', 'Invitation à jouer',
                                                'body', v_actor || ' t’invite à une partie de ' || coalesce(v_game, 'jeu') || '.',
                                                'url', '/notifications')
    when 'direct_message' then jsonb_build_object('title', v_actor, 'body', 'Nouveau message privé.',
                                                  'url', '/messages/' || p_notification.actor_id)
    when 'group_invite' then jsonb_build_object('title', 'Invitation de groupe', 'body', v_actor || ' t’invite dans son groupe.', 'url', '/groups')
    when 'group_challenge' then jsonb_build_object('title', 'Défi de groupe réussi !', 'body', '+50 XP pour chaque membre.',
                                                   'url', '/groups/' || (v_payload ->> 'group_id'))
    when 'level_up' then jsonb_build_object('title', 'Niveau supérieur !', 'body', 'Tu passes niveau ' || coalesce(v_payload ->> 'level', '') || '.', 'url', '/quests')
    when 'achievement' then jsonb_build_object('title', 'Succès débloqué', 'body', coalesce(v_payload ->> 'name', 'Nouveau trophée') || '.', 'url', '/quests')
    when 'quest' then jsonb_build_object('title', 'Quête terminée', 'body', coalesce(v_payload ->> 'name', 'Récompense disponible') || '.', 'url', '/quests')
    when 'item_unlocked' then jsonb_build_object('title', 'Objet débloqué', 'body', 'Un nouvel objet t’attend dans ton inventaire.', 'url', '/notifications')
    else jsonb_build_object('title', 'PARTYVERSE', 'body', coalesce(v_payload ->> 'message', 'Du nouveau sur PARTYVERSE.'), 'url', '/notifications')
  end;
end;
$$;

create or replace function app_private.push_allowed(p_user uuid, p_type text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (push_prefs ->> p_type)::boolean from public.user_settings where user_id = p_user), true);
$$;

create or replace function app_private.enqueue_push_for_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_content jsonb;
begin
  if not app_private.push_allowed(new.user_id, new.type) then
    return new;
  end if;
  v_content := app_private.push_content(new);
  insert into app_private.push_outbox (user_id, token_id, notification_id, title, body, url)
  select new.user_id, t.id, new.id, v_content ->> 'title', v_content ->> 'body', v_content ->> 'url'
    from public.push_tokens t
   where t.user_id = new.user_id and t.disabled_at is null;
  return new;
end;
$$;

create trigger notifications_enqueue_push
  after insert on public.notifications
  for each row execute function app_private.enqueue_push_for_notification();

-- Opt-in reminder, at most once a day: a play streak that ends tonight.
create or replace function app_private.enqueue_streak_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_today date := (now() at time zone 'UTC')::date;
begin
  insert into app_private.push_outbox (user_id, token_id, dedupe_key, title, body, url)
  select s.user_id, t.id, 'streak:' || v_today || ':' || t.id, 'Ta série est en jeu',
         'Joue une partie aujourd’hui pour garder ta série de ' || app_private.play_streak(s.user_id) || ' jours.', '/quests'
    from public.user_settings s
    join public.push_tokens t on t.user_id = s.user_id and t.disabled_at is null
   where s.streak_reminders
     and app_private.play_streak(s.user_id) > 0
     and not exists (select 1 from app_private.counted_matches(s.user_id, v_today::timestamptz))
  on conflict (dedupe_key) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Dispatcher RPCs (service role only)
-- ---------------------------------------------------------------------------
create or replace function public.push_claim_batch(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch jsonb;
begin
  -- Reminders are enqueued in the evening (UTC) only.
  if extract(hour from now() at time zone 'UTC') >= 17 then
    perform app_private.enqueue_streak_reminders();
  end if;
  with picked as (
    select o.id from app_private.push_outbox o
     where o.sent_at is null and o.attempts < 3
       and (o.claimed_at is null or o.claimed_at < now() - interval '2 minutes')
       and o.created_at > now() - interval '1 day'
     order by o.created_at
     limit least(greatest(coalesce(p_limit, 100), 1), 500)
     for update skip locked
  ),
  claimed as (
    update app_private.push_outbox o
       set claimed_at = now(), attempts = o.attempts + 1
      from picked where o.id = picked.id
    returning o.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'to', t.token, 'title', c.title, 'body', c.body, 'url', c.url,
           'badge', (select count(*) from public.notifications n where n.user_id = c.user_id and n.read_at is null))), '[]'::jsonb)
    into v_batch
    from claimed c join public.push_tokens t on t.id = c.token_id
   where t.disabled_at is null;
  return v_batch;
end;
$$;

-- p_results: [{id, ok, error?, unregistered?}]
create or replace function public.push_complete_batch(p_results jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if jsonb_typeof(p_results) <> 'array' then
    raise exception 'PV_INVALID_INPUT' using hint = 'results';
  end if;
  update app_private.push_outbox o
     set sent_at = case when (r ->> 'ok')::boolean then now() end,
         error = case when (r ->> 'ok')::boolean then null else left(coalesce(r ->> 'error', 'unknown'), 200) end
    from jsonb_array_elements(p_results) r
   where o.id = (r ->> 'id')::bigint;
  get diagnostics v_count = row_count;

  update public.push_tokens t set disabled_at = now()
    from jsonb_array_elements(p_results) r
    join app_private.push_outbox o on o.id = (r ->> 'id')::bigint
   where t.id = o.token_id and coalesce((r ->> 'unregistered')::boolean, false);

  delete from app_private.push_outbox where created_at < now() - interval '7 days';
  return v_count;
end;
$$;

revoke all on function public.register_push_token(text, text, text) from public, anon;
revoke all on function public.unregister_push_token(text) from public, anon;
grant execute on function public.register_push_token(text, text, text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;
revoke all on function public.push_claim_batch(integer) from public, anon, authenticated;
revoke all on function public.push_complete_batch(jsonb) from public, anon, authenticated;
grant execute on function public.push_claim_batch(integer) to service_role;
grant execute on function public.push_complete_batch(jsonb) to service_role;
revoke all on function app_private.push_content(public.notifications) from public;
revoke all on function app_private.push_allowed(uuid, text) from public;
revoke all on function app_private.enqueue_push_for_notification() from public;
revoke all on function app_private.enqueue_streak_reminders() from public;
