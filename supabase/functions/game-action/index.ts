// PARTYVERSE — game-action Edge Function (Deno).
//
// POST { op: 'start', lobbyId } | { op: 'action', matchId, version, action } | { op: 'timeout', matchId }
// The caller is identified from their JWT. The service role key is only used
// server side to call the engine_* RPCs, which are not executable by clients.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { GameActionError, handleGameRequest, parseRequest, type GameDatabase } from './handler.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

function databaseOf(admin: SupabaseClient): GameDatabase {
  const call = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
    const { data, error } = await admin.rpc(fn, args);
    if (error) {
      const code = error.message.match(/PV_[A-Z_]+/)?.[0];
      if (code) throw new GameActionError(code, code === 'PV_STALE_STATE' ? 409 : 400);
      console.error(`${fn} failed`, error.message);
      throw new GameActionError('PV_UNKNOWN', 500);
    }
    return data as T;
  };
  return {
    prepareStart: (lobbyId, userId) => call('engine_prepare_start', { p_lobby: lobbyId, p_user: userId }),
    createMatch: (lobbyId, userId, seats, transition) =>
      call('engine_create_match', { p_lobby: lobbyId, p_user: userId, p_seats: seats, p_transition: transition }),
    load: (matchId, userId) => call('engine_load', { p_match: matchId, p_user: userId }),
    commit: (matchId, userId, expectedVersion, kind, action, transition) =>
      call('engine_commit', {
        p_match: matchId,
        p_user: userId,
        p_expected_version: expectedVersion,
        p_kind: kind,
        p_action: action,
        p_transition: transition,
      }),
  };
}

const url = Deno.env.get('SUPABASE_URL') ?? '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const database = databaseOf(admin);

async function handle(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  if (!url || !anonKey || !serviceKey) return json(500, { error: 'PV_NOT_CONFIGURED' });

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json(401, { error: 'PV_NOT_AUTHENTICATED' });
  const asUser = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await asUser.auth.getUser();
  if (userError || !userData.user) return json(401, { error: 'PV_NOT_AUTHENTICATED' });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'PV_INVALID_INPUT' });
  }
  const parsed = parseRequest(body);
  if (!parsed) return json(400, { error: 'PV_INVALID_INPUT' });

  try {
    return json(200, await handleGameRequest(database, userData.user.id, parsed));
  } catch (error) {
    if (error instanceof GameActionError) return json(error.status, { error: error.code });
    console.error('game-action failed', error);
    return json(500, { error: 'PV_UNKNOWN' });
  }
}

Deno.serve({ port: Number(Deno.env.get('PORT') ?? 8000) }, handle);
