import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Session, type Client } from '../../server/session';
import {
  parseClientMessage,
  type DisplayView,
  type PlayerView,
  type ServerMessage,
} from '../shared/protocol';

interface TestClient extends Client {
  messages: ServerMessage[];
  display(): DisplayView;
  player(): PlayerView;
  welcomeToken(): string;
  shots(): Array<Extract<ServerMessage, { type: 'shot' }>>;
}

function makeClient(isLocal = true): TestClient {
  const messages: ServerMessage[] = [];
  const client: TestClient = {
    isLocal,
    messages,
    send: (m) => void messages.push(m),
    display: () => [...messages].reverse().find((m) => m.type === 'display')!.view as DisplayView,
    player: () => [...messages].reverse().find((m) => m.type === 'player')!.view as PlayerView,
    welcomeToken: () => (messages.find((m) => m.type === 'welcome') as { token: string }).token,
    shots: () => messages.filter((m) => m.type === 'shot') as Array<Extract<ServerMessage, { type: 'shot' }>>,
  };
  return client;
}

let session: Session;
let display: TestClient;

function addDisplay() {
  display = makeClient();
  session.connect(display);
  session.handle(display, { type: 'hello', role: 'display' });
}

function addPlayer(token: string | null = null) {
  const c = makeClient(false);
  session.connect(c);
  session.handle(c, { type: 'hello', role: 'player', token });
  return c;
}

function startWith(n: number, mapId: 'classic' | 'pillars' | 'scatter' = 'classic') {
  const phones = Array.from({ length: n }, () => addPlayer()) as [TestClient, TestClient, ...TestClient[]];
  session.handle(display, { type: 'configure', mapId, seed: 1 });
  session.handle(display, { type: 'start' });
  return phones;
}

beforeEach(() => {
  session = new Session({ shotTimeoutMs: 5000 });
  addDisplay();
});

afterEach(() => {
  session.close();
  vi.useRealTimers();
});

describe('lobby', () => {
  it('only accepts the display role from the laptop itself', () => {
    const remote = makeClient(false);
    session.connect(remote);
    session.handle(remote, { type: 'hello', role: 'display' });
    expect(remote.messages).toEqual([{ type: 'rejected', text: expect.stringContaining('laptop') }]);
    // and it cannot control the game
    session.handle(remote, { type: 'start' });
    expect(display.display().phase).toBe('lobby');
  });

  it('assigns one player per phone, in join order', () => {
    const [a, b, c] = [addPlayer(), addPlayer(), addPlayer()];
    expect([a, b, c].map((p) => p.player().you.playerId)).toEqual([1, 2, 3]);
    expect(new Set([a, b, c].map((p) => p.welcomeToken())).size).toBe(3);
    expect(display.display().members.map((m) => m.name)).toEqual(['Player 1', 'Player 2', 'Player 3']);
    expect(c.player().playerCount).toBe(3);
  });

  it('needs at least two phones, then starts a match with exactly one soldier per phone', () => {
    addPlayer();
    session.handle(display, { type: 'start' });
    expect(display.display().phase).toBe('lobby');
    expect(display.display().notice?.kind).toBe('error');

    addPlayer();
    addPlayer();
    session.handle(display, { type: 'start' });
    const view = display.display();
    expect(view.phase).toBe('playing');
    expect(view.game!.players).toHaveLength(3);
    expect(view.game!.soldiers).toHaveLength(3);
    expect(view.members.every((m) => m.alive)).toBe(true);
  });

  it('uses the chosen map', () => {
    startWith(2, 'pillars');
    expect(display.display().game!.config.mapId).toBe('pillars');
  });

  it('frees and renumbers seats when a phone leaves the lobby', () => {
    const [a, b, c] = [addPlayer(), addPlayer(), addPlayer()];
    session.disconnect(b);
    expect(display.display().members).toHaveLength(2);
    expect(a.player().you.playerId).toBe(1);
    expect(c.player().you.playerId).toBe(2);
  });

  it('caps the lobby at six players', () => {
    for (let i = 0; i < 6; i++) addPlayer();
    const seventh = addPlayer();
    expect(seventh.messages.at(-1)).toEqual({ type: 'rejected', text: expect.stringContaining('full') });
    expect(display.display().members).toHaveLength(6);
  });

  it('configure is ignored once the match is running', () => {
    startWith(2);
    session.handle(display, { type: 'configure', mapId: 'scatter', seed: 9 });
    expect(display.display().mapId).toBe('classic');
  });
});

describe('turns', () => {
  it('only the active phone can draft and fire; others are ignored', () => {
    const [p1, p2] = startWith(2);
    expect(p1.player().isMyTurn).toBe(true);
    expect(p2.player().isMyTurn).toBe(false);

    session.handle(p2, { type: 'draft', expression: 'x', direction: -1 });
    expect(display.display().draft).toBeNull();
    session.handle(p2, { type: 'fire', expression: '0', direction: -1 });
    expect(display.shots()).toHaveLength(0);

    session.handle(p1, { type: 'draft', expression: 'sin(x)', direction: 1 });
    const draft = display.display().draft!;
    expect(draft).toMatchObject({ playerId: 1, expression: 'sin(x)', direction: 1, error: null });
    expect(draft.points!.length).toBeGreaterThan(10);
  });

  it('reports invalid drafts to the display and the active phone, and refuses to fire them', () => {
    const [p1] = startWith(2);
    session.handle(p1, { type: 'draft', expression: 'sin(', direction: 1 });
    expect(display.display().draft!.error).toBeTruthy();
    expect(p1.player().draftError).toBeTruthy();
    session.handle(p1, { type: 'fire', expression: 'sin(', direction: 1 });
    expect(display.shots()).toHaveLength(0);
    expect(display.display().shotInFlight).toBe(false);
    expect(p1.player().isMyTurn).toBe(true);
  });

  it('firing sends the shot to the display and locks everyone until the animation is done', () => {
    const [p1, p2] = startWith(2);
    session.handle(p1, { type: 'fire', expression: '0', direction: 1 });
    expect(display.shots()).toHaveLength(1);
    const shot = display.shots()[0]!;
    expect(shot.shot.shooterId).toBe('p1');
    expect(display.display().shotInFlight).toBe(true);
    expect(p1.player().isMyTurn).toBe(false);
    expect(p2.player().isMyTurn).toBe(false);

    // no second shot, no premature turn change
    session.handle(p1, { type: 'fire', expression: '0', direction: 1 });
    session.handle(display, { type: 'shotDone', id: shot.id + 99 });
    expect(display.shots()).toHaveLength(1);
    expect(display.display().shotInFlight).toBe(true);

    session.handle(display, { type: 'shotDone', id: shot.id });
    expect(display.display().shotInFlight).toBe(false);
    expect(display.display().game!.turn.currentPlayerId).toBe(2);
    expect(display.display().draft).toBeNull();
    expect(p2.player().isMyTurn).toBe(true);
    expect(p2.player().turnDirection).toBe(-1);
    expect(p1.player().isMyTurn).toBe(false);
    expect(display.display().notice?.text).toMatch(/obstacle/);
  });

  it('completes a shot by itself if the display never answers', () => {
    vi.useFakeTimers();
    session.close();
    session = new Session({ shotTimeoutMs: 3000 });
    addDisplay();
    const [p1] = startWith(2);
    session.handle(p1, { type: 'fire', expression: '0', direction: 1 });
    expect(display.display().shotInFlight).toBe(true);
    vi.advanceTimersByTime(3001);
    expect(display.display().shotInFlight).toBe(false);
    expect(display.display().game!.turn.currentPlayerId).toBe(2);
  });

  it('rotates through three players and skips eliminated ones', () => {
    const phones = startWith(3);
    const order: number[] = [];
    for (let i = 0; i < 4; i++) {
      const current = display.display().game!.turn.currentPlayerId;
      order.push(current);
      session.handle(phones[current - 1]!, { type: 'fire', expression: '0', direction: current === 1 ? 1 : -1 });
      const id = display.shots().at(-1)!.id;
      session.handle(display, { type: 'shotDone', id });
    }
    expect(order).toEqual([1, 2, 3, 1]);
  });
});

describe('full match', () => {
  it('a hit eliminates, the last player standing wins, and the host can play again or go back to the lobby', () => {
    const [p1, p2] = startWith(2);
    session.handle(p1, { type: 'fire', expression: '0.012*x*(42-x)', direction: 1 });
    const shot = display.shots()[0]!;
    expect(shot.shot.outcome).toBe('hit-soldier');
    expect(shot.shot.targetId).toBe('p2');
    session.handle(display, { type: 'shotDone', id: shot.id });

    const view = display.display();
    expect(view.phase).toBe('over');
    expect(view.game!.winnerId).toBe(1);
    expect(view.members.map((m) => m.alive)).toEqual([true, false]);
    expect(view.notice?.text).toMatch(/Player 1 eliminated Player 2.*Player 1 wins/);
    expect(p1.player().winnerId).toBe(1);
    expect(p2.player().you.alive).toBe(false);
    expect(p2.player().isMyTurn).toBe(false);

    session.handle(display, { type: 'restart' });
    expect(display.display().phase).toBe('playing');
    expect(display.display().game!.soldiers.every((s) => s.alive)).toBe(true);
    expect(display.display().game!.turn).toEqual({ currentPlayerId: 1, turnNumber: 1, hasFired: false });
    expect(display.display().notice).toBeNull();
    expect(p1.player().isMyTurn).toBe(true);

    session.handle(display, { type: 'lobby' });
    expect(display.display().phase).toBe('lobby');
    expect(display.display().game).toBeNull();
    expect(display.display().members).toHaveLength(2);
  });

  it('restart during a shot cancels it cleanly', () => {
    const [p1] = startWith(2);
    session.handle(p1, { type: 'fire', expression: '0', direction: 1 });
    const id = display.shots()[0]!.id;
    session.handle(display, { type: 'restart' });
    expect(display.display().shotInFlight).toBe(false);
    session.handle(display, { type: 'shotDone', id });
    expect(display.display().game!.turn.turnNumber).toBe(1);
  });
});

describe('connection loss', () => {
  it('keeps the seat of a disconnected phone, lets it reconnect with its token, and rejects strangers', () => {
    const [p1, p2] = startWith(2);
    const token = p2.welcomeToken();
    session.disconnect(p2);
    expect(display.display().members[1]!.connected).toBe(false);

    const stranger = addPlayer();
    expect(stranger.messages.at(-1)).toEqual({ type: 'rejected', text: expect.stringContaining('already running') });

    const back = addPlayer(token);
    expect(back.player().you.playerId).toBe(2);
    expect(display.display().members[1]!.connected).toBe(true);
    expect(p1.player().you.playerId).toBe(1);
  });

  it('the host can skip the turn of an offline player', () => {
    const [p1, p2] = startWith(2);
    session.handle(p1, { type: 'fire', expression: '0', direction: 1 });
    session.handle(display, { type: 'shotDone', id: display.shots()[0]!.id });
    session.disconnect(p2);
    expect(display.display().game!.turn.currentPlayerId).toBe(2);

    session.handle(display, { type: 'skipTurn' });
    expect(display.display().game!.turn.currentPlayerId).toBe(1);
    expect(display.display().notice?.kind).toBe('warning');
  });
});

describe('parseClientMessage', () => {
  it('accepts well-formed messages', () => {
    expect(parseClientMessage({ type: 'fire', expression: 'x', direction: 1 })).toEqual({
      type: 'fire',
      expression: 'x',
      direction: 1,
    });
    expect(parseClientMessage({ type: 'hello', role: 'player', token: null })).toEqual({
      type: 'hello',
      role: 'player',
      token: null,
    });
    expect(parseClientMessage({ type: 'configure', mapId: 'scatter', seed: 5 })).not.toBeNull();
  });

  it.each([
    null,
    'fire',
    42,
    {},
    { type: 'nope' },
    { type: 'fire', expression: 5, direction: 1 },
    { type: 'fire', expression: 'x', direction: 2 },
    { type: 'fire', expression: 'x'.repeat(501), direction: 1 },
    { type: 'configure', mapId: 'moon', seed: 1 },
    { type: 'configure', mapId: 'classic', seed: 1.5 },
    { type: 'hello', role: 'admin' },
    { type: 'shotDone', id: 'one' },
  ])('rejects malformed %j', (raw) => {
    expect(parseClientMessage(raw)).toBeNull();
  });
});
