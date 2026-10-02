import { z } from 'zod';

/**
 * Public runtime configuration. Only `EXPO_PUBLIC_*` variables are inlined in
 * the bundle, and they must be referenced literally for Expo to inline them.
 * The anon key is public by design: data access is enforced by RLS.
 */
const schema = z.object({
  supabaseUrl: z.url({ protocol: /^https?$/ }),
  supabaseAnonKey: z.string().min(20),
});

export type AppConfig = z.infer<typeof schema>;

export type ConfigState = { ok: true; config: AppConfig } | { ok: false; missing: string[] };

export function readConfig(source: { supabaseUrl?: string; supabaseAnonKey?: string }): ConfigState {
  const parsed = schema.safeParse(source);
  if (parsed.success) return { ok: true, config: parsed.data };
  const names: Record<string, string> = {
    supabaseUrl: 'EXPO_PUBLIC_SUPABASE_URL',
    supabaseAnonKey: 'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  };
  const missing = [...new Set(parsed.error.issues.map((issue) => names[String(issue.path[0])] ?? String(issue.path[0])))];
  return { ok: false, missing };
}

export const configState: ConfigState = readConfig({
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
});
