/**
 * Parses the URL Supabase Auth redirects to after e-mail confirmation or a
 * password-reset request (PKCE flow: `?code=…`, errors in query or fragment).
 */
export type AuthCallback =
  | { kind: 'code'; code: string; next: 'reset' | null }
  | { kind: 'error'; code: string | null; description: string }
  | { kind: 'none' };

export function parseAuthCallback(url: string): AuthCallback {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { kind: 'none' };
  }
  const params = new URLSearchParams(parsed.search);
  new URLSearchParams(parsed.hash.replace(/^#/, '')).forEach((value, key) => {
    if (!params.has(key)) params.set(key, value);
  });

  const error = params.get('error_description') ?? params.get('error');
  if (error) return { kind: 'error', code: params.get('error_code'), description: error };

  const code = params.get('code');
  if (code) return { kind: 'code', code, next: params.get('next') === 'reset' ? 'reset' : null };
  return { kind: 'none' };
}
