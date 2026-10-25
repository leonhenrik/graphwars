import { randomUUID } from 'node:crypto';
import { DEFAULT_OPTIONS, MAX_PLAYERS, MIN_PLAYERS, PLAYER_COLORS } from '../src/game/constants';
import { createInitialState, defaultDirection, getPlayerSoldier } from '../src/game/gameState';
import { describeShot } from '../src/game/messages';
import { applyRound, applyShot, buildTrajectory, roundEliminations, simulateShot } from '../src/game/simulation';
import { advanceRound, advanceTurn, markFired } from '../src/game/turnManager';
import type { GameOptions, GameState, MapId, PlayerId, ShotDirection } from '../src/game/types';
import type {
  ClientMessage,
  DisplayView,
  DraftView,
  FiredShot,
  MemberView,
  Notice,
  Phase,
  PlayerView,
  ServerMessage,
  TimerView,
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
  /** JPEG bytes of the player's selfie, shown inside their bubble on the big screen. */
  photo: Buffer | null;
  /** Unique per photo that was set; 0 when there is none. Used as a cache-busting version in the photo URL. */
  photoRev: number;
  /** Custom name chosen on the phone (lobby only). null means the default "Player N". */
  name: string | null;
  /** Lobby only: removes the seat if the phone does not come back in time. */
  dropTimer: ReturnType<typeof setTimeout> | null;
}

interface Draft {
  expression: string;
  direction: ShotDirection;
}

interface PendingShots {
  id: number;
  shots: FiredShot[];
  timer: ReturnType<typeof setTimeout>;
}

export interface SessionOptions {
  /** Safety net: how long to wait for the display to finish animating the shots. */
  shotTimeoutMs?: number;
  /** In the lobby a phone that drops (e.g. while its camera app is open) keeps its seat this long. */
  lobbyGraceMs?: number;
}

/** Largest accepted selfie, in bytes of JPEG data. */
export const MAX_PHOTO_BYTES = 24_000;

/**
 * The authoritative state of one hosted match: lobby, players (one per phone), the game and the
 * shots currently being animated on the laptop. It has no I/O of its own; clients are injected.
 *
 * Shot modes:
 *  - 'turns': one player at a time; the shot is animated, then the next living player is up.
 *  - 'simultaneous': every living player enters a function in the same round; when all have fired
 *    (or the countdown ends) all shots are simulated against the same state and animated together.
 */
export class Session {
  private clients = new Set<Client>();
  private members: Member[] = [];
  private phase: Phase = 'lobby';
  private config: { mapId: MapId; seed: number } = { mapId: 'classic', seed: 1 };
  private options: GameOptions = { ...DEFAULT_OPTIONS };
  private game: GameState | null = null;
  private drafts = new Map<PlayerId, Draft>();
  private submissions = new Map<PlayerId, FiredShot>();
  private notice: Notice | null = null;
  private pending: PendingShots | null = null;
  private deadline: number | null = null;
  private countdown: ReturnType<typeof setTimeout> | null = null;
  private nextShotId = 1;
  private matchId = 0;
  private photoCounter = 0;
  private readonly shotTimeoutMs: number;
  private readonly lobbyGraceMs: number;

  constructor(options: SessionOptions = {}) {
    this.shotTimeoutMs = options.shotTimeoutMs ?? 12_000;
    this.lobbyGraceMs = options.lobbyGraceMs ?? 30_000;
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
        member.connected = false;
        if (this.phase === 'lobby') {
          if (member.dropTimer) clearTimeout(member.dropTimer);
          member.dropTimer = setTimeout(() => this.dropMember(member), this.lobbyGraceMs);
        }
      }
      this.broadcast();
    }
  }

  private dropMember(member: Member): void {
    if (member.dropTimer) clearTimeout(member.dropTimer);
    member.dropTimer = null;
    if (this.phase !== 'lobby' || member.connected) return;
    this.members = this.members.filter((m) => m !== member);
    this.renumber();
    this.broadcast();
  }

  /** The selfie of a player (by player number), or null. */
  getPhoto(playerId: PlayerId): Buffer | null {
    return this.members.find((m) => m.playerId === playerId)?.photo ?? null;
  }

  close(): void {
    this.cancelPending();
    this.stopCountdown();
    for (const m of this.members) {
      if (m.dropTimer) clearTimeout(m.dropTimer);
      m.dropTimer = null;
    }
  }

  handle(client: Client, message: ClientMessage): void {
    if (message.type === 'hello') {
      this.hello(client, message);
      return;
    }
    if (client.role === 'display') this.handleDisplay(message);
    else if (client.role === 'player') this.handlePlayer(client, message);
  }

  private get simultaneous(): boolean {
    return this.options.shotMode === 'simultaneous';
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
      member = {
        token: randomUUID(),
        playerId: this.members.length + 1,
        connected: true,
        photo: null,
        photoRev: 0,
        name: null,
        dropTimer: null,
      };
      this.members.push(member);
    }
    member.connected = true;
    if (member.dropTimer) clearTimeout(member.dropTimer);
    member.dropTimer = null;
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
        this.options = { ...message.options };
        this.broadcast();
        return;
      case 'start':
        if (this.phase !== 'lobby') return;
        // Phones that are offline at this point do not take part.
        this.dropOfflineMembers();
        if (this.members.length < MIN_PLAYERS) {
          this.setNotice('error', `Waiting for players: at least ${MIN_PLAYERS} phones must join.`);
          return;
        }
        this.startMatchWith({ playerCount: this.members.length, mapId: this.config.mapId, seed: this.config.seed });
        return;
      case 'restart': {
        if (this.phase === 'lobby' || !this.game) return;
        const config = { ...this.game.config };
        if (config.mapId === 'scatter' || config.mapId === 'chaos') {
          config.seed = Math.floor(Math.random() * 1_000_000);
          this.config = { mapId: config.mapId, seed: config.seed };
        }
        this.startMatchWith(config);
        return;
      }
      case 'lobby':
        this.cancelPending();
        this.stopCountdown();
        this.phase = 'lobby';
        this.game = null;
        this.drafts.clear();
        this.submissions.clear();
        this.notice = null;
        this.dropOfflineMembers();
        this.broadcast();
        return;
      case 'skipTurn':
        this.endWaiting("The host didn't wait any longer.", false);
        return;
      case 'shotDone':
        this.resolveShots(message.id);
        return;
      default:
        return;
    }
  }

  private handlePlayer(client: Client, message: ClientMessage): void {
    const member = this.members.find((m) => m.token === client.token);
    if (!member) return;
    if (message.type === 'photo') {
      this.setPhoto(member, message.image);
      return;
    }
    if (message.type === 'name') {
      this.setName(member, message.name);
      return;
    }
    if (!this.canAct(member)) return;

    if (message.type === 'draft') {
      this.drafts.set(member.playerId, { expression: message.expression, direction: message.direction });
      this.broadcast();
    } else if (message.type === 'fire') {
      this.fire(member, message.expression, message.direction);
    }
  }

  /** Selfies can only be taken or removed in the lobby, before the match starts. */
  private setPhoto(member: Member, image: string | null): void {
    if (this.phase !== 'lobby') return;
    if (image === null) {
      member.photo = null;
      member.photoRev = 0;
    } else {
      const bytes = Buffer.from(image.slice(image.indexOf(',') + 1), 'base64');
      const isJpeg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
      if (!isJpeg || bytes.length > MAX_PHOTO_BYTES) return;
      member.photo = bytes;
      member.photoRev = ++this.photoCounter;
    }
    this.broadcast();
  }

  /** Names can only be changed in the lobby, before the match starts. */
  private setName(member: Member, name: string): void {
    if (this.phase !== 'lobby') return;
    member.name = name;
    this.broadcast();
  }

  private dropOfflineMembers(): void {
    for (const m of this.members) {
      if (!m.connected && m.dropTimer) clearTimeout(m.dropTimer);
    }
    this.members = this.members.filter((m) => m.connected);
    this.renumber();
  }

  private canAct(member: Member): boolean {
    if (!this.game || this.phase !== 'playing' || this.pending) return false;
    const soldier = getPlayerSoldier(this.game, member.playerId);
    if (!soldier || !soldier.alive) return false;
    return this.simultaneous
      ? !this.submissions.has(member.playerId)
      : this.game.turn.currentPlayerId === member.playerId;
  }

  private fire(member: Member, expression: string, direction: ShotDirection, autoFired = false): boolean {
    const game = this.game;
    if (!game) return false;
    this.drafts.set(member.playerId, { expression, direction });
    const fired = this.simulateFor(member, expression, direction);
    if (!fired) {
      this.broadcast();
      return false;
    }
    this.drafts.delete(member.playerId);

    if (!this.simultaneous) {
      this.game = markFired(game);
      this.setNotice(
        autoFired ? 'warning' : 'info',
        autoFired
          ? `Time's up! ${this.nameOf(member.playerId)}'s function was fired as typed: y = ${expression}`
          : `${this.nameOf(member.playerId)} fired y = ${expression}`,
        false,
      );
      this.launch([fired]);
      return true;
    }

    this.submissions.set(member.playerId, fired);
    const living = game.soldiers.filter((s) => s.alive).length;
    if (this.submissions.size >= living) {
      this.setNotice('info', 'Everyone has fired!', false);
      this.launch([...this.submissions.values()]);
    } else {
      this.setNotice('info', `${this.submissions.size}/${living} players have fired.`);
    }
    return true;
  }

  /** Simulates a member's shot against the current state; null if the function cannot be fired. */
  private simulateFor(member: Member, expression: string, direction: ShotDirection): FiredShot | null {
    const game = this.game;
    if (!game) return null;
    const soldierId = getPlayerSoldier(game, member.playerId)?.id;
    const attempt = soldierId ? simulateShot(game, soldierId, expression, direction, !this.simultaneous) : null;
    if (!attempt || !attempt.ok) return null;
    return { playerId: member.playerId, shot: attempt.shot, color: this.colorOf(member.playerId) };
  }

  /** Sends the shots to the big screen and waits (with a safety timeout) for the animation to finish. */
  private launch(shots: FiredShot[]): void {
    this.stopCountdown();
    const id = this.nextShotId++;
    const timer = setTimeout(() => this.resolveShots(id), this.shotTimeoutMs);
    this.pending = { id, shots, timer };
    for (const c of this.clients) if (c.role === 'display') c.send({ type: 'shots', id, shots });
    this.broadcast();
  }

  private resolveShots(id: number): void {
    const pending = this.pending;
    const game = this.game;
    if (!pending || pending.id !== id || !game) return;
    clearTimeout(pending.timer);
    this.pending = null;

    const eliminated = this.simultaneous ? roundEliminations(pending.shots.map((f) => f.shot)) : undefined;
    const summaries = pending.shots.map((f) => describeShot(game, f.shot, eliminated));
    const next = this.simultaneous
      ? applyRound(game, pending.shots.map((f) => f.shot))
      : applyShot(game, (pending.shots[0] as FiredShot).shot);
    this.game = next;
    this.drafts.clear();
    this.submissions.clear();

    const kind = summaries.some((s) => s.kind === 'success') ? 'success' : (summaries[0]?.kind ?? 'info');
    let text = summaries.map((s) => s.text).join(' ');
    if (next.status === 'over') {
      this.phase = 'over';
      text += next.winnerId !== null ? ` ${this.nameOf(next.winnerId)} wins!` : ' Everyone was eliminated: draw!';
      this.stopCountdown();
    } else {
      this.startCountdown();
    }
    this.setNotice(kind, text, false);
    this.broadcast();
  }

  /**
   * The turn (or round) ran out of time, or the host stopped waiting.
   * With `autoFire` (countdown) every player who still has to shoot fires the function as it currently
   * stands; players without a valid function lose their shot.
   */
  private endWaiting(reason: string, autoFire: boolean): void {
    const game = this.game;
    if (this.phase !== 'playing' || !game || this.pending) return;

    if (this.simultaneous) {
      let autoFired = 0;
      if (autoFire) {
        for (const member of this.members) {
          const draft = this.drafts.get(member.playerId);
          if (!draft || !this.canAct(member)) continue;
          const fired = this.simulateFor(member, draft.expression, draft.direction);
          if (!fired) continue;
          this.submissions.set(member.playerId, fired);
          this.drafts.delete(member.playerId);
          autoFired++;
        }
      }
      if (this.submissions.size > 0) {
        this.setNotice(
          'warning',
          autoFired > 0 ? `${reason} Unfired functions were fired as typed.` : reason,
          false,
        );
        this.launch([...this.submissions.values()]);
        return;
      }
      this.setNotice('warning', `${reason} Nobody fired.`, false);
      this.game = advanceRound(game);
    } else {
      const member = this.members.find((m) => m.playerId === game.turn.currentPlayerId);
      const draft = member ? this.drafts.get(member.playerId) : undefined;
      if (autoFire && member && draft && this.fire(member, draft.expression, draft.direction, true)) return;
      this.setNotice('warning', `${this.nameOf(game.turn.currentPlayerId)}'s turn was skipped. ${reason}`, false);
      this.game = advanceTurn(game);
    }
    this.drafts.clear();
    this.startCountdown();
    this.broadcast();
  }

  private startMatchWith(config: GameState['config']): void {
    this.cancelPending();
    this.matchId++;
    this.game = createInitialState(config);
    for (const player of this.game.players) player.name = this.nameOf(player.id);
    this.phase = 'playing';
    this.drafts.clear();
    this.submissions.clear();
    this.notice = null;
    this.startCountdown();
    this.broadcast();
  }

  private cancelPending(): void {
    if (this.pending) clearTimeout(this.pending.timer);
    this.pending = null;
  }

  private startCountdown(): void {
    this.stopCountdown();
    if (!this.options.countdownEnabled || this.phase !== 'playing') return;
    const ms = this.options.countdownSeconds * 1000;
    this.deadline = Date.now() + ms;
    this.countdown = setTimeout(() => this.endWaiting("Time's up!", true), ms);
  }

  private stopCountdown(): void {
    if (this.countdown) clearTimeout(this.countdown);
    this.countdown = null;
    this.deadline = null;
  }

  private timerView(): TimerView | null {
    if (this.deadline === null || this.pending) return null;
    return {
      remainingMs: Math.max(0, this.deadline - Date.now()),
      totalMs: this.options.countdownSeconds * 1000,
    };
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
      name: this.nameOfMember(member),
      color: this.colorOf(member.playerId),
      connected: member.connected,
      alive: soldier ? soldier.alive : true,
      photoRev: member.photoRev,
    };
  }

  private nameOfMember(member: Member): string {
    return member.name ?? `Player ${member.playerId}`;
  }

  private nameOf(playerId: PlayerId): string {
    const member = this.members.find((m) => m.playerId === playerId);
    return member ? this.nameOfMember(member) : `Player ${playerId}`;
  }

  /** Validated drafts of everyone who may currently type (one in turn mode, several when simultaneous). */
  private draftViews(): DraftView[] {
    const game = this.game;
    if (!game || this.phase !== 'playing') return [];
    const views: DraftView[] = [];
    for (const [playerId, draft] of this.drafts) {
      const soldier = getPlayerSoldier(game, playerId);
      if (!soldier || !soldier.alive) continue;
      if (this.simultaneous ? this.submissions.has(playerId) : game.turn.currentPlayerId !== playerId) continue;
      const built = buildTrajectory(game, soldier.id, draft.expression, draft.direction);
      views.push({
        playerId,
        expression: draft.expression,
        direction: draft.direction,
        points: built.ok ? built.trajectory.points : null,
        error: built.ok ? null : built.error,
      });
    }
    return views;
  }

  private broadcast(): void {
    const drafts = this.draftViews();
    const timer = this.timerView();
    // With the preview option off the big screen learns nothing about what is being typed.
    const publicDrafts = this.options.preview ? drafts : drafts.map((d) => ({ ...d, expression: '', points: null }));
    const display: DisplayView = {
      phase: this.phase,
      mapId: this.config.mapId,
      seed: this.config.seed,
      options: this.options,
      members: this.members.map((m) => this.memberView(m)),
      game: this.game,
      drafts: publicDrafts,
      submitted: [...this.submissions.keys()],
      timer,
      notice: this.notice,
      shotInFlight: this.pending !== null,
    };

    for (const client of this.clients) {
      if (client.role === 'display') {
        client.send({ type: 'display', view: display });
      } else if (client.role === 'player') {
        const member = this.members.find((m) => m.token === client.token);
        if (member) client.send({ type: 'player', view: this.playerView(member, drafts, timer) });
      }
    }
  }

  private playerView(member: Member, drafts: DraftView[], timer: TimerView | null): PlayerView {
    const game = this.game;
    const playing = game !== null && this.phase === 'playing';
    const currentPlayerId = playing && !this.simultaneous ? game.turn.currentPlayerId : null;
    const mine = game ? getPlayerSoldier(game, member.playerId) : undefined;
    return {
      phase: this.phase,
      options: this.options,
      you: this.memberView(member),
      playerCount: this.members.length,
      currentPlayerId,
      currentPlayerName: currentPlayerId === null ? null : this.nameOf(currentPlayerId),
      canAct: this.canAct(member),
      submitted: this.submissions.has(member.playerId),
      firedCount: this.submissions.size,
      livingCount: game ? game.soldiers.filter((s) => s.alive).length : this.members.length,
      turnNumber: game?.turn.turnNumber ?? 0,
      turnDirection: mine ? defaultDirection(mine) : 1,
      shotInFlight: this.pending !== null,
      winnerId: game?.winnerId ?? null,
      winnerName: game?.winnerId == null ? null : this.nameOf(game.winnerId),
      matchId: this.matchId,
      draftError: drafts.find((d) => d.playerId === member.playerId)?.error ?? null,
      timer,
      notice: this.notice,
    };
  }
}
