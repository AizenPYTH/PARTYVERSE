-- PARTYVERSE — Permanent groups (crews): roles, invitations, chat, activity,
-- internal leaderboard, weekly collective challenge, and inviting the group
-- into a room.

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 3 and 40),
  description text not null default '' check (char_length(description) <= 200),
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  hue smallint not null default 270 check (hue between 0 and 359),
  owner_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members (user_id);
create unique index group_members_one_owner on public.group_members (group_id) where role = 'owner';

create table public.group_invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  inviter_id uuid not null references public.profiles (id) on delete cascade,
  invitee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (inviter_id <> invitee_id)
);
create unique index group_invitations_one_pending on public.group_invitations (group_id, invitee_id) where status = 'pending';
create index group_invitations_invitee_idx on public.group_invitations (invitee_id) where status = 'pending';

create table public.group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  sender_id uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index group_messages_group_idx on public.group_messages (group_id, created_at desc);

create table public.group_activity (
  id bigint generated always as identity primary key,
  group_id uuid not null references public.groups (id) on delete cascade,
  kind text not null check (kind in (
    'created', 'member_joined', 'member_left', 'member_kicked', 'role_changed', 'match_played', 'challenge_completed'
  )),
  actor_id uuid references public.profiles (id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index group_activity_group_idx on public.group_activity (group_id, created_at desc);

create table public.group_challenges (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  week_start date not null,
  kind text not null check (kind in ('matches_together', 'member_wins', 'variety')),
  target integer not null check (target > 0),
  progress integer not null default 0,
  completed_at timestamptz,
  unique (group_id, week_start)
);

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_invitations enable row level security;
alter table public.group_messages enable row level security;
alter table public.group_activity enable row level security;
alter table public.group_challenges enable row level security;
revoke all on public.groups, public.group_members, public.group_invitations, public.group_messages,
              public.group_activity, public.group_challenges from anon, authenticated;
grant select on public.groups, public.group_members, public.group_invitations, public.group_messages,
               public.group_activity, public.group_challenges to authenticated;

create or replace function app_private.is_group_member(p_group uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.group_members where group_id = p_group and user_id = p_user);
$$;

create policy "Members and public readers see groups" on public.groups
  for select to authenticated using (visibility = 'public' or app_private.is_group_member(id, auth.uid())
    or exists (select 1 from public.group_invitations i where i.group_id = groups.id and i.invitee_id = auth.uid() and i.status = 'pending'));
create policy "Members see members" on public.group_members
  for select to authenticated using (app_private.is_group_member(group_id, auth.uid()));
create policy "Invitees and admins see invitations" on public.group_invitations
  for select to authenticated using (invitee_id = auth.uid() or inviter_id = auth.uid()
    or exists (select 1 from public.group_members m where m.group_id = group_invitations.group_id
                and m.user_id = auth.uid() and m.role in ('owner', 'admin')));
create policy "Members read the group chat" on public.group_messages
  for select to authenticated using (app_private.is_group_member(group_id, auth.uid()));
create policy "Members read the activity" on public.group_activity
  for select to authenticated using (app_private.is_group_member(group_id, auth.uid()));
create policy "Members read challenges" on public.group_challenges
  for select to authenticated using (app_private.is_group_member(group_id, auth.uid()));

create or replace function app_private.require_group_role(p_group uuid, p_user uuid, p_roles text[])
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  perform 1 from public.groups where id = p_group for update;
  select role into v_role from public.group_members where group_id = p_group and user_id = p_user;
  if v_role is null then
    raise exception 'PV_GROUP_NOT_FOUND';
  end if;
  if not v_role = any (p_roles) then
    raise exception 'PV_GROUP_FORBIDDEN';
  end if;
  return v_role;
end;
$$;

create or replace function app_private.group_event(p_group uuid, p_kind text, p_actor uuid, p_payload jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.group_activity (group_id, kind, actor_id, payload) values (p_group, p_kind, p_actor, coalesce(p_payload, '{}'::jsonb));
$$;

create or replace function app_private.clean_group_text(p_text text, p_min integer, p_max integer)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_text text := btrim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g'));
begin
  if char_length(v_text) not between p_min and p_max then
    raise exception 'PV_INVALID_INPUT' using hint = 'text';
  end if;
  return v_text;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lifecycle
-- ---------------------------------------------------------------------------
create or replace function public.create_group(p_name text, p_description text default '', p_visibility text default 'private')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
  v_group uuid;
begin
  if p_visibility not in ('private', 'public') then
    raise exception 'PV_INVALID_INPUT' using hint = 'visibility';
  end if;
  if (select count(*) from public.group_members where user_id = v_uid) >= 20 then
    raise exception 'PV_GROUP_LIMIT';
  end if;
  perform app_private.enforce_rate_limit(v_uid, 'create_group', 5, interval '1 day');
  insert into public.groups (name, description, visibility, hue, owner_id)
  values (app_private.mask_profanity(app_private.clean_group_text(p_name, 3, 40)),
          app_private.mask_profanity(app_private.clean_group_text(coalesce(p_description, ''), 0, 200)),
          p_visibility, (abs(hashtext(p_name)) % 360)::smallint, v_uid)
  returning id into v_group;
  insert into public.group_members (group_id, user_id, role) values (v_group, v_uid, 'owner');
  perform app_private.group_event(v_group, 'created', v_uid);
  return v_group;
end;
$$;

create or replace function public.update_group(p_group uuid, p_name text, p_description text, p_visibility text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
begin
  perform app_private.require_group_role(p_group, v_uid, array['owner', 'admin']);
  if p_visibility is not null and p_visibility not in ('private', 'public') then
    raise exception 'PV_INVALID_INPUT' using hint = 'visibility';
  end if;
  update public.groups
     set name = case when p_name is null then name else app_private.mask_profanity(app_private.clean_group_text(p_name, 3, 40)) end,
         description = case when p_description is null then description
                            else app_private.mask_profanity(app_private.clean_group_text(p_description, 0, 200)) end,
         visibility = coalesce(p_visibility, visibility),
         updated_at = now()
   where id = p_group;
end;
$$;

create or replace function public.invite_to_group(p_group uuid, p_user uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
  v_policy text;
  v_invitation uuid;
begin
  perform app_private.require_group_role(p_group, v_uid, array['owner', 'admin']);
  if p_user = v_uid then
    raise exception 'PV_CANNOT_TARGET_SELF';
  end if;
  perform app_private.require_onboarded_target(p_user);
  if app_private.is_blocked_between(v_uid, p_user) then
    raise exception 'PV_USER_UNAVAILABLE';
  end if;
  if app_private.is_group_member(p_group, p_user) then
    raise exception 'PV_ALREADY_IN_GROUP';
  end if;
  select invites_from into v_policy from public.user_settings where user_id = p_user;
  if v_policy = 'nobody' then
    raise exception 'PV_INVITES_DISABLED';
  end if;
  if not app_private.are_friends(v_uid, p_user) then
    raise exception 'PV_NOT_FRIENDS';
  end if;
  if (select count(*) from public.group_members where group_id = p_group) >= 50 then
    raise exception 'PV_GROUP_FULL';
  end if;
  perform app_private.enforce_rate_limit(v_uid, 'group_invite', 30, interval '10 minutes');

  select id into v_invitation from public.group_invitations
   where group_id = p_group and invitee_id = p_user and status = 'pending';
  if v_invitation is null then
    insert into public.group_invitations (group_id, inviter_id, invitee_id) values (p_group, v_uid, p_user)
    returning id into v_invitation;
  end if;
  perform app_private.notify(p_user, 'group_invite', v_uid, jsonb_build_object('invitation_id', v_invitation, 'group_id', p_group));
  return v_invitation;
end;
$$;

create or replace function app_private.add_group_member(p_group uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.group_members where group_id = p_group) >= 50 then
    raise exception 'PV_GROUP_FULL';
  end if;
  if (select count(*) from public.group_members where user_id = p_user) >= 20 then
    raise exception 'PV_GROUP_LIMIT';
  end if;
  insert into public.group_members (group_id, user_id) values (p_group, p_user) on conflict do nothing;
  if found then
    perform app_private.group_event(p_group, 'member_joined', p_user);
  end if;
end;
$$;

create or replace function public.respond_group_invitation(p_invitation uuid, p_accept boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
  v_invitation public.group_invitations;
begin
  select * into v_invitation from public.group_invitations
   where id = p_invitation and invitee_id = v_uid and status = 'pending' for update;
  if v_invitation.id is null then
    raise exception 'PV_INVITATION_NOT_FOUND';
  end if;
  perform 1 from public.groups where id = v_invitation.group_id for update;
  update public.group_invitations
     set status = case when p_accept then 'accepted' else 'declined' end, responded_at = now()
   where id = p_invitation;
  update public.notifications set read_at = now()
   where user_id = v_uid and type = 'group_invite' and read_at is null and payload ->> 'invitation_id' = p_invitation::text;
  if p_accept then
    perform app_private.add_group_member(v_invitation.group_id, v_uid);
  end if;
  return v_invitation.group_id;
end;
$$;

create or replace function public.join_public_group(p_group uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
  v_group public.groups;
begin
  select * into v_group from public.groups where id = p_group for update;
  if v_group.id is null or v_group.visibility <> 'public' then
    raise exception 'PV_GROUP_NOT_FOUND';
  end if;
  if exists (select 1 from public.group_members m where m.group_id = p_group and app_private.is_blocked_between(m.user_id, v_uid)
               and m.role in ('owner', 'admin')) then
    raise exception 'PV_GROUP_FORBIDDEN';
  end if;
  perform app_private.enforce_rate_limit(v_uid, 'join_group', 20, interval '1 hour');
  perform app_private.add_group_member(p_group, v_uid);
end;
$$;

create or replace function public.leave_group(p_group uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
  v_role text := app_private.require_group_role(p_group, v_uid, array['owner', 'admin', 'member']);
  v_successor uuid;
begin
  delete from public.group_members where group_id = p_group and user_id = v_uid;
  if v_role = 'owner' then
    select user_id into v_successor from public.group_members
     where group_id = p_group
     order by case role when 'admin' then 0 else 1 end, joined_at
     limit 1;
    if v_successor is null then
      delete from public.groups where id = p_group;
      return;
    end if;
    update public.group_members set role = 'owner' where group_id = p_group and user_id = v_successor;
    update public.groups set owner_id = v_successor, updated_at = now() where id = p_group;
    perform app_private.group_event(p_group, 'role_changed', v_successor, jsonb_build_object('role', 'owner'));
  end if;
  perform app_private.group_event(p_group, 'member_left', v_uid);
end;
$$;

create or replace function public.kick_group_member(p_group uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
  v_role text := app_private.require_group_role(p_group, v_uid, array['owner', 'admin']);
  v_target text;
begin
  select role into v_target from public.group_members where group_id = p_group and user_id = p_user;
  if v_target is null then
    raise exception 'PV_USER_NOT_FOUND';
  end if;
  if p_user = v_uid or v_target = 'owner' or (v_role = 'admin' and v_target = 'admin') then
    raise exception 'PV_GROUP_FORBIDDEN';
  end if;
  delete from public.group_members where group_id = p_group and user_id = p_user;
  perform app_private.group_event(p_group, 'member_kicked', p_user, jsonb_build_object('by', v_uid));
end;
$$;

create or replace function public.set_group_role(p_group uuid, p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
begin
  perform app_private.require_group_role(p_group, v_uid, array['owner']);
  if p_role not in ('owner', 'admin', 'member') or p_user = v_uid then
    raise exception 'PV_INVALID_INPUT' using hint = 'role';
  end if;
  if not app_private.is_group_member(p_group, p_user) then
    raise exception 'PV_USER_NOT_FOUND';
  end if;
  if p_role = 'owner' then
    -- Ownership transfer: the previous owner becomes admin.
    update public.group_members set role = 'admin' where group_id = p_group and user_id = v_uid;
    update public.groups set owner_id = p_user, updated_at = now() where id = p_group;
  end if;
  update public.group_members set role = p_role where group_id = p_group and user_id = p_user;
  perform app_private.group_event(p_group, 'role_changed', p_user, jsonb_build_object('role', p_role, 'by', v_uid));
end;
$$;

-- ---------------------------------------------------------------------------
-- Chat
-- ---------------------------------------------------------------------------
create or replace function public.send_group_message(p_group uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
  v_body text := btrim(coalesce(p_body, ''));
  v_message public.group_messages;
begin
  if not app_private.is_group_member(p_group, v_uid) then
    raise exception 'PV_GROUP_NOT_FOUND';
  end if;
  if app_private.has_active_sanction(v_uid, array['mute', 'suspend', 'ban']) then
    raise exception 'PV_MUTED';
  end if;
  if char_length(v_body) not between 1 and 500 then
    raise exception 'PV_MESSAGE_INVALID';
  end if;
  v_body := app_private.mask_profanity(v_body);
  if exists (select 1 from public.group_messages where group_id = p_group and sender_id = v_uid and body = v_body
               and created_at > now() - interval '30 seconds') then
    raise exception 'PV_MESSAGE_DUPLICATE';
  end if;
  perform app_private.enforce_rate_limit(v_uid, 'group_message', 6, interval '10 seconds');
  insert into public.group_messages (group_id, sender_id, body) values (p_group, v_uid, v_body) returning * into v_message;
  return to_jsonb(v_message);
end;
$$;

create or replace function public.list_group_messages(p_group uuid, p_before timestamptz default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
begin
  if not app_private.is_group_member(p_group, v_uid) then
    raise exception 'PV_GROUP_NOT_FOUND';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', m.id, 'sender_id', m.sender_id, 'body', m.body, 'created_at', m.created_at,
             'username', p.username, 'display_name', p.display_name, 'avatar_id', p.avatar_id) order by m.created_at desc)
      from (select * from public.group_messages
             where group_id = p_group and (p_before is null or created_at < p_before)
               and not app_private.is_blocked_between(v_uid, coalesce(sender_id, v_uid))
             order by created_at desc limit 50) m
      left join public.profiles p on p.id = m.sender_id
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Weekly collective challenge
-- ---------------------------------------------------------------------------
create or replace function app_private.week_start(p_at timestamptz default now())
returns date
language sql
stable
set search_path = ''
as $$
  select (date_trunc('week', p_at at time zone 'UTC'))::date;
$$;

create or replace function app_private.ensure_group_challenge(p_group uuid)
returns public.group_challenges
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_week date := app_private.week_start();
  v_challenge public.group_challenges;
  v_kind text;
begin
  select * into v_challenge from public.group_challenges where group_id = p_group and week_start = v_week;
  if v_challenge.id is not null then
    return v_challenge;
  end if;
  v_kind := (array['matches_together', 'member_wins', 'variety'])[1 + abs(hashtext(p_group::text || v_week::text)) % 3];
  insert into public.group_challenges (group_id, week_start, kind, target)
  values (p_group, v_week, v_kind, case v_kind when 'matches_together' then 10 when 'member_wins' then 25 else 5 end)
  on conflict (group_id, week_start) do nothing;
  select * into v_challenge from public.group_challenges where group_id = p_group and week_start = v_week;
  return v_challenge;
end;
$$;

-- Recomputes a challenge from real matches of the week (never incremental,
-- so it cannot drift or be replayed).
create or replace function app_private.refresh_group_challenge(p_group uuid)
returns public.group_challenges
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_challenge public.group_challenges := app_private.ensure_group_challenge(p_group);
  v_progress integer;
  v_member record;
begin
  select case v_challenge.kind
           when 'matches_together' then (
             select count(*) from public.matches m
              where m.status = 'finished' and m.ended_at >= v_challenge.week_start
                and (select count(*) from public.match_players mp
                      join public.group_members gm on gm.user_id = mp.user_id and gm.group_id = p_group
                     where mp.match_id = m.id) >= 2)
           when 'member_wins' then (
             select count(*) from public.match_players mp
              join public.matches m on m.id = mp.match_id
              join public.group_members gm on gm.user_id = mp.user_id and gm.group_id = p_group
             where m.status = 'finished' and m.ended_at >= v_challenge.week_start and mp.result = 'win')
           else (
             select count(distinct m.game_id) from public.matches m
              join public.match_players mp on mp.match_id = m.id
              join public.group_members gm on gm.user_id = mp.user_id and gm.group_id = p_group
             where m.status = 'finished' and m.ended_at >= v_challenge.week_start)
         end
    into v_progress;

  update public.group_challenges set progress = least(v_progress, target) where id = v_challenge.id
  returning * into v_challenge;

  if v_challenge.progress >= v_challenge.target and v_challenge.completed_at is null then
    update public.group_challenges set completed_at = now() where id = v_challenge.id returning * into v_challenge;
    perform app_private.group_event(p_group, 'challenge_completed', null, jsonb_build_object('kind', v_challenge.kind));
    for v_member in select user_id from public.group_members where group_id = p_group loop
      -- Idempotent per (member, challenge).
      perform app_private.award_xp(v_member.user_id, 'event', v_challenge.id, 50, 'group_challenge');
      perform app_private.notify(v_member.user_id, 'group_challenge', null,
        jsonb_build_object('group_id', p_group, 'challenge_id', v_challenge.id));
    end loop;
  end if;
  return v_challenge;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reads
-- ---------------------------------------------------------------------------
create or replace function public.list_my_groups()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', g.id, 'name', g.name, 'description', g.description, 'visibility', g.visibility, 'hue', g.hue,
           'role', gm.role,
           'members', (select count(*) from public.group_members x where x.group_id = g.id),
           'online', (select count(*) from public.group_members x
                       where x.group_id = g.id and app_private.presence_for(auth.uid(), x.user_id) ->> 'presence' <> 'offline'),
           'last_message_at', (select max(created_at) from public.group_messages m where m.group_id = g.id))
         order by g.name), '[]'::jsonb)
    from public.group_members gm
    join public.groups g on g.id = gm.group_id
   where gm.user_id = auth.uid();
$$;

create or replace function public.search_public_groups(p_query text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', g.id, 'name', g.name, 'description', g.description, 'hue', g.hue,
           'members', (select count(*) from public.group_members x where x.group_id = g.id),
           'is_member', app_private.is_group_member(g.id, auth.uid()))), '[]'::jsonb)
    from (select * from public.groups
           where visibility = 'public'
             and (coalesce(btrim(p_query), '') = '' or name ilike '%' || replace(replace(btrim(p_query), '%', ''), '_', '') || '%')
           order by created_at desc limit 20) g;
$$;

create or replace function public.list_my_group_invitations()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id, 'group_id', g.id, 'group_name', g.name, 'hue', g.hue, 'created_at', i.created_at,
           'inviter', jsonb_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name, 'avatar_id', p.avatar_id))
         order by i.created_at desc), '[]'::jsonb)
    from public.group_invitations i
    join public.groups g on g.id = i.group_id
    join public.profiles p on p.id = i.inviter_id
   where i.invitee_id = auth.uid() and i.status = 'pending';
$$;

create or replace function public.get_group(p_group uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
  v_group public.groups;
  v_role text;
  v_challenge public.group_challenges;
  v_week date := app_private.week_start();
begin
  select * into v_group from public.groups where id = p_group;
  select role into v_role from public.group_members where group_id = p_group and user_id = v_uid;
  if v_group.id is null or (v_role is null and v_group.visibility <> 'public') then
    raise exception 'PV_GROUP_NOT_FOUND';
  end if;
  if v_role is null then
    -- Public preview for non-members.
    return jsonb_build_object(
      'group', jsonb_build_object('id', v_group.id, 'name', v_group.name, 'description', v_group.description,
                                  'visibility', v_group.visibility, 'hue', v_group.hue, 'created_at', v_group.created_at),
      'my_role', null,
      'member_count', (select count(*) from public.group_members where group_id = p_group));
  end if;
  v_challenge := app_private.refresh_group_challenge(p_group);

  return jsonb_build_object(
    'group', jsonb_build_object('id', v_group.id, 'name', v_group.name, 'description', v_group.description,
                                'visibility', v_group.visibility, 'hue', v_group.hue, 'created_at', v_group.created_at),
    'my_role', v_role,
    'member_count', (select count(*) from public.group_members where group_id = p_group),
    -- Internal leaderboard: wins this week, then level.
    'members', (select coalesce(jsonb_agg(row order by (row ->> 'week_wins')::int desc, (row ->> 'level')::int desc, row ->> 'username'), '[]'::jsonb)
                  from (select jsonb_build_object(
                           'user_id', p.id, 'username', p.username, 'display_name', p.display_name, 'avatar_id', p.avatar_id,
                           'level', p.level, 'role', gm.role, 'joined_at', gm.joined_at,
                           'presence', app_private.presence_for(v_uid, p.id) ->> 'presence',
                           'week_wins', (select count(*) from public.match_players mp join public.matches m on m.id = mp.match_id
                                          where mp.user_id = p.id and mp.result = 'win' and m.ended_at >= v_week),
                           'week_matches', (select count(*) from public.match_players mp join public.matches m on m.id = mp.match_id
                                             where mp.user_id = p.id and m.status = 'finished' and m.ended_at >= v_week)) as row
                          from public.group_members gm join public.profiles p on p.id = gm.user_id
                         where gm.group_id = p_group) members),
    'challenge', jsonb_build_object('id', v_challenge.id, 'kind', v_challenge.kind, 'target', v_challenge.target,
                                    'progress', v_challenge.progress, 'week_start', v_challenge.week_start,
                                    'completed_at', v_challenge.completed_at),
    'activity', (select coalesce(jsonb_agg(jsonb_build_object(
                    'id', a.id, 'kind', a.kind, 'payload', a.payload, 'created_at', a.created_at,
                    'actor', case when p.id is null then null else jsonb_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name) end)
                  order by a.created_at desc), '[]'::jsonb)
                   from (select * from public.group_activity where group_id = p_group order by created_at desc limit 20) a
                   left join public.profiles p on p.id = a.actor_id),
    'pending_invitations', case when v_role in ('owner', 'admin') then (
      select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'invitee_id', i.invitee_id, 'username', p.username, 'display_name', p.display_name)), '[]'::jsonb)
        from public.group_invitations i join public.profiles p on p.id = i.invitee_id
       where i.group_id = p_group and i.status = 'pending') else '[]'::jsonb end);
end;
$$;

-- ---------------------------------------------------------------------------
-- Group matches: invite every member into the caller's room.
-- ---------------------------------------------------------------------------
create or replace function public.invite_group_to_lobby(p_group uuid, p_lobby uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
  v_lobby public.lobbies;
  v_member record;
  v_invitation uuid;
  v_count integer := 0;
begin
  if not app_private.is_group_member(p_group, v_uid) then
    raise exception 'PV_GROUP_NOT_FOUND';
  end if;
  select * into v_lobby from public.lobbies where id = p_lobby;
  if v_lobby.id is null or not app_private.is_lobby_member(p_lobby, v_uid) then
    raise exception 'PV_LOBBY_NOT_FOUND';
  end if;
  if v_lobby.status not in ('waiting', 'ready', 'in_progress') then
    raise exception 'PV_LOBBY_CLOSED';
  end if;
  perform app_private.enforce_rate_limit(v_uid, 'group_lobby_invite', 5, interval '10 minutes');

  for v_member in
    select gm.user_id from public.group_members gm
      join public.user_settings us on us.user_id = gm.user_id
     where gm.group_id = p_group and gm.user_id <> v_uid
       and us.invites_from <> 'nobody'
       and not app_private.is_blocked_between(v_uid, gm.user_id)
       and not app_private.is_lobby_member(p_lobby, gm.user_id)
  loop
    update public.lobby_invitations set expires_at = now() + interval '15 minutes', sender_id = v_uid
     where lobby_id = p_lobby and recipient_id = v_member.user_id and status = 'pending'
    returning id into v_invitation;
    if v_invitation is null then
      insert into public.lobby_invitations (lobby_id, sender_id, recipient_id)
      values (p_lobby, v_uid, v_member.user_id)
      returning id into v_invitation;
    end if;
    perform app_private.notify(v_member.user_id, 'lobby_invite', v_uid, jsonb_build_object(
      'invitation_id', v_invitation, 'lobby_id', p_lobby, 'game_id', v_lobby.game_id, 'group_id', p_group));
    v_count := v_count + 1;
    v_invitation := null;
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Match hook: party scoring + group activity and challenges.
-- ---------------------------------------------------------------------------
alter function app_private.after_match_finalized(uuid) rename to party_after_match;

create or replace function app_private.groups_after_match(p_match uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group record;
  v_match public.matches;
begin
  select * into v_match from public.matches where id = p_match;
  for v_group in
    select gm.group_id, array_agg(mp.user_id) as members,
           array_agg(mp.user_id) filter (where mp.result = 'win') as winners
      from public.match_players mp
      join public.group_members gm on gm.user_id = mp.user_id
     where mp.match_id = p_match
     group by gm.group_id
  loop
    if cardinality(v_group.members) >= 2 then
      perform app_private.group_event(v_group.group_id, 'match_played', null, jsonb_build_object(
        'match_id', p_match, 'game_id', v_match.game_id, 'members', to_jsonb(v_group.members),
        'winners', coalesce(to_jsonb(v_group.winners), '[]'::jsonb)));
    end if;
    perform app_private.refresh_group_challenge(v_group.group_id);
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
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.create_group(text, text, text)', 'public.update_group(uuid, text, text, text)',
    'public.invite_to_group(uuid, uuid)', 'public.respond_group_invitation(uuid, boolean)',
    'public.join_public_group(uuid)', 'public.leave_group(uuid)', 'public.kick_group_member(uuid, uuid)',
    'public.set_group_role(uuid, uuid, text)', 'public.send_group_message(uuid, text)',
    'public.list_group_messages(uuid, timestamptz)', 'public.list_my_groups()', 'public.search_public_groups(text)',
    'public.list_my_group_invitations()', 'public.get_group(uuid)', 'public.invite_group_to_lobby(uuid, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', v_fn);
    execute format('grant execute on function %s to authenticated', v_fn);
  end loop;
  foreach v_fn in array array[
    'app_private.is_group_member(uuid, uuid)', 'app_private.require_group_role(uuid, uuid, text[])',
    'app_private.group_event(uuid, text, uuid, jsonb)', 'app_private.add_group_member(uuid, uuid)',
    'app_private.ensure_group_challenge(uuid)', 'app_private.refresh_group_challenge(uuid)',
    'app_private.groups_after_match(uuid)', 'app_private.party_after_match(uuid)', 'app_private.after_match_finalized(uuid)'
  ] loop
    execute format('revoke all on function %s from public', v_fn);
  end loop;
  -- Used by RLS policies, evaluated as the calling role.
  grant execute on function app_private.is_group_member(uuid, uuid) to authenticated;
end;
$$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.group_messages, public.group_members, public.group_invitations;
  end if;
end;
$$;
