-- PARTYVERSE — Private messages between two players.
--
-- Anti-abuse: the recipient's `messages_from` setting (friends by default),
-- blocks in either direction, mutes/suspensions, per-user rate limits, a
-- stricter limit on opening conversations with non-friends, duplicate
-- detection and profanity masking. Notifications never carry the body.

alter table public.user_settings
  add column messages_from text not null default 'friends' check (messages_from in ('everyone', 'friends', 'nobody'));
grant update (messages_from) on public.user_settings to authenticated;

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'friend_request', 'friend_accepted', 'lobby_invite', 'level_up', 'item_unlocked', 'system',
  'direct_message', 'group_invite', 'group_challenge', 'achievement', 'quest'
));

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  -- The two participants, ordered so a pair has exactly one conversation.
  user_a uuid not null references public.profiles (id) on delete cascade,
  user_b uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  check (user_a < user_b),
  unique (user_a, user_b)
);
create index conversations_user_a_idx on public.conversations (user_a, last_message_at desc);
create index conversations_user_b_idx on public.conversations (user_b, last_message_at desc);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index conversation_members_user_idx on public.conversation_members (user_id);

create table public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index direct_messages_conversation_idx on public.direct_messages (conversation_id, created_at desc);

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.direct_messages enable row level security;
revoke all on public.conversations, public.conversation_members, public.direct_messages from anon, authenticated;
grant select on public.conversations, public.conversation_members, public.direct_messages to authenticated;

create policy "Participants read their conversations" on public.conversations
  for select to authenticated using (auth.uid() in (user_a, user_b));
create policy "Participants read their membership" on public.conversation_members
  for select to authenticated using (user_id = auth.uid());
create policy "Participants read messages" on public.direct_messages
  for select to authenticated using (exists (
    select 1 from public.conversations c where c.id = conversation_id and auth.uid() in (c.user_a, c.user_b)));

-- Why `p_sender` may not message `p_recipient` (null = allowed).
create or replace function app_private.message_block_reason(p_sender uuid, p_recipient uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_policy text;
begin
  if p_sender = p_recipient then
    return 'PV_CANNOT_TARGET_SELF';
  end if;
  if not exists (select 1 from public.profiles where id = p_recipient and onboarding_completed_at is not null) then
    return 'PV_USER_NOT_FOUND';
  end if;
  if app_private.is_blocked_between(p_sender, p_recipient) then
    return 'PV_USER_UNAVAILABLE';
  end if;
  select messages_from into v_policy from public.user_settings where user_id = p_recipient;
  if coalesce(v_policy, 'friends') = 'nobody' then
    return 'PV_MESSAGES_CLOSED';
  end if;
  if coalesce(v_policy, 'friends') = 'friends' and not app_private.are_friends(p_sender, p_recipient) then
    return 'PV_MESSAGES_FRIENDS_ONLY';
  end if;
  return null;
end;
$$;

create or replace function public.send_direct_message(p_recipient uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
  v_body text := btrim(coalesce(p_body, ''));
  v_reason text;
  v_a uuid := least(v_uid, p_recipient);
  v_b uuid := greatest(v_uid, p_recipient);
  v_conversation uuid;
  v_message public.direct_messages;
begin
  if app_private.has_active_sanction(v_uid, array['mute', 'suspend', 'ban']) then
    raise exception 'PV_MUTED';
  end if;
  v_reason := app_private.message_block_reason(v_uid, p_recipient);
  if v_reason is not null then
    raise exception '%', v_reason;
  end if;
  if char_length(v_body) not between 1 and 1000 then
    raise exception 'PV_MESSAGE_INVALID';
  end if;
  v_body := app_private.mask_profanity(v_body);

  select id into v_conversation from public.conversations where user_a = v_a and user_b = v_b;
  if v_conversation is null then
    -- Opening new conversations is limited harder than replying.
    perform app_private.enforce_rate_limit(v_uid, 'dm_open', 20, interval '1 hour');
    insert into public.conversations (user_a, user_b) values (v_a, v_b)
    on conflict (user_a, user_b) do nothing
    returning id into v_conversation;
    if v_conversation is null then
      select id into v_conversation from public.conversations where user_a = v_a and user_b = v_b;
    end if;
    insert into public.conversation_members (conversation_id, user_id, last_read_at)
    values (v_conversation, v_uid, now()), (v_conversation, p_recipient, '-infinity')
    on conflict do nothing;
  end if;

  if exists (
    select 1 from public.direct_messages
     where conversation_id = v_conversation and sender_id = v_uid and body = v_body
       and created_at > now() - interval '30 seconds'
  ) then
    raise exception 'PV_MESSAGE_DUPLICATE';
  end if;
  perform app_private.enforce_rate_limit(v_uid, 'direct_message', 8, interval '10 seconds');
  perform app_private.enforce_rate_limit(v_uid, 'direct_message_hour', 300, interval '1 hour');

  insert into public.direct_messages (conversation_id, sender_id, body)
  values (v_conversation, v_uid, v_body)
  returning * into v_message;
  update public.conversations set last_message_at = v_message.created_at where id = v_conversation;
  update public.conversation_members set last_read_at = v_message.created_at
   where conversation_id = v_conversation and user_id = v_uid;
  -- One unread notification per conversation (deduplicated by notify).
  perform app_private.notify(p_recipient, 'direct_message', v_uid, jsonb_build_object('conversation_id', v_conversation));

  return jsonb_build_object(
    'id', v_message.id, 'conversation_id', v_conversation, 'sender_id', v_uid,
    'body', v_message.body, 'created_at', v_message.created_at);
end;
$$;

create or replace function public.list_conversations()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(row order by (row ->> 'last_message_at') desc), '[]'::jsonb)
    from (
      select jsonb_build_object(
               'conversation_id', c.id,
               'last_message_at', c.last_message_at,
               'user', jsonb_build_object(
                 'id', p.id, 'username', p.username, 'display_name', p.display_name,
                 'avatar_id', p.avatar_id, 'level', p.level,
                 'presence', app_private.presence_for(auth.uid(), p.id) ->> 'presence'),
               'last_message', (select jsonb_build_object('body', left(m.body, 140), 'sender_id', m.sender_id, 'created_at', m.created_at)
                                  from public.direct_messages m where m.conversation_id = c.id
                                 order by m.created_at desc limit 1),
               'unread', (select count(*) from public.direct_messages m
                           where m.conversation_id = c.id and m.sender_id <> auth.uid() and m.created_at > cm.last_read_at)
             ) as row
        from public.conversation_members cm
        join public.conversations c on c.id = cm.conversation_id
        join public.profiles p on p.id = case when c.user_a = auth.uid() then c.user_b else c.user_a end
       where cm.user_id = auth.uid()
         and not app_private.is_blocked_between(auth.uid(), p.id)
         and exists (select 1 from public.direct_messages m where m.conversation_id = c.id)
    ) list;
$$;

-- Thread with another player: profile, whether messaging is allowed, and a
-- page of messages (newest first, before `p_before`).
create or replace function public.get_direct_thread(p_user uuid, p_before timestamptz default null, p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
  v_conversation uuid;
  v_profile jsonb;
  v_other_read timestamptz;
begin
  select jsonb_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name,
                            'avatar_id', p.avatar_id, 'level', p.level,
                            'presence', app_private.presence_for(v_uid, p.id) ->> 'presence')
    into v_profile
    from public.profiles p where p.id = p_user and p.onboarding_completed_at is not null;
  if v_profile is null or app_private.is_blocked_between(v_uid, p_user) then
    raise exception 'PV_USER_UNAVAILABLE';
  end if;
  select id into v_conversation from public.conversations
   where user_a = least(v_uid, p_user) and user_b = greatest(v_uid, p_user);
  select last_read_at into v_other_read from public.conversation_members
   where conversation_id = v_conversation and user_id = p_user;

  return jsonb_build_object(
    'conversation_id', v_conversation,
    'user', v_profile,
    'blocked_reason', app_private.message_block_reason(v_uid, p_user),
    'other_read_at', case when v_other_read = '-infinity' then null else v_other_read end,
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'sender_id', m.sender_id, 'body', m.body, 'created_at', m.created_at)
                       order by m.created_at desc)
        from (select * from public.direct_messages
               where conversation_id = v_conversation and (p_before is null or created_at < p_before)
               order by created_at desc
               limit least(greatest(coalesce(p_limit, 50), 1), 100)) m
    ), '[]'::jsonb));
end;
$$;

create or replace function public.mark_conversation_read(p_conversation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
begin
  update public.conversation_members set last_read_at = now()
   where conversation_id = p_conversation and user_id = v_uid;
  if not found then
    raise exception 'PV_CONVERSATION_NOT_FOUND';
  end if;
  update public.notifications set read_at = now()
   where user_id = v_uid and type = 'direct_message' and read_at is null
     and payload ->> 'conversation_id' = p_conversation::text;
end;
$$;

create or replace function public.count_unread_messages()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
    from public.conversation_members cm
    join public.conversations c on c.id = cm.conversation_id
    join public.direct_messages m on m.conversation_id = cm.conversation_id
   where cm.user_id = auth.uid()
     and m.sender_id <> auth.uid()
     and m.created_at > cm.last_read_at
     and not app_private.is_blocked_between(c.user_a, c.user_b);
$$;

revoke all on function app_private.message_block_reason(uuid, uuid) from public;
revoke all on function public.send_direct_message(uuid, text) from public, anon;
revoke all on function public.list_conversations() from public, anon;
revoke all on function public.get_direct_thread(uuid, timestamptz, integer) from public, anon;
revoke all on function public.mark_conversation_read(uuid) from public, anon;
revoke all on function public.count_unread_messages() from public, anon;
grant execute on function public.send_direct_message(uuid, text) to authenticated;
grant execute on function public.list_conversations() to authenticated;
grant execute on function public.get_direct_thread(uuid, timestamptz, integer) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.count_unread_messages() to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.direct_messages, public.conversation_members;
  end if;
end;
$$;
