import {
  PROTOCOL_VERSION,
  generateZone,
  makeWorld,
  parseClientMessage,
  removeEntity,
  spawnPlayer,
  stepWorld,
  createRng,
} from "@game/shared";
import type {
  EntityId,
  EntityView,
  QueuedCommand,
  ServerMessage,
  World,
  ZoneId,
} from "@game/shared";
import type { Connection } from "../gateway/connection.js";
import { ChatHistory, globalChatKey, zoneChatKey } from "../gateway/chat.js";
import { TokenBucket } from "../gateway/ratelimit.js";

export const ZONE_ID: ZoneId = "cave";
export const ZONE_SEED = 1337;
const CHAT_BURST = 4;
const CHAT_REFILL_PER_SEC = 1;
const CHAT_HISTORY_SIZE = 50;

interface ClientState {
  entityId?: EntityId;
  chatBucket: TokenBucket;
}

export interface GameServerOptions {
  now?: () => number;
  world?: World;
}

/**
 * The whole server behind the transport seam: sessions, validation, chat relay,
 * command queue, tick loop, snapshots. Knows nothing about `ws`.
 */
export class GameServer {
  readonly world: World;
  private readonly now: () => number;
  private readonly clients = new Map<Connection, ClientState>();
  private readonly chatHistory = new ChatHistory(CHAT_HISTORY_SIZE);
  private commandQueue: QueuedCommand[] = [];
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(opts: GameServerOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.world = opts.world ?? makeWorld();
    if (!this.world.zones.has(ZONE_ID)) {
      this.world.zones.set(ZONE_ID, generateZone(ZONE_ID, 40, 20, ZONE_SEED));
    }
  }

  // ── connection lifecycle ─────────────────────────────────────────────────

  handleConnection(conn: Connection): void {
    this.clients.set(conn, {
      chatBucket: new TokenBucket(CHAT_BURST, CHAT_REFILL_PER_SEC, this.now),
    });
  }

  handleClose(conn: Connection): void {
    const state = this.clients.get(conn);
    this.clients.delete(conn);
    if (state?.entityId !== undefined) {
      const handle = this.world.players.get(state.entityId)?.handle;
      removeEntity(this.world, state.entityId);
      if (handle) {
        this.broadcastAll({
          t: "events",
          tick: this.world.tick,
          events: [{ kind: "left", entityId: state.entityId, handle }],
        });
      }
    }
  }

  // ── message handling ─────────────────────────────────────────────────────

  handleMessage(conn: Connection, raw: unknown): void {
    const msg = parseClientMessage(raw);
    if (!msg) {
      conn.send({ t: "reject", seq: -1, reason: "malformed message" });
      return;
    }
    switch (msg.t) {
      case "hello":
        this.onHello(conn, msg.handle, msg.protocolVersion);
        break;
      case "cmd":
        this.onCmd(conn, msg.seq, msg.cmd);
        break;
      case "chat":
        this.onChat(conn, msg.channel, msg.text);
        break;
      case "ping":
        conn.send({ t: "pong", clientTime: msg.clientTime, serverTime: this.now() });
        break;
    }
  }

  private onHello(conn: Connection, handle: string, protocolVersion: number): void {
    const state = this.clients.get(conn);
    if (!state) return;
    if (state.entityId !== undefined) return; // already logged in
    if (protocolVersion !== PROTOCOL_VERSION) {
      conn.send({
        t: "reject",
        seq: -1,
        reason: `protocol mismatch, server is v${PROTOCOL_VERSION}`,
      });
      return;
    }
    if (this.isHandleTaken(handle)) {
      conn.send({ t: "reject", seq: -1, reason: `handle "${handle}" is taken` });
      return;
    }

    const entityId = spawnPlayer(this.world, ZONE_ID, handle, this.now());
    if (entityId === undefined) {
      conn.send({ t: "reject", seq: -1, reason: "world is full" });
      return;
    }
    state.entityId = entityId;

    const zone = this.world.zones.get(ZONE_ID);
    conn.send({
      t: "welcome",
      entityId,
      zoneId: ZONE_ID,
      zoneSeed: ZONE_SEED,
      zoneWidth: zone?.width ?? 0,
      zoneHeight: zone?.height ?? 0,
      tick: this.world.tick,
      roster: this.onlineHandles(),
    });
    conn.send({ t: "snapshot", tick: this.world.tick, entities: this.buildViews() });
    for (const msg of this.chatHistory.recent(globalChatKey())) conn.send(msg);
    for (const msg of this.chatHistory.recent(zoneChatKey(ZONE_ID))) conn.send(msg);

    this.broadcastAll({
      t: "events",
      tick: this.world.tick,
      events: [{ kind: "joined", entityId, handle }],
    });
  }

  private onCmd(conn: Connection, seq: number, cmd: QueuedCommand["cmd"]): void {
    const state = this.clients.get(conn);
    if (state?.entityId === undefined) {
      conn.send({ t: "reject", seq, reason: "not logged in" });
      return;
    }
    this.commandQueue.push({ entityId: state.entityId, cmd });
  }

  private onChat(conn: Connection, channel: "zone" | "global", text: string): void {
    const state = this.clients.get(conn);
    if (state?.entityId === undefined) {
      conn.send({ t: "reject", seq: -1, reason: "not logged in" });
      return;
    }
    if (!state.chatBucket.tryTake()) {
      conn.send({ t: "reject", seq: -1, reason: "chat rate limited" });
      return;
    }
    const handle = this.world.players.get(state.entityId)?.handle ?? "?";
    const msg: ServerMessage = { t: "chat", from: handle, channel, text, tick: this.world.tick };

    if (channel === "global") {
      this.chatHistory.push(globalChatKey(), msg);
      this.broadcastAll(msg);
    } else {
      const pos = this.world.positions.get(state.entityId);
      if (!pos) return;
      this.chatHistory.push(zoneChatKey(pos.zone), msg);
      this.broadcastZone(pos.zone, msg);
    }
  }

  // ── simulation ─────────────────────────────────────────────────────────────

  /** Advance one tick. Exposed for tests; `start` drives it with a timer. */
  tick(): void {
    const cmds = this.commandQueue;
    this.commandQueue = [];
    const rng = createRng((ZONE_SEED << 16) ^ this.world.tick);
    const events = stepWorld(this.world, cmds, rng);
    if (events.length > 0) {
      this.broadcastAll({ t: "events", tick: this.world.tick, events });
    }
    // Phase 1: full snapshot per tick. Deltas + interest management come later.
    this.broadcastAll({ t: "snapshot", tick: this.world.tick, entities: this.buildViews() });
  }

  start(tickMs = 100): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), tickMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private isHandleTaken(handle: string): boolean {
    const lower = handle.toLowerCase();
    for (const session of this.world.players.values()) {
      if (session.handle.toLowerCase() === lower) return true;
    }
    return false;
  }

  private onlineHandles(): string[] {
    return [...this.world.players.values()].map((p) => p.handle);
  }

  private buildViews(): EntityView[] {
    const views: EntityView[] = [];
    for (const [id, entity] of this.world.entities) {
      const pos = this.world.positions.get(id);
      if (!pos) continue;
      const handle = this.world.players.get(id)?.handle;
      views.push(handle === undefined ? { ...entity, pos } : { ...entity, pos, handle });
    }
    return views;
  }

  private broadcastAll(msg: ServerMessage): void {
    for (const [conn, state] of this.clients) {
      if (state.entityId !== undefined) conn.send(msg);
    }
  }

  private broadcastZone(zone: ZoneId, msg: ServerMessage): void {
    for (const [conn, state] of this.clients) {
      if (state.entityId === undefined) continue;
      if (this.world.positions.get(state.entityId)?.zone === zone) conn.send(msg);
    }
  }
}
