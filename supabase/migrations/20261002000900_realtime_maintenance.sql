-- PARTYVERSE — Realtime publication and scheduled maintenance

-- Realtime postgres_changes respects RLS: subscribers only receive rows they
-- can select. Clients use these events as invalidation signals and re-read
-- through the RPCs above, so payload shape is never trusted for game logic.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.lobbies,
      public.lobby_members,
      public.lobby_messages,
      public.lobby_invitations,
      public.matches,
      public.notifications,
      public.friend_requests,
      public.matchmaking_tickets;
  end if;
end;
$$;

-- Idempotent housekeeping, safe to run every minute.
create or replace function app_private.run_maintenance()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expired_invites integer;
  v_expired_tickets integer;
  v_timeouts integer := 0;
  v_disconnected integer := 0;
  v_expired_lobbies integer := 0;
  v_row record;
begin
  update public.lobby_invitations set status = 'expired'
   where status = 'pending' and expires_at <= now();
  get diagnostics v_expired_invites = row_count;

  update public.matchmaking_tickets set status = 'expired'
   where status = 'searching' and expires_at <= now();
  get diagnostics v_expired_tickets = row_count;

  -- Enforce turn clocks nobody claimed (15 s grace for in-flight requests).
  for v_row in
    select id from public.matches
     where status = 'active' and turn_deadline < now() - interval '15 seconds'
  loop
    begin
      perform app_private.lock_match(v_row.id);
      if exists (select 1 from public.matches where id = v_row.id and status = 'active'
                   and turn_deadline < now() - interval '15 seconds') then
        perform app_private.finalize_match(
          v_row.id,
          (select (1 - current_turn_seat)::smallint from public.matches where id = v_row.id),
          'timeout', null);
        v_timeouts := v_timeouts + 1;
      end if;
    exception when others then
      raise warning 'maintenance: timeout for match % failed: %', v_row.id, sqlerrm;
    end;
  end loop;

  -- Remove members of waiting rooms whose app stopped sending heartbeats.
  for v_row in
    select lm.lobby_id, lm.user_id
      from public.lobby_members lm
      join public.lobbies l on l.id = lm.lobby_id
      left join public.presence pr on pr.user_id = lm.user_id
     where l.status in ('waiting', 'ready')
       and lm.joined_at < now() - interval '5 minutes'
       and (pr.user_id is null or pr.signed_out_at is not null or pr.heartbeat_at < now() - interval '5 minutes')
  loop
    perform app_private.remove_lobby_member(v_row.lobby_id, v_row.user_id, 'disconnected');
    v_disconnected := v_disconnected + 1;
  end loop;

  -- Close rooms idle for two hours.
  for v_row in
    select id from public.lobbies
     where status in ('waiting', 'ready') and last_activity_at < now() - interval '2 hours'
  loop
    perform app_private.close_lobby(v_row.id, 'expired');
    v_expired_lobbies := v_expired_lobbies + 1;
  end loop;

  -- Retention (docs/architecture/database.md#retention).
  delete from app_private.rate_limit_events where created_at < now() - interval '1 day';
  delete from public.notifications where read_at is not null and read_at < now() - interval '90 days';
  delete from public.lobby_messages m
   using public.lobbies l
   where l.id = m.lobby_id and l.closed_at is not null and l.closed_at < now() - interval '30 days';

  return jsonb_build_object(
    'expired_invitations', v_expired_invites,
    'expired_tickets', v_expired_tickets,
    'timeouts', v_timeouts,
    'disconnected_members', v_disconnected,
    'expired_lobbies', v_expired_lobbies);
end;
$$;

grant execute on function app_private.run_maintenance() to service_role;

-- Schedule with pg_cron when available (enabled by default on Supabase).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('partyverse-maintenance', '* * * * *', 'select app_private.run_maintenance()');
  else
    raise notice 'pg_cron unavailable: schedule app_private.run_maintenance() externally (see docs/operations.md)';
  end if;
end;
$$;
