// Local stand-in for https://exp.host/--/api/v2/push/send: records every
// message (one JSON line each) and answers with "ok" tickets.
import { appendFileSync } from 'node:fs';
import { createServer } from 'node:http';

const [port, logFile] = process.argv.slice(2);

createServer((request, response) => {
  let body = '';
  request.on('data', (chunk) => (body += chunk));
  request.on('end', () => {
    const messages = JSON.parse(body || '[]');
    for (const message of messages) appendFileSync(logFile, `${JSON.stringify({ message, authorization: request.headers.authorization ?? null })}\n`);
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ data: messages.map((_, i) => ({ status: 'ok', id: `ticket-${Date.now()}-${i}` })) }));
  });
}).listen(Number(port), '127.0.0.1');
