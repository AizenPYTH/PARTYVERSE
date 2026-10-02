// PARTYVERSE — push-dispatch Edge Function (Deno).
//
// Sends pending push notifications through the Expo push service. Meant to be
// invoked every minute by a scheduler (see docs/deploy.md). Callers must send
// `Authorization: Bearer <PUSH_DISPATCH_SECRET>`; the service role key never
// leaves the server.
import { createClient } from '@supabase/supabase-js';

import { dispatchPush, safeEqual, type PushDatabase, type PushJob, type PushResult } from './handler.ts';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const dispatchSecret = Deno.env.get('PUSH_DISPATCH_SECRET') ?? '';
const expoToken = Deno.env.get('EXPO_ACCESS_TOKEN') ?? undefined;
// Overridable for tests only; production uses the Expo push service.
const endpoint = Deno.env.get('EXPO_PUSH_URL') ?? undefined;
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const database: PushDatabase = {
  async claim(limit) {
    const { data, error } = await admin.rpc('push_claim_batch', { p_limit: limit });
    if (error) throw new Error(`push_claim_batch: ${error.message}`);
    return (data ?? []) as PushJob[];
  },
  async complete(results: PushResult[]) {
    const { data, error } = await admin.rpc('push_complete_batch', { p_results: results });
    if (error) throw new Error(`push_complete_batch: ${error.message}`);
    return data as number;
  },
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve({ port: Number(Deno.env.get('PORT') ?? 8000) }, async (request) => {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  if (!url || !serviceKey || !dispatchSecret) return json(500, { error: 'PV_NOT_CONFIGURED' });
  const provided = request.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '';
  if (!safeEqual(provided, dispatchSecret)) return json(401, { error: 'PV_NOT_AUTHENTICATED' });
  try {
    const result = await dispatchPush(database, fetch, { accessToken: expoToken, endpoint });
    return json(200, result);
  } catch (error) {
    console.error('push-dispatch failed', error);
    return json(500, { error: 'PV_UNKNOWN' });
  }
});
