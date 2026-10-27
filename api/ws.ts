import { createServer, type IncomingMessage } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { parseClientMessage, type ServerMessage } from '../src/shared/protocol';
import { Session, type Client } from '../server/session';

// Vercel-native trial: state survives only on this Function instance, so use a single instance for a match.
const session = new Session();
const displayToken = process.env.GRAPHWARS_DISPLAY_TOKEN;

function hasValidToken(req: IncomingMessage, token: string | undefined): boolean {
  const authorization = req.headers.authorization;
  if (!token || token.length < 32 || typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) return false;
  const provided = Buffer.from(authorization.slice('Bearer '.length));
  const expected = Buffer.from(token);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const photoMatch = url.pathname === '/api/ws' ? url.searchParams.get('photo') : null;
  if (photoMatch && /^\d{1,2}$/.test(photoMatch)) {
    if (!hasValidToken(req, displayToken)) {
      res.writeHead(401, { 'cache-control': 'no-store' }).end('Unauthorized');
      return;
    }
    const photo = session.getPhoto(Number(photoMatch));
    if (!photo) {
      res.writeHead(404).end('No photo');
      return;
    }
    res.writeHead(200, {
      'content-type': 'image/jpeg',
      'content-length': photo.length,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    res.end(photo);
    return;
  }
  res.writeHead(426, { 'content-type': 'text/plain; charset=utf-8' }).end('WebSocket upgrade required');
});
const wss = new WebSocketServer({ server, maxPayload: 40_000 });
const alive = new WeakMap<WebSocket, boolean>();

wss.on('connection', (socket) => {
  const client: Client = {
    isLocal: false,
    send: (message: ServerMessage) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
    },
  };
  session.connect(client);
  alive.set(socket, true);
  socket.on('pong', () => alive.set(socket, true));
  socket.on('message', (data) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data.toString());
    } catch {
      return;
    }
    const message = parseClientMessage(parsed);
    if (!message) return;
    if (message.type === 'hello' && message.role === 'display') {
      if (!displayToken || displayToken.length < 32) {
        client.send({ type: 'rejected', text: 'Set GRAPHWARS_DISPLAY_TOKEN to a random secret with at least 32 characters in Vercel project settings.' });
        return;
      }
      const provided = Buffer.from(message.token ?? '');
      const expected = Buffer.from(displayToken);
      if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
        client.send({ type: 'rejected', text: 'Invalid host access token.' });
        return;
      }
      client.isLocal = true;
    }
    session.handle(client, message);
  });
  socket.on('close', () => session.disconnect(client));
  socket.on('error', () => socket.terminate());
});

const heartbeat = setInterval(() => {
  for (const socket of wss.clients) {
    if (alive.get(socket) === false) {
      socket.terminate();
      continue;
    }
    alive.set(socket, false);
    socket.ping();
  }
}, 10_000);
heartbeat.unref();

export const config = { maxDuration: 300 };
export default server;
