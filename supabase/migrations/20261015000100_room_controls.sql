-- PARTYVERSE — Room controls: explicit host transfer and quick join.

create or replace function public.transfer_lobby_host(p_lobby uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
  v_lobby public.lobbies := app_private.require_lobby_host(p_lobby, v_uid);
begin
  if v_lobby.source = 'matchmaking' then
    raise exception 'PV_LOBBY_FORBIDDEN';
  end if;
  if p_user = v_uid then
    raise exception 'PV_CANNOT_TARGET_SELF';
  end if;
  if not exists (select 1 from public.lobby_members where lobby_id = p_lobby and user_id = p_user and role = 'player') then
    raise exception 'PV_NOT_LOBBY_MEMBER';
  end if;
  update public.lobbies set host_id = p_user, last_activity_at = now() where id = p_lobby;
  perform app_private.lobby_system_message(p_lobby, 'host_changed', app_private.member_meta(p_user));
end;
$$;

-- Joins the fullest open public room of the game (never a stranger who
-- blocked you, or whom you blocked), or opens a new public room.
create or replace function public.quick_join(p_game_id text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
  v_lobby uuid;
  v_game public.game_catalog;
begin
  select * into v_game from public.game_catalog where id = p_game_id;
  if v_game.id is null or v_game.availability not in ('available', 'beta') then
    raise exception 'PV_GAME_UNAVAILABLE';
  end if;
  perform app_private.enforce_rate_limit(v_uid, 'quick_join', 20, interval '10 minutes');

  select l.id into v_lobby
    from public.lobbies l
   where l.game_id = p_game_id
     and l.visibility = 'public'
     and l.source <> 'matchmaking'
     and l.status in ('waiting', 'ready')
     and not exists (select 1 from public.party_sessions s where s.lobby_id = l.id and s.status = 'active')
     and not app_private.is_lobby_member(l.id, v_uid)
     and not exists (select 1 from public.lobby_kicks k where k.lobby_id = l.id and k.user_id = v_uid)
     and not exists (select 1 from public.lobby_members m where m.lobby_id = l.id and app_private.is_blocked_between(m.user_id, v_uid))
     and (select count(*) from public.lobby_members m where m.lobby_id = l.id and m.role = 'player') < l.max_players
   order by (select count(*) from public.lobby_members m where m.lobby_id = l.id and m.role = 'player') desc, l.created_at
   limit 1;

  if v_lobby is not null then
    return public.join_lobby(v_lobby, false);
  end if;
  return (public.create_lobby(p_game_id, 'public', null, true, false, '{}'::jsonb, '')).id;
end;
$$;

revoke all on function public.transfer_lobby_host(uuid, uuid) from public, anon;
revoke all on function public.quick_join(text) from public, anon;
grant execute on function public.transfer_lobby_host(uuid, uuid) to authenticated;
grant execute on function public.quick_join(text) to authenticated;
