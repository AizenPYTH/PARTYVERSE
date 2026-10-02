// PARTYVERSE — delete-account Edge Function (Deno)
//
// Deletes the caller's account. The caller is identified from their JWT; the
// service role key never leaves the server. Before removing the auth user,
// `prepare_account_deletion` runs as the user to forfeit active matches and
// leave lobbies. Deleting auth.users cascades to every personal table;
// opponents' match history is kept with the player anonymized (SET NULL).
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json(401, { error: 'unauthorized' });

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) return json(500, { error: 'not_configured' });

  const asUser = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await asUser.auth.getUser();
  if (userError || !userData.user) return json(401, { error: 'unauthorized' });

  const prepared = await asUser.rpc('prepare_account_deletion');
  if (prepared.error) {
    console.error('prepare_account_deletion failed', prepared.error.message);
    return json(500, { error: 'prepare_failed' });
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: deleteError } = await admin.auth.admin.deleteUser(userData.user.id);
  if (deleteError) {
    console.error('deleteUser failed', deleteError.message);
    return json(500, { error: 'delete_failed' });
  }

  console.info('account deleted', userData.user.id);
  return json(200, { deleted: true });
});
