import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { isLocalRequest, startApp, type App } from '../../server/app';
import type { ClientMessage, DisplayView, PlayerView, ServerMessage } from '../shared/protocol';
import type { IncomingMessage } from 'node:http';

let app: App | null = null;

afterEach(async () => {
  await app?.close();
  app = null;
});

class Peer {
  messages: ServerMessage[] = [];
  private constructor(readonly socket: WebSocket) {
    socket.on('message', (data) => this.messages.push(JSON.parse(data.toString()) as ServerMessage));
  }
  static async connect(port: number): Promise<Peer> {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const peer = new Peer(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => resolve());
      socket.once('error', reject);
    });
    return peer;
  }
  send(message: ClientMessage) {
    this.socket.send(JSON.stringify(message));
  }
  async until<T>(find: () => T | undefined, ms = 3000): Promise<T> {
    const start = Date.now();
    for (;;) {
      const found = find();
      if (found !== undefined) return found;
      if (Date.now() - start > ms) throw new Error('timed out waiting for message');
      await new Promise((r) => setTimeout(r, 10));
    }
  }
  lastDisplay(pred: (v: DisplayView) => boolean = () => true) {
    return () => [...this.messages].reverse().map((m) => (m.type === 'display' ? m.view : undefined)).find((v) => v && pred(v));
  }
  lastPlayer(pred: (v: PlayerView) => boolean = () => true) {
    return () => [...this.messages].reverse().map((m) => (m.type === 'player' ? m.view : undefined)).find((v) => v && pred(v));
  }
}

describe('server over real WebSockets', () => {
  it('runs a complete two-phone match and reports the LAN info', async () => {
    app = await startApp({ port: 0, host: '127.0.0.1' });
    const info = (await (await fetch(`http://127.0.0.1:${app.port}/api/info`)).json()) as { port: number; addresses: string[] };
    expect(info.port).toBe(app.port);
    expect(Array.isArray(info.addresses)).toBe(true);

    const big = await Peer.connect(app.port);
    big.send({ type: 'hello', role: 'display' });
    const phone1 = await Peer.connect(app.port);
    phone1.send({ type: 'hello', role: 'player', token: null });
    const phone2 = await Peer.connect(app.port);
    phone2.send({ type: 'hello', role: 'player', token: null });

    await big.until(big.lastDisplay((v) => v.members.length === 2));
    big.send({
      type: 'configure',
      mapId: 'classic',
      seed: 1,
      options: { shotMode: 'turns', preview: true, countdownEnabled: false, countdownSeconds: 30 },
    });
    await big.until(big.lastDisplay((v) => v.options.shotMode === 'turns'));
    big.send({ type: 'start' });
    await phone1.until(phone1.lastPlayer((v) => v.phase === 'playing' && v.canAct));

    // Garbage and oversized frames are ignored without killing the server.
    phone1.socket.send('not json');
    phone1.socket.send(JSON.stringify({ type: 'fire', expression: 5 }));

    phone1.send({ type: 'draft', expression: 'sin(x)', direction: 1 });
    const draft = await big.until(big.lastDisplay((v) => v.drafts[0]?.expression === 'sin(x)'));
    expect(draft.drafts[0]!.points!.length).toBeGreaterThan(10);

    phone1.send({ type: 'fire', expression: '0.012*x*(42-x)', direction: 1 });
    const msg = await big.until(() => big.messages.find((m) => m.type === 'shots'));
    if (msg.type !== 'shots') throw new Error('unreachable');
    expect(msg.shots[0]!.shot.targetId).toBe('p2');
    big.send({ type: 'shotDone', id: msg.id });

    const over = await phone2.until(phone2.lastPlayer((v) => v.phase === 'over'));
    expect(over.winnerId).toBe(1);
    expect(over.you.alive).toBe(false);

    for (const p of [big, phone1, phone2]) p.socket.close();
  });

  it('runs a simultaneous round with a countdown over real sockets', async () => {
    app = await startApp({ port: 0, host: '127.0.0.1' });
    const big = await Peer.connect(app.port);
    big.send({ type: 'hello', role: 'display' });
    const phone1 = await Peer.connect(app.port);
    phone1.send({ type: 'hello', role: 'player', token: null });
    const phone2 = await Peer.connect(app.port);
    phone2.send({ type: 'hello', role: 'player', token: null });
    await big.until(big.lastDisplay((v) => v.members.length === 2));

    big.send({
      type: 'configure',
      mapId: 'classic',
      seed: 1,
      options: { shotMode: 'simultaneous', preview: false, countdownEnabled: true, countdownSeconds: 30 },
    });
    await big.until(big.lastDisplay((v) => v.options.shotMode === 'simultaneous'));
    big.send({ type: 'start' });

    const p1 = await phone1.until(phone1.lastPlayer((v) => v.phase === 'playing' && v.canAct));
    await phone2.until(phone2.lastPlayer((v) => v.phase === 'playing' && v.canAct));
    expect(p1.timer!.totalMs).toBe(30_000);

    phone1.send({ type: 'fire', expression: '0', direction: 1 });
    phone2.send({ type: 'fire', expression: '0', direction: -1 });
    const msg = await big.until(() => big.messages.find((m) => m.type === 'shots'));
    if (msg.type !== 'shots') throw new Error('unreachable');
    expect(msg.shots.map((s) => s.playerId)).toEqual([1, 2]);
    big.send({ type: 'shotDone', id: msg.id });
    await phone1.until(phone1.lastPlayer((v) => v.turnNumber === 2 && v.canAct));

    for (const p of [big, phone1, phone2]) p.socket.close();
  });

  it('stores a selfie sent over the socket and serves it as an image', async () => {
    app = await startApp({ port: 0, host: '127.0.0.1' });
    const big = await Peer.connect(app.port);
    big.send({ type: 'hello', role: 'display' });
    const phone = await Peer.connect(app.port);
    phone.send({ type: 'hello', role: 'player', token: null });
    await phone.until(phone.lastPlayer());

    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(2000).fill(9)]);
    phone.send({ type: 'photo', image: `data:image/jpeg;base64,${jpeg.toString('base64')}` });
    const view = await big.until(big.lastDisplay((v) => (v.members[0]?.photoRev ?? 0) > 0));
    const rev = view.members[0]!.photoRev;

    const res = await fetch(`http://127.0.0.1:${app.port}/api/photo/1?v=${rev}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(Buffer.from(await res.arrayBuffer())).toEqual(jpeg);
    expect((await fetch(`http://127.0.0.1:${app.port}/api/photo/2`)).status).toBe(404);
    expect((await fetch(`http://127.0.0.1:${app.port}/api/photo/abc`)).status).toBe(404);

    // A frame that is far too large is dropped by the server, which keeps working.
    phone.socket.send('x'.repeat(60_000));
    await new Promise((r) => setTimeout(r, 100));
    expect((await fetch(`http://127.0.0.1:${app.port}/api/info`)).status).toBe(200);

    for (const p of [big, phone]) p.socket.close();
  });

  it('serves the built client and falls back to index.html for /play', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const path = await import('node:path');
    const dir = mkdtempSync(path.join(tmpdir(), 'gw-'));
    writeFileSync(path.join(dir, 'index.html'), '<html>hello</html>');
    writeFileSync(path.join(dir, 'a.js'), 'x');
    app = await startApp({ port: 0, host: '127.0.0.1', staticDir: dir });

    const play = await fetch(`http://127.0.0.1:${app.port}/play`);
    expect(play.status).toBe(200);
    expect(await play.text()).toContain('hello');
    expect((await fetch(`http://127.0.0.1:${app.port}/a.js`)).headers.get('content-type')).toContain('javascript');
    const escape = await fetch(`http://127.0.0.1:${app.port}/..%2f..%2fpackage.json`);
    expect(await escape.text()).not.toContain('"name"');
  });
});

describe('isLocalRequest', () => {
  const own = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1', '192.168.1.20', '::ffff:192.168.1.20']);
  const req = (remote: string, forwarded?: string) =>
    ({ socket: { remoteAddress: remote }, headers: forwarded ? { 'x-forwarded-for': forwarded } : {} }) as unknown as IncomingMessage;

  it('accepts the laptop itself, rejects other devices', () => {
    expect(isLocalRequest(req('127.0.0.1'), own)).toBe(true);
    expect(isLocalRequest(req('::ffff:192.168.1.20'), own)).toBe(true);
    expect(isLocalRequest(req('192.168.1.55'), own)).toBe(false);
  });

  it('trusts x-forwarded-for only from the loopback dev proxy', () => {
    expect(isLocalRequest(req('127.0.0.1', '192.168.1.55'), own)).toBe(false);
    expect(isLocalRequest(req('127.0.0.1', '127.0.0.1'), own)).toBe(true);
    expect(isLocalRequest(req('192.168.1.55', '127.0.0.1'), own)).toBe(false);
  });
});
