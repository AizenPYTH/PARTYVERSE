-- PARTYVERSE — Choosing the game of an existing room (host only).
create or replace function public.change_lobby_game(p_lobby uuid, p_game_id text)
returns public.lobbies
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app_private.require_user();
  v_lobby public.lobbies := app_private.require_lobby_host(p_lobby, v_uid);
  v_game public.game_catalog;
  v_players integer;
begin
  if v_lobby.status not in ('waiting', 'ready') then
    raise exception 'PV_LOBBY_IN_GAME';
  end if;
  if v_lobby.source = 'matchmaking' then
    raise exception 'PV_LOBBY_FORBIDDEN';
  end if;
  select * into v_game from public.game_catalog where id = p_game_id;
  if v_game.id is null then
    raise exception 'PV_GAME_NOT_FOUND';
  end if;
  if v_game.availability not in ('available', 'beta') then
    raise exception 'PV_GAME_UNAVAILABLE';
  end if;
  select count(*) into v_players from public.lobby_members where lobby_id = p_lobby and role = 'player';
  if v_players > v_game.max_players then
    raise exception 'PV_TOO_MANY_PLAYERS';
  end if;

  update public.lobbies
     set game_id = v_game.id,
         mode = 'classic',
         settings = app_private.normalize_game_settings(v_game.id, '{}'::jsonb),
         max_players = greatest(least(v_game.max_players, greatest(max_players, v_game.min_players)), v_players),
         ranked = false,
         last_activity_at = now()
   where id = p_lobby
  returning * into v_lobby;

  update public.lobby_members set is_ready = false where lobby_id = p_lobby;
  perform app_private.recompute_lobby_status(p_lobby);
  perform app_private.lobby_system_message(p_lobby, 'game_changed', jsonb_build_object('game_id', v_game.id, 'name', v_game.name));
  select * into v_lobby from public.lobbies where id = p_lobby;
  return v_lobby;
end;
$$;

grant execute on function public.change_lobby_game(uuid, text) to authenticated;
