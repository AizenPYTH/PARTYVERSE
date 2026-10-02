// E2E gateway: a tiny stand-in for the Supabase API gateway.
//   /auth/v1/* → Supabase Auth (GoTrue)   /rest/v1/* → PostgREST
//   /functions/v1/<name> → Edge Function served by Deno (name=port arguments)
//   /realtime/v1 is intentionally absent: the app must fall back to polling.
// Also serves the exported web build with an SPA fallback.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const [apiPort, authPort, restPort, webPort, webRoot, ...functionArgs] = process.argv.slice(2);
const routes = [
  ['/auth/v1', Number(authPort)],
  ['/rest/v1', Number(restPort)],
  // Supabase forwards /functions/v1/<name> to the function as /<name>.
  ...functionArgs.map((arg) => {
    const [name, port] = arg.split('=');
    return [`/functions/v1/${name}`, Number(port), `/${name}`];
  }),
];

function cors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] ?? '*');
  res.setHeader('Access-Control-Expose-Headers', 'content-range, x-supabase-api-version');
}

const api = http.createServer((req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.writeHead(204).end();
  const route = routes.find(([prefix]) => req.url.startsWith(prefix));
  if (!route) return res.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"not_available_in_e2e"}');
  const [prefix, port, base = ''] = route;
  const upstream = http.request(
    { host: '127.0.0.1', port, method: req.method, path: base + req.url.slice(prefix.length) || '/', headers: { ...req.headers, host: `127.0.0.1:${port}` } },
    (response) => {
      const headers = { ...response.headers };
      delete headers['access-control-allow-origin'];
      res.writeHead(response.statusCode ?? 502, headers);
      response.pipe(res);
    },
  );
  upstream.on('error', (error) => res.writeHead(502).end(String(error)));
  req.pipe(upstream);
});
api.on('upgrade', (_req, socket) => socket.destroy());
api.listen(Number(apiPort), '127.0.0.1');

const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.ico': 'image/x-icon', '.css': 'text/css' };
http
  .createServer(async (req, res) => {
    const url = new URL(req.url, 'http://local');
    const file = path.join(webRoot, decodeURIComponent(url.pathname));
    try {
      const body = await readFile(file.startsWith(webRoot) && path.extname(file) ? file : path.join(webRoot, 'index.html'));
      res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'text/html' }).end(body);
    } catch {
      res.writeHead(200, { 'content-type': 'text/html' }).end(await readFile(path.join(webRoot, 'index.html')));
    }
  })
  .listen(Number(webPort), '127.0.0.1');

console.log(`gateway: api http://127.0.0.1:${apiPort}  web http://127.0.0.1:${webPort}`);
