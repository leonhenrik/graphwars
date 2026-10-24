import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Session, type Client } from '../../server/session';
import { DEFAULT_OPTIONS } from '../game/constants';
import { findShotWitness } from '../game/shotAnalysis';
import type { GameOptions, MapId } from '../game/types';
import {
  parseClientMessage,
  type DisplayView,
  type PlayerView,
  type ServerMessage,
} from '../shared/protocol';

type ShotsMessage = Extract<ServerMessage, { type: 'shots' }>;

interface TestClient extends Client {
  messages: ServerMessage[];
  display(): DisplayView;
  player(): PlayerView;
  welcomeToken(): string;
  shotMessages(): ShotsMessage[];
}

function makeClient(isLocal = true): TestClient {
  const messages: ServerMessage[] = [];
  return {
    isLocal,
    messages,
    send: (m) => void messages.push(m),
    display: () => [...messages].reverse().find((m) => m.type === 'display')!.view as DisplayView,
    player: () => [...messages].reverse().find((m) => m.type === 'player')!.view as PlayerView,
    welcomeToken: () => (messages.find((m) => m.type === 'welcome') as { token: string }).token,
    shotMessages: () => messages.filter((m) => m.type === 'shots') as ShotsMessage[],
  };
}

let session: Session;
let display: TestClient;

function fresh() {
  session?.close();
  session = new Session({ shotTimeoutMs: 5000 });
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

function configure(options: Partial<GameOptions> = {}, mapId: MapId = 'classic', seed = 1) {
  session.handle(display, { type: 'configure', mapId, seed, options: { ...DEFAULT_OPTIONS, ...options } });
}

type Phones = [TestClient, TestClient, TestClient, TestClient, TestClient, TestClient];

/** Joins `n` phones and starts a match. Destructure only as many phones as were joined. */
function startWith(n: number, options: Partial<GameOptions> = {}, mapId: MapId = 'classic'): Phones {
  const phones = Array.from({ length: n }, () => addPlayer()) as Phones;
  configure(options, mapId);
  session.handle(display, { type: 'start' });
  return phones;
}

/** A verified function with which player `from` hits player `to` first (see shotAnalysis.ts). */
function hit(from: number, to: number) {
  const g = display.display().game!;
  const layout = g.soldiers.map((s) => ({ id: s.id, x: s.x, y: s.y }));
  const w = findShotWitness(layout[from - 1]!, layout[to - 1]!, layout, g.battlefield.obstacles, g.battlefield.bounds);
  if (!w) throw new Error(`no shot ${from}->${to}`);
  return w;
}

const lastShots = () => display.shotMessages().at(-1)!;
const finishShots = () => session.handle(display, { type: 'shotDone', id: lastShots().id });

beforeEach(() => fresh());

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
  });

  it('uses the chosen map', () => {
    startWith(2, {}, 'pillars');
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
});

describe('game options', () => {
  it('defaults to turns, preview on, countdown off', () => {
    expect(display.display().options).toEqual({ shotMode: 'turns', preview: true, countdownEnabled: false, countdownSeconds: 30 });
  });

  it('are configured in the lobby, shown to phones, and locked once the match runs', () => {
    const phone = addPlayer();
    configure({ shotMode: 'simultaneous', preview: false, countdownEnabled: true, countdownSeconds: 45 }, 'scatter', 9);
    const expected = { shotMode: 'simultaneous', preview: false, countdownEnabled: true, countdownSeconds: 45 };
    expect(display.display().options).toEqual(expected);
    expect(phone.player().options).toEqual(expected);
    expect(display.display().mapId).toBe('scatter');

    addPlayer();
    session.handle(display, { type: 'start' });
    configure({ shotMode: 'turns' });
    expect(display.display().options.shotMode).toBe('simultaneous');
    expect(display.display().mapId).toBe('scatter');
  });

  it('keeps the options when restarting', () => {
    startWith(2, { shotMode: 'simultaneous' });
    session.handle(display, { type: 'restart' });
    expect(display.display().options.shotMode).toBe('simultaneous');
  });
});

describe('preview option', () => {
  it('on: the big screen gets the expression and the curve', () => {
    const [p1] = startWith(2, { preview: true });
    session.handle(p1, { type: 'draft', expression: 'sin(x)', direction: 1 });
    const [draft] = display.display().drafts;
    expect(draft).toMatchObject({ playerId: 1, expression: 'sin(x)', direction: 1, error: null });
    expect(draft!.points!.length).toBeGreaterThan(10);
  });

  it('off: the big screen learns nothing about the function, but the phone still sees syntax errors', () => {
    const [p1] = startWith(2, { preview: false });
    session.handle(p1, { type: 'draft', expression: 'sin(x)', direction: 1 });
    expect(display.display().drafts[0]).toMatchObject({ playerId: 1, expression: '', points: null, error: null });
    expect(JSON.stringify(display.display())).not.toContain('sin(x)');

    session.handle(p1, { type: 'draft', expression: 'sin(', direction: 1 });
    expect(p1.player().draftError).toBeTruthy();
    expect(display.display().drafts[0]!.points).toBeNull();
  });

  it('off: firing still works and reveals the function only afterwards', () => {
    const [p1] = startWith(2, { preview: false });
    session.handle(p1, { type: 'fire', expression: '0', direction: 1 });
    expect(display.shotMessages()).toHaveLength(1);
    expect(display.display().notice?.text).toContain('y = 0');
  });
});

describe('turn-by-turn mode', () => {
  it('only the active phone can draft and fire; others are ignored', () => {
    const [p1, p2] = startWith(2);
    expect(p1.player().canAct).toBe(true);
    expect(p2.player().canAct).toBe(false);

    session.handle(p2, { type: 'draft', expression: 'x', direction: -1 });
    expect(display.display().drafts).toEqual([]);
    session.handle(p2, { type: 'fire', expression: '0', direction: -1 });
    expect(display.shotMessages()).toHaveLength(0);
  });

  it('reports invalid drafts and refuses to fire them', () => {
    const [p1] = startWith(2);
    session.handle(p1, { type: 'draft', expression: 'sin(', direction: 1 });
    expect(display.display().drafts[0]!.error).toBeTruthy();
    expect(p1.player().draftError).toBeTruthy();
    session.handle(p1, { type: 'fire', expression: 'sin(', direction: 1 });
    expect(display.shotMessages()).toHaveLength(0);
    expect(p1.player().canAct).toBe(true);
  });

  it('firing locks everyone until the animation is done, then the next player is up', () => {
    const [p1, p2] = startWith(2);
    session.handle(p1, { type: 'fire', expression: '0', direction: 1 });
    expect(lastShots().shots).toHaveLength(1);
    expect(lastShots().shots[0]!.shot.shooterId).toBe('p1');
    expect(display.display().shotInFlight).toBe(true);
    expect(p1.player().canAct).toBe(false);
    expect(p2.player().canAct).toBe(false);

    session.handle(p1, { type: 'fire', expression: '0', direction: 1 });
    session.handle(display, { type: 'shotDone', id: lastShots().id + 99 });
    expect(display.shotMessages()).toHaveLength(1);
    expect(display.display().shotInFlight).toBe(true);

    finishShots();
    expect(display.display().shotInFlight).toBe(false);
    expect(display.display().game!.turn.currentPlayerId).toBe(2);
    expect(display.display().drafts).toEqual([]);
    expect(p2.player().canAct).toBe(true);
    expect(p2.player().turnDirection).toBe(-1);
    expect(display.display().notice?.text).toMatch(/obstacle/);
  });

  it('completes a shot by itself if the display never answers', () => {
    vi.useFakeTimers();
    fresh();
    const [p1] = startWith(2);
    session.handle(p1, { type: 'fire', expression: '0', direction: 1 });
    vi.advanceTimersByTime(5001);
    expect(display.display().shotInFlight).toBe(false);
    expect(display.display().game!.turn.currentPlayerId).toBe(2);
  });

  it('rotates through the players in order', () => {
    const phones = startWith(3);
    const order: number[] = [];
    for (let i = 0; i < 4; i++) {
      const current = display.display().game!.turn.currentPlayerId;
      order.push(current);
      session.handle(phones[current - 1]!, { type: 'fire', expression: '0', direction: current === 1 ? 1 : -1 });
      finishShots();
    }
    expect(order).toEqual([1, 2, 3, 1]);
  });

  it('a hit eliminates, the last player standing wins, and the host can play again or go back to the lobby', () => {
    const [p1, p2] = startWith(2);
    const w = hit(1, 2);
    session.handle(p1, { type: 'fire', expression: w.expression, direction: w.direction });
    expect(lastShots().shots[0]!.shot.targetId).toBe('p2');
    finishShots();

    const view = display.display();
    expect(view.phase).toBe('over');
    expect(view.game!.winnerId).toBe(1);
    expect(view.members.map((m) => m.alive)).toEqual([true, false]);
    expect(view.notice?.text).toMatch(/Player 1 eliminated Player 2.*Player 1 wins/);
    expect(p1.player().winnerId).toBe(1);
    expect(p2.player().you.alive).toBe(false);
    expect(p2.player().canAct).toBe(false);

    session.handle(display, { type: 'restart' });
    expect(display.display().phase).toBe('playing');
    expect(display.display().game!.soldiers.every((s) => s.alive)).toBe(true);
    expect(display.display().notice).toBeNull();
    expect(p1.player().canAct).toBe(true);

    session.handle(display, { type: 'lobby' });
    expect(display.display().phase).toBe('lobby');
    expect(display.display().game).toBeNull();
    expect(display.display().members).toHaveLength(2);
  });

  it('restart during a shot cancels it cleanly', () => {
    const [p1] = startWith(2);
    session.handle(p1, { type: 'fire', expression: '0', direction: 1 });
    const id = lastShots().id;
    session.handle(display, { type: 'restart' });
    expect(display.display().shotInFlight).toBe(false);
    session.handle(display, { type: 'shotDone', id });
    expect(display.display().game!.turn.turnNumber).toBe(1);
  });
});

describe('simultaneous mode', () => {
  it('lets every living phone act at the same time and shows all drafts', () => {
    const [p1, p2, p3] = startWith(3, { shotMode: 'simultaneous' });
    expect([p1, p2, p3].map((p) => p.player().canAct)).toEqual([true, true, true]);
    expect(p1.player().currentPlayerId).toBeNull();

    session.handle(p1, { type: 'draft', expression: 'x', direction: 1 });
    session.handle(p3, { type: 'draft', expression: 'cos(x)', direction: -1 });
    expect(display.display().drafts.map((d) => [d.playerId, d.expression])).toEqual([
      [1, 'x'],
      [3, 'cos(x)'],
    ]);
  });

  it('waits for everybody, then resolves all shots together in one message', () => {
    const [p1, p2, p3] = startWith(3, { shotMode: 'simultaneous' });
    session.handle(p1, { type: 'fire', expression: '0', direction: 1 });
    expect(display.shotMessages()).toHaveLength(0);
    expect(display.display().submitted).toEqual([1]);
    expect(p1.player()).toMatchObject({ canAct: false, submitted: true, firedCount: 1, livingCount: 3 });
    expect(p2.player().canAct).toBe(true);

    // firing twice in a round is ignored
    session.handle(p1, { type: 'fire', expression: '0', direction: 1 });
    expect(display.display().submitted).toEqual([1]);

    session.handle(p2, { type: 'fire', expression: '0', direction: -1 });
    expect(display.shotMessages()).toHaveLength(0);
    session.handle(p3, { type: 'fire', expression: '0', direction: -1 });

    expect(display.shotMessages()).toHaveLength(1);
    expect(lastShots().shots.map((s) => s.playerId)).toEqual([1, 2, 3]);
    expect(display.display().shotInFlight).toBe(true);
    expect([p1, p2, p3].every((p) => !p.player().canAct)).toBe(true);

    finishShots();
    expect(display.display().game!.turn.turnNumber).toBe(2);
    expect(display.display().submitted).toEqual([]);
    expect([p1, p2, p3].every((p) => p.player().canAct)).toBe(true);
  });

  it('a player who is hit still gets their shot; eliminations happen together', () => {
    const [p1, p2, p3] = startWith(3, { shotMode: 'simultaneous' });
    const kill2 = hit(1, 2);
    const kill1 = hit(2, 1);
    session.handle(p1, { type: 'fire', expression: kill2.expression, direction: kill2.direction });
    session.handle(p2, { type: 'fire', expression: kill1.expression, direction: kill1.direction });
    session.handle(p3, { type: 'fire', expression: '0', direction: -1 });
    const outcomes = lastShots().shots.map((s) => [s.playerId, s.shot.targetId]);
    expect(outcomes).toContainEqual([1, 'p2']);
    expect(outcomes).toContainEqual([2, 'p1']);

    finishShots();
    const view = display.display();
    expect(view.members.map((m) => m.alive)).toEqual([false, false, true]);
    expect(view.phase).toBe('over');
    expect(view.game!.winnerId).toBe(3);
    expect(p3.player().winnerId).toBe(3);
  });

  it('mutual elimination is a draw', () => {
    const [p1, p2] = startWith(2, { shotMode: 'simultaneous' });
    const a = hit(1, 2);
    const b = hit(2, 1);
    session.handle(p1, { type: 'fire', expression: a.expression, direction: a.direction });
    session.handle(p2, { type: 'fire', expression: b.expression, direction: b.direction });
    finishShots();
    expect(display.display().phase).toBe('over');
    expect(display.display().game!.winnerId).toBeNull();
    expect(display.display().notice?.text).toMatch(/draw/i);
    expect(p1.player().winnerId).toBeNull();
  });

  it('eliminated players no longer take part in later rounds', () => {
    const [p1, p2, p3] = startWith(3, { shotMode: 'simultaneous' });
    const kill2 = hit(1, 2);
    session.handle(p1, { type: 'fire', expression: kill2.expression, direction: kill2.direction });
    session.handle(p2, { type: 'fire', expression: '0', direction: -1 });
    session.handle(p3, { type: 'fire', expression: '0', direction: -1 });
    finishShots();

    expect(display.display().phase).toBe('playing');
    expect([p1, p2, p3].map((p) => p.player().canAct)).toEqual([true, false, true]);
    session.handle(p2, { type: 'draft', expression: 'x', direction: 1 });
    expect(display.display().drafts).toEqual([]);

    // the round needs only the two survivors
    session.handle(p1, { type: 'fire', expression: '0', direction: 1 });
    session.handle(p3, { type: 'fire', expression: '0', direction: -1 });
    expect(display.shotMessages()).toHaveLength(2);
    expect(lastShots().shots.map((s) => s.playerId)).toEqual([1, 3]);
  });

  it('invalid functions are not locked in', () => {
    const [p1] = startWith(2, { shotMode: 'simultaneous' });
    session.handle(p1, { type: 'fire', expression: 'sin(', direction: 1 });
    expect(display.display().submitted).toEqual([]);
    expect(p1.player().draftError).toBeTruthy();
    expect(p1.player().canAct).toBe(true);
  });

  it('the host can fire now without waiting for everyone', () => {
    const [p1] = startWith(3, { shotMode: 'simultaneous' });
    session.handle(p1, { type: 'fire', expression: '0', direction: 1 });
    session.handle(display, { type: 'skipTurn' });
    expect(lastShots().shots.map((s) => s.playerId)).toEqual([1]);
    finishShots();
    expect(display.display().game!.turn.turnNumber).toBe(2);
  });
});

describe('countdown option', () => {
  const secondsLeft = () => Math.round(display.display().timer!.remainingMs / 1000);

  it('is off by default: no timer is reported', () => {
    startWith(2);
    expect(display.display().timer).toBeNull();
  });

  it('turn mode: counts down, skips the turn at zero, and restarts for the next player', () => {
    vi.useFakeTimers();
    fresh();
    const [p1, p2] = startWith(2, { countdownEnabled: true, countdownSeconds: 20 });
    expect(display.display().timer).toEqual({ remainingMs: 20_000, totalMs: 20_000 });
    expect(p1.player().timer).toEqual({ remainingMs: 20_000, totalMs: 20_000 });

    vi.advanceTimersByTime(8000);
    session.handle(p1, { type: 'draft', expression: 'x', direction: 1 });
    expect(secondsLeft()).toBe(12);

    vi.advanceTimersByTime(12_001);
    const view = display.display();
    expect(view.game!.turn.currentPlayerId).toBe(2);
    expect(view.notice?.text).toMatch(/Player 1's turn was skipped.*Time's up/);
    expect(view.drafts).toEqual([]);
    expect(secondsLeft()).toBe(20);
    expect(p2.player().canAct).toBe(true);
  });

  it('is paused while a shot is animated and restarts afterwards', () => {
    vi.useFakeTimers();
    fresh();
    const [p1] = startWith(2, { countdownEnabled: true, countdownSeconds: 10 });
    vi.advanceTimersByTime(4000);
    session.handle(p1, { type: 'fire', expression: '0', direction: 1 });
    expect(display.display().timer).toBeNull();

    vi.advanceTimersByTime(4000); // still animating, nothing must expire
    expect(display.display().game!.turn.currentPlayerId).toBe(1);
    finishShots();
    expect(display.display().game!.turn.currentPlayerId).toBe(2);
    expect(secondsLeft()).toBe(10);
  });

  it('stops when the match is over', () => {
    vi.useFakeTimers();
    fresh();
    const [p1] = startWith(2, { countdownEnabled: true, countdownSeconds: 10 });
    const w = hit(1, 2);
    session.handle(p1, { type: 'fire', expression: w.expression, direction: w.direction });
    finishShots();
    expect(display.display().phase).toBe('over');
    expect(display.display().timer).toBeNull();
    vi.advanceTimersByTime(60_000);
    expect(display.display().phase).toBe('over');
  });

  it('simultaneous: at zero only the shots already fired are resolved', () => {
    vi.useFakeTimers();
    fresh();
    const [p1, p2] = startWith(3, { shotMode: 'simultaneous', countdownEnabled: true, countdownSeconds: 15 });
    session.handle(p1, { type: 'fire', expression: '0', direction: 1 });
    session.handle(p2, { type: 'fire', expression: '0', direction: -1 });
    expect(display.shotMessages()).toHaveLength(0);

    vi.advanceTimersByTime(15_001);
    expect(lastShots().shots.map((s) => s.playerId)).toEqual([1, 2]);
    expect(display.display().timer).toBeNull();
    finishShots();
    expect(display.display().game!.turn.turnNumber).toBe(2);
    expect(secondsLeft()).toBe(15);
  });

  it('simultaneous: if nobody fired, the round just advances', () => {
    vi.useFakeTimers();
    fresh();
    startWith(2, { shotMode: 'simultaneous', countdownEnabled: true, countdownSeconds: 5 });
    vi.advanceTimersByTime(5001);
    expect(display.shotMessages()).toHaveLength(0);
    expect(display.display().game!.turn.turnNumber).toBe(2);
    expect(display.display().notice?.text).toMatch(/Nobody fired/);
    expect(secondsLeft()).toBe(5);
  });

  it('going back to the lobby cancels the countdown', () => {
    vi.useFakeTimers();
    fresh();
    startWith(2, { countdownEnabled: true, countdownSeconds: 5 });
    session.handle(display, { type: 'lobby' });
    expect(display.display().timer).toBeNull();
    vi.advanceTimersByTime(10_000);
    expect(display.display().phase).toBe('lobby');
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
    finishShots();
    session.disconnect(p2);
    expect(display.display().game!.turn.currentPlayerId).toBe(2);

    session.handle(display, { type: 'skipTurn' });
    expect(display.display().game!.turn.currentPlayerId).toBe(1);
    expect(display.display().notice?.kind).toBe('warning');
  });
});

describe('parseClientMessage', () => {
  const options = { shotMode: 'turns', preview: true, countdownEnabled: false, countdownSeconds: 30 };

  it('accepts well-formed messages', () => {
    expect(parseClientMessage({ type: 'fire', expression: 'x', direction: 1 })).toEqual({
      type: 'fire',
      expression: 'x',
      direction: 1,
    });
    expect(parseClientMessage({ type: 'hello', role: 'player', token: null })).not.toBeNull();
    expect(parseClientMessage({ type: 'configure', mapId: 'scatter', seed: 5, options })).toEqual({
      type: 'configure',
      mapId: 'scatter',
      seed: 5,
      options,
    });
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
    { type: 'configure', mapId: 'moon', seed: 1, options },
    { type: 'configure', mapId: 'classic', seed: 1.5, options },
    { type: 'configure', mapId: 'classic', seed: 1 },
    { type: 'configure', mapId: 'classic', seed: 1, options: { ...options, shotMode: 'chaos' } },
    { type: 'configure', mapId: 'classic', seed: 1, options: { ...options, preview: 'yes' } },
    { type: 'configure', mapId: 'classic', seed: 1, options: { ...options, countdownSeconds: 4 } },
    { type: 'configure', mapId: 'classic', seed: 1, options: { ...options, countdownSeconds: 301 } },
    { type: 'configure', mapId: 'classic', seed: 1, options: { ...options, countdownSeconds: 7.5 } },
    { type: 'hello', role: 'admin' },
    { type: 'shotDone', id: 'one' },
  ])('rejects malformed %j', (raw) => {
    expect(parseClientMessage(raw)).toBeNull();
  });
});
