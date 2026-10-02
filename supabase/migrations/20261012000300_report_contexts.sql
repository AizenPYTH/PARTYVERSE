-- PARTYVERSE — Reports from private messages and group chats, with the
-- reported player's recent messages captured server-side as evidence.
alter table public.reports drop constraint reports_context_check;
alter table public.reports add constraint reports_context_check
  check (context in ('profile', 'username', 'lobby_chat', 'match', 'direct_message', 'group_chat'));

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
  if p_context not in ('profile', 'username', 'lobby_chat', 'match', 'direct_message', 'group_chat')
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

  if p_context = 'direct_message' then
    select jsonb_build_object('messages', coalesce(jsonb_agg(jsonb_build_object(
             'body', m.body, 'created_at', m.created_at) order by m.created_at desc), '[]'::jsonb))
      into v_evidence
      from (select dm.body, dm.created_at from public.direct_messages dm
              join public.conversations c on c.id = dm.conversation_id
             where c.user_a = least(v_uid, p_target) and c.user_b = greatest(v_uid, p_target)
               and dm.sender_id = p_target
             order by dm.created_at desc limit 20) m;
  end if;

  if p_context = 'group_chat' and p_context_ref is not null then
    if not app_private.is_group_member(p_context_ref, v_uid) then
      raise exception 'PV_GROUP_NOT_FOUND';
    end if;
    select jsonb_build_object('messages', coalesce(jsonb_agg(jsonb_build_object(
             'body', m.body, 'created_at', m.created_at) order by m.created_at desc), '[]'::jsonb))
      into v_evidence
      from (select body, created_at from public.group_messages
             where group_id = p_context_ref and sender_id = p_target
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
