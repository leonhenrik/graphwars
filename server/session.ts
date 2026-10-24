import { randomUUID } from 'node:crypto';
import { MAX_PLAYERS, MIN_PLAYERS, PLAYER_COLORS } from '../src/game/constants';
import { createInitialState, defaultDirection, getPlayerSoldier } from '../src/game/gameState';
import { describeShot } from '../src/game/messages';
import { applyShot, buildTrajectory, simulateShot } from '../src/game/simulation';
import { advanceTurn, getActiveSoldierId, markFired } from '../src/game/turnManager';
import type { GameState, MapId, PlayerId, ShotDirection, ShotResult } from '../src/game/types';
import type {
  ClientMessage,
  DisplayView,
  DraftView,
  MemberView,
  Notice,
  Phase,
  PlayerView,
  ServerMessage,
} from '../src/shared/protocol';

export interface Client {
  send(message: ServerMessage): void;
  /** True for connections from the laptop itself; only those may act as the display / host. */
  isLocal: boolean;
  role?: 'display' | 'player';
  token?: string;
}

interface Member {
  token: string;
  playerId: PlayerId;
  connected: boolean;
}

interface Draft {
  expression: string;
  direction: ShotDirection;
}

interface PendingShot {
  id: number;
  shot: ShotResult;
  color: string;
  timer: ReturnType<typeof setTimeout>;
}

export interface SessionOptions {
  /** Safety net: how long to wait for the display to finish animating a shot. */
  shotTimeoutMs?: number;
}

/**
 * The authoritative state of one hosted match: lobby, players (one per phone), the game and the
 * shot currently being animated on the laptop. It has no I/O of its own; clients are injected.
 */
export class Session {
  private clients = new Set<Client>();
  private members: Member[] = [];
  private phase: Phase = 'lobby';
  private config: { mapId: MapId; seed: number } = { mapId: 'classic', seed: 1 };
  private game: GameState | null = null;
  private draft: Draft | null = null;
  private notice: Notice | null = null;
  private pending: PendingShot | null = null;
  private nextShotId = 1;
  private readonly shotTimeoutMs: number;

  constructor(options: SessionOptions = {}) {
    this.shotTimeoutMs = options.shotTimeoutMs ?? 12_000;
  }

  connect(client: Client): void {
    this.clients.add(client);
  }

  disconnect(client: Client): void {
    if (!this.clients.delete(client)) return;
    if (client.role === 'player' && client.token) {
      const stillThere = [...this.clients].some((c) => c.role === 'player' && c.token === client.token);
      const member = this.members.find((m) => m.token === client.token);
      if (member && !stillThere) {
        if (this.phase === 'lobby') {
          this.members = this.members.filter((m) => m !== member);
          this.renumber();
        } else {
          member.connected = false;
        }
      }
      this.broadcast();
    }
  }

  close(): void {
    if (this.pending) clearTimeout(this.pending.timer);
    this.pending = null;
  }

  handle(client: Client, message: ClientMessage): void {
    if (message.type === 'hello') {
      this.hello(client, message);
      return;
    }
    if (client.role === 'display') this.handleDisplay(message);
    else if (client.role === 'player') this.handlePlayer(client, message);
  }

  private hello(client: Client, message: Extract<ClientMessage, { type: 'hello' }>): void {
    if (message.role === 'display') {
      if (!client.isLocal) {
        client.send({ type: 'rejected', text: 'The big screen must be opened on the laptop that runs the server.' });
        return;
      }
      client.role = 'display';
      this.broadcast();
      return;
    }

    let member = message.token ? this.members.find((m) => m.token === message.token) : undefined;
    if (!member) {
      if (this.phase !== 'lobby') {
        client.send({ type: 'rejected', text: 'A match is already running. Ask the host to return to the lobby.' });
        return;
      }
      if (this.members.length >= MAX_PLAYERS) {
        client.send({ type: 'rejected', text: `The game is full (${MAX_PLAYERS} players).` });
        return;
      }
      member = { token: randomUUID(), playerId: this.members.length + 1, connected: true };
      this.members.push(member);
    }
    member.connected = true;
    client.role = 'player';
    client.token = member.token;
    client.send({ type: 'welcome', token: member.token });
    this.broadcast();
  }

  private handleDisplay(message: ClientMessage): void {
    switch (message.type) {
      case 'configure':
        if (this.phase !== 'lobby') return;
        this.config = { mapId: message.mapId, seed: message.seed };
        this.broadcast();
        return;
      case 'start':
        if (this.phase !== 'lobby') return;
        if (this.members.length < MIN_PLAYERS) {
          this.setNotice('error', `Waiting for players: at least ${MIN_PLAYERS} phones must join.`);
          return;
        }
        this.startMatch();
        return;
      case 'restart':
        if (this.phase === 'lobby' || !this.game) return;
        this.cancelPending();
        this.startMatchWith(this.game.config);
        return;
      case 'lobby':
        this.cancelPending();
        this.phase = 'lobby';
        this.game = null;
        this.draft = null;
        this.notice = null;
        this.members = this.members.filter((m) => m.connected);
        this.renumber();
        this.broadcast();
        return;
      case 'skipTurn':
        if (this.phase !== 'playing' || !this.game || this.pending) return;
        this.setNotice('warning', `${this.game.players[this.game.turn.currentPlayerId - 1]?.name ?? 'Player'}'s turn was skipped.`, false);
        this.game = advanceTurn(this.game);
        this.draft = null;
        this.broadcast();
        return;
      case 'shotDone':
        this.resolveShot(message.id);
        return;
      default:
        return;
    }
  }

  private handlePlayer(client: Client, message: ClientMessage): void {
    const member = this.members.find((m) => m.token === client.token);
    if (!member || !this.game || this.phase !== 'playing' || this.pending) return;
    if (this.game.turn.currentPlayerId !== member.playerId) return;

    if (message.type === 'draft') {
      this.draft = { expression: message.expression, direction: message.direction };
      this.broadcast();
    } else if (message.type === 'fire') {
      this.fire(member, message.expression, message.direction);
    }
  }

  private fire(member: Member, expression: string, direction: ShotDirection): void {
    if (!this.game) return;
    this.draft = { expression, direction };
    const soldierId = getActiveSoldierId(this.game);
    const attempt = soldierId ? simulateShot(this.game, soldierId, expression, direction) : null;
    if (!attempt || !attempt.ok) {
      this.broadcast();
      return;
    }

    const color = this.colorOf(member.playerId);
    const id = this.nextShotId++;
    const timer = setTimeout(() => this.resolveShot(id), this.shotTimeoutMs);
    this.pending = { id, shot: attempt.shot, color, timer };
    this.game = markFired(this.game);
    this.setNotice('info', `Player ${member.playerId} fired y = ${expression}`, false);
    for (const c of this.clients) if (c.role === 'display') c.send({ type: 'shot', id, shot: attempt.shot, color });
    this.broadcast();
  }

  private resolveShot(id: number): void {
    const pending = this.pending;
    if (!pending || pending.id !== id || !this.game) return;
    clearTimeout(pending.timer);
    this.pending = null;

    const summary = describeShot(this.game, pending.shot);
    const next = applyShot(this.game, pending.shot);
    this.game = next;
    this.draft = null;
    if (next.status === 'over') {
      this.phase = 'over';
      const winner = next.winnerId !== null ? `Player ${next.winnerId}` : 'Nobody';
      this.setNotice('success', `${summary.text} ${winner} wins!`, false);
    } else {
      this.setNotice(summary.kind, summary.text, false);
    }
    this.broadcast();
  }

  private startMatch(): void {
    this.startMatchWith({ playerCount: this.members.length, mapId: this.config.mapId, seed: this.config.seed });
  }

  private startMatchWith(config: GameState['config']): void {
    this.game = createInitialState(config);
    this.phase = 'playing';
    this.draft = null;
    this.notice = null;
    this.broadcast();
  }

  private cancelPending(): void {
    if (this.pending) clearTimeout(this.pending.timer);
    this.pending = null;
  }

  private renumber(): void {
    this.members.forEach((m, i) => (m.playerId = i + 1));
  }

  private setNotice(kind: Notice['kind'], text: string, broadcast = true): void {
    this.notice = { kind, text };
    if (broadcast) this.broadcast();
  }

  private colorOf(playerId: PlayerId): string {
    return PLAYER_COLORS[(playerId - 1) % PLAYER_COLORS.length] as string;
  }

  private memberView(member: Member): MemberView {
    const soldier = this.game ? this.game.soldiers.find((s) => s.playerId === member.playerId) : undefined;
    return {
      playerId: member.playerId,
      name: `Player ${member.playerId}`,
      color: this.colorOf(member.playerId),
      connected: member.connected,
      alive: soldier ? soldier.alive : true,
    };
  }

  private draftView(): DraftView | null {
    if (!this.draft || !this.game || this.phase !== 'playing') return null;
    const soldierId = getActiveSoldierId(this.game);
    if (!soldierId) return null;
    const playerId = this.game.turn.currentPlayerId;
    const built = buildTrajectory(this.game, soldierId, this.draft.expression, this.draft.direction);
    return {
      playerId,
      expression: this.draft.expression,
      direction: this.draft.direction,
      points: built.ok ? built.trajectory.points : null,
      error: built.ok ? null : built.error,
    };
  }

  private broadcast(): void {
    const draft = this.draftView();
    const display: DisplayView = {
      phase: this.phase,
      mapId: this.config.mapId,
      seed: this.config.seed,
      members: this.members.map((m) => this.memberView(m)),
      game: this.game,
      draft,
      notice: this.notice,
      shotInFlight: this.pending !== null,
    };

    for (const client of this.clients) {
      if (client.role === 'display') {
        client.send({ type: 'display', view: display });
      } else if (client.role === 'player') {
        const member = this.members.find((m) => m.token === client.token);
        if (member) client.send({ type: 'player', view: this.playerView(member, draft) });
      }
    }
  }

  private playerView(member: Member, draft: DraftView | null): PlayerView {
    const game = this.game;
    const currentPlayerId = game && this.phase === 'playing' ? game.turn.currentPlayerId : null;
    const mine = game ? getPlayerSoldier(game, member.playerId) : undefined;
    return {
      phase: this.phase,
      you: this.memberView(member),
      playerCount: this.members.length,
      currentPlayerId,
      currentPlayerName: currentPlayerId === null ? null : `Player ${currentPlayerId}`,
      isMyTurn: currentPlayerId === member.playerId && this.pending === null,
      turnNumber: game?.turn.turnNumber ?? 0,
      turnDirection: mine ? defaultDirection(mine) : 1,
      shotInFlight: this.pending !== null,
      winnerId: game?.winnerId ?? null,
      draftError: draft && draft.playerId === member.playerId ? draft.error : null,
      notice: this.notice,
    };
  }
}
