import { createServer, type IncomingMessage, type Server } from 'node:http';
import { networkInterfaces } from 'node:os';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { parseClientMessage } from '../src/shared/protocol';
import { Session, type Client } from './session';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

/** IPv4 addresses of this machine on the local network (what phones can connect to). */
export function lanAddresses(): string[] {
  const out: string[] = [];
  for (const infos of Object.values(networkInterfaces())) {
    for (const info of infos ?? []) {
      if (info.family === 'IPv4' && !info.internal) out.push(info.address);
    }
  }
  return out;
}

function ownAddresses(): Set<string> {
  const set = new Set<string>(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
  for (const a of lanAddresses()) {
    set.add(a);
    set.add(`::ffff:${a}`);
  }
  return set;
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/** Only connections that originate from this machine may control the game (host/display role). */
export function isLocalRequest(req: IncomingMessage, own: Set<string> = ownAddresses()): boolean {
  const remote = req.socket.remoteAddress ?? '';
  if (!own.has(remote)) return false;
  // Behind the Vite dev proxy every connection looks like loopback; trust its forwarded address.
  const forwarded = req.headers['x-forwarded-for'];
  if (LOOPBACK.has(remote) && typeof forwarded === 'string') {
    const first = (forwarded.split(',')[0] ?? '').trim();
    return own.has(first);
  }
  return true;
}

export interface AppOptions {
  port: number;
  host?: string;
  staticDir?: string;
  session?: Session;
}

export interface App {
  server: Server;
  session: Session;
  port: number;
  close(): Promise<void>;
}

export async function startApp(options: AppOptions): Promise<App> {
  const staticDir = options.staticDir;
  const session = options.session ?? new Session();
  const own = ownAddresses();
  let actualPort = options.port;

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');

    if (url.pathname === '/api/info') {
      res.writeHead(200, { 'content-type': MIME['.json'] as string, 'cache-control': 'no-store' });
      res.end(JSON.stringify({ port: actualPort, addresses: lanAddresses() }));
      return;
    }
    const photoMatch = /^\/api\/photo\/(\d{1,2})$/.exec(url.pathname);
    if (photoMatch) {
      const photo = session.getPhoto(Number(photoMatch[1]));
      if (!photo) {
        res.writeHead(404).end('No photo');
        return;
      }
      // The URL carries a version (?v=), so a given URL never changes: cache it hard.
      res.writeHead(200, {
        'content-type': 'image/jpeg',
        'content-length': photo.length,
        'cache-control': 'public, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
      });
      res.end(photo);
      return;
    }
    if (!staticDir) {
      res.writeHead(404).end('Not found');
      return;
    }

    let file = path.normalize(path.join(staticDir, decodeURIComponent(url.pathname)));
    if (!file.startsWith(path.normalize(staticDir))) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    if (!existsSync(file) || statSync(file).isDirectory()) {
      // Single-page app: /play and / both serve index.html.
      file = path.join(staticDir, 'index.html');
    }
    if (!existsSync(file)) {
      res.writeHead(404).end('Build the client first: npm run build');
      return;
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'content-type': MIME[ext] ?? 'application/octet-stream',
      'cache-control': ext === '.html' ? 'no-store' : 'public, max-age=3600',
    });
    res.end(readFileSync(file));
  });

  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 40_000 });
  const alive = new WeakMap<WebSocket, boolean>();

  wss.on('connection', (socket, req) => {
    const client: Client = {
      isLocal: isLocalRequest(req, own),
      send: (message) => {
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
      if (message) session.handle(client, message);
    });
    socket.on('close', () => session.disconnect(client));
    socket.on('error', () => socket.terminate());
  });

  // Drop sockets that went silent (phone locked, left wifi) so their seat shows as offline.
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

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host ?? '0.0.0.0', () => resolve());
  });
  const address = server.address();
  if (address && typeof address === 'object') actualPort = address.port;

  return {
    server,
    session,
    port: actualPort,
    close: () =>
      new Promise<void>((resolve) => {
        clearInterval(heartbeat);
        session.close();
        for (const socket of wss.clients) socket.terminate();
        wss.close(() => server.close(() => resolve()));
      }),
  };
}
