// Minimal HS256 JWT signer for local E2E keys (anon / service_role).
import { createHmac } from 'node:crypto';

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

export function sign(payload, secret) {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64(payload);
  const signature = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${signature}`;
}

if (process.argv[2]) {
  const now = Math.floor(Date.now() / 1000);
  process.stdout.write(sign({ role: process.argv[2], iss: 'supabase-e2e', iat: now, exp: now + 86_400 }, process.argv[3]));
}
