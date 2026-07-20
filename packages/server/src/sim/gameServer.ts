import {
  PROTOCOL_VERSION,
  generateZoneWithVaults,
  spawnVaultEntities,
  makeWorld,
  parseClientMessage,
  removeEntity,
  spawnPlayer,
  spawnMonster,
  stepWorld,
  createRng,
  computeFov,
} from "@game/shared";
import type {
  Command,
  EntityId,
  EntityView,
  QueuedCommand,
  ServerMessage,
  World,
  WorldStore,
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
const FOV_RADIUS = 10;

interface ClientState {
  entityId?: EntityId;
  chatBucket: TokenBucket;
  /** Previous entity views for delta calculation */
  lastSnapshot?: Map<EntityId, EntityView>;
}

export interface GameServerOptions {
  now?: () => number;
  world?: World;
  worldStore?: WorldStore;
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
  /** One queued command per entity per tick — last write wins (ARCHITECTURE.md §5.1). */
  private readonly commandQueue = new Map<EntityId, Command>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly worldStore?: WorldStore | undefined;

  constructor(opts: GameServerOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.worldStore = opts.worldStore;
    this.world = opts.world ?? makeWorld();
    
    // If worldStore is provided and no world was passed, try to load
    if (this.worldStore && !opts.world) {
      this.worldStore.load().then((loadedWorld) => {
        if (loadedWorld) {
          // Copy loaded world data into this.world
          Object.assign(this.world, loadedWorld);
          console.log("World loaded from persistent storage");
        } else if (!this.world.zones.has(ZONE_ID)) {
          this.generateZones();
        }
      }).catch((error) => {
        console.error("Failed to load world:", error);
        if (!this.world.zones.has(ZONE_ID)) {
          this.generateZones();
        }
      });
    } else if (!this.world.zones.has(ZONE_ID)) {
      this.generateZones();
    }
  }

  private generateZones(): void {
    // Generate three interconnected zones with vaults
    const zones = [
      { id: ZONE_ID, width: 40, height: 20, seed: ZONE_SEED, difficulty: 3 },
      { id: "dungeon", width: 35, height: 25, seed: ZONE_SEED + 1, difficulty: 6 },
      { id: "forest", width: 45, height: 22, seed: ZONE_SEED + 2, difficulty: 4 },
    ];

    for (const zoneConfig of zones) {
      // Generate zone with vaults
      const result = generateZoneWithVaults({
        id: zoneConfig.id,
        width: zoneConfig.width,
        height: zoneConfig.height,
        seed: zoneConfig.seed,
        difficulty: zoneConfig.difficulty,
        enableVaults: true,
        maxVaults: 3,
      });

      result.zone.connections = new Map();
      this.world.zones.set(zoneConfig.id, result.zone);

      // Spawn entities from vault spawns
      spawnVaultEntities(this.world, zoneConfig.id, result.spawns);

      // Also spawn some random monsters for variety
      this.spawnMonsters(zoneConfig.id);
    }

    // Connect cave -> dungeon (stairs down in cave, stairs up in dungeon)
    this.connectZones(ZONE_ID, "dungeon", 35, 15, 5, 5);
    
    // Connect dungeon -> forest (stairs up in dungeon, stairs down in forest)
    this.connectZones("dungeon", "forest", 30, 20, 10, 10);
    
    // Connect forest -> cave (stairs up in forest, stairs down in cave)
    this.connectZones("forest", ZONE_ID, 40, 18, 5, 5);
  }

  private connectZones(
    fromZone: ZoneId,
    toZone: ZoneId,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number
  ): void {
    const zone1 = this.world.zones.get(fromZone);
    const zone2 = this.world.zones.get(toZone);
    if (!zone1 || !zone2) return;

    // Place stairs in both zones
    const tileIndex1 = fromY * zone1.width + fromX;
    const tileIndex2 = toY * zone2.width + toX;
    
    zone1.tiles[tileIndex1] = "stairs_down";
    zone2.tiles[tileIndex2] = "stairs_up";

    // Set up connections
    if (!zone1.connections) zone1.connections = new Map();
    if (!zone2.connections) zone2.connections = new Map();

    zone1.connections.set(`${fromX},${fromY}`, {
      targetZone: toZone,
      targetX: toX,
      targetY: toY,
    });

    zone2.connections.set(`${toX},${toY}`, {
      targetZone: fromZone,
      targetX: fromX,
      targetY: fromY,
    });
  }

  private spawnMonsters(zoneId: ZoneId): void {
    const zone = this.world.zones.get(zoneId);
    if (!zone) return;

    const rng = createRng(ZONE_SEED ^ 0xDEAD);
    const monsterCount = 5 + rng.int(6); // 5-10 monsters

    for (let i = 0; i < monsterCount; i++) {
      // Try random positions until we find a valid spawn point
      for (let attempt = 0; attempt < 20; attempt++) {
        const x = 1 + rng.int(zone.width - 2);
        const y = 1 + rng.int(zone.height - 2);
        
        const aiKinds: Array<"aggressive" | "wander" | "flee"> = ["aggressive", "wander", "flee"];
        const aiKind = aiKinds[rng.int(aiKinds.length)]!;
        const glyphs: Record<string, string> = { aggressive: "g", wander: "w", flee: "f" };
        const glyph = glyphs[aiKind] ?? "m";
        
        const monsterId = spawnMonster(this.world, zoneId, x, y, glyph, aiKind, 100);
        if (monsterId !== undefined) break;
      }
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
    
    // Send initial full snapshot
    const initialViews = this.buildViews(entityId);
    conn.send({ t: "snapshot", tick: this.world.tick, entities: initialViews });
    
    // Store initial snapshot for delta calculation
    state.lastSnapshot = new Map(initialViews.map(v => [v.id, v]));
    
    for (const msg of this.chatHistory.recent(globalChatKey())) conn.send(msg);
    for (const msg of this.chatHistory.recent(zoneChatKey(ZONE_ID))) conn.send(msg);

    // The joiner's welcome roster already includes themselves — only others
    // need the joined event.
    this.broadcastAll(
      {
        t: "events",
        tick: this.world.tick,
        events: [{ kind: "joined", entityId, handle }],
      },
      conn,
    );
  }

  private onCmd(conn: Connection, seq: number, cmd: Command): void {
    const state = this.clients.get(conn);
    if (state?.entityId === undefined) {
      conn.send({ t: "reject", seq, reason: "not logged in" });
      return;
    }
    this.commandQueue.set(state.entityId, cmd);
  }

  private onChat(conn: Connection, channel: "zone" | "global", text: string): void {
    const state = this.clients.get(conn);
    if (state?.entityId === undefined) {
      conn.send({ t: "reject", seq: -1, reason: "not logged in" });
      return;
    }
    const handle = this.world.players.get(state.entityId)?.handle ?? "?";
    const pos = channel === "zone" ? this.world.positions.get(state.entityId) : undefined;
    if (channel === "zone" && !pos) return;
    if (!state.chatBucket.tryTake()) {
      conn.send({ t: "reject", seq: -1, reason: "chat rate limited" });
      return;
    }
    const msg: ServerMessage = { t: "chat", from: handle, channel, text, tick: this.world.tick };

    if (channel === "global") {
      this.chatHistory.push(globalChatKey(), msg);
      this.broadcastAll(msg);
    } else {
      this.chatHistory.push(zoneChatKey(pos!.zone), msg);
      this.broadcastZone(pos!.zone, msg);
    }
  }

  // ── simulation ─────────────────────────────────────────────────────────────

  /** Advance one tick. Exposed for tests; `start` drives it with a timer. */
  tick(): void {
    const cmds: QueuedCommand[] = [...this.commandQueue].map(([entityId, cmd]) => ({
      entityId,
      cmd,
    }));
    this.commandQueue.clear();
    const rng = createRng((ZONE_SEED << 16) ^ this.world.tick);
    const events = stepWorld(this.world, cmds, rng);
    if (events.length > 0) {
      this.broadcastAll({ t: "events", tick: this.world.tick, events });
      // Send per-player FOV-filtered deltas
      for (const [conn, state] of this.clients) {
        if (state.entityId === undefined) continue;
        const currentViews = this.buildViews(state.entityId);
        
        // Calculate delta from previous snapshot
        const { changed, removed } = this.calculateDelta(currentViews, state.lastSnapshot);
        
        // Only send delta if there are changes
        if (changed.length > 0 || removed.length > 0) {
          conn.send({ t: "delta", tick: this.world.tick, changed, removed });
        }
        
        // Update last snapshot for next delta calculation
        state.lastSnapshot = new Map(currentViews.map(v => [v.id, v]));
      }
    }
  }

  start(tickMs = 100): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), tickMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /**
   * Save the current world state to persistent storage.
   * Returns a promise that resolves when the save is complete.
   */
  async save(): Promise<void> {
    if (!this.worldStore) {
      console.warn("No world store configured, skipping save");
      return;
    }
    await this.worldStore.save(this.world);
  }

  /**
   * Gracefully shutdown: save world state and stop the tick loop.
   */
  async shutdown(): Promise<void> {
    await this.save();
    this.stop();
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

  private buildViews(forEntityId?: EntityId): EntityView[] {
    const views: EntityView[] = [];
    const fov = forEntityId !== undefined ? computeFov(this.world, forEntityId, FOV_RADIUS) : null;
    
    for (const [id, entity] of this.world.entities) {
      const pos = this.world.positions.get(id);
      if (!pos) continue;
      
      // If FOV filtering is enabled, only include entities within the viewer's FOV
      if (fov && !fov.has(`${pos.x},${pos.y}`)) {
        continue;
      }
      
      const handle = this.world.players.get(id)?.handle;
      views.push(handle === undefined ? { ...entity, pos } : { ...entity, pos, handle });
    }
    return views;
  }

  /**
   * Calculate delta between current and previous entity views.
   * Returns changed entities and removed entity IDs.
   */
  private calculateDelta(
    current: EntityView[],
    previous?: Map<EntityId, EntityView>
  ): { changed: EntityView[]; removed: EntityId[] } {
    const changed: EntityView[] = [];
    const removed: EntityId[] = [];
    const currentIds = new Set<EntityId>();

    // Find changed or new entities
    for (const view of current) {
      currentIds.add(view.id);
      const prev = previous?.get(view.id);
      
      if (!prev) {
        // New entity
        changed.push(view);
      } else if (
        prev.pos.x !== view.pos.x ||
        prev.pos.y !== view.pos.y ||
        prev.pos.zone !== view.pos.zone ||
        prev.glyph !== view.glyph ||
        prev.handle !== view.handle
      ) {
        // Changed entity
        changed.push(view);
      }
    }

    // Find removed entities
    if (previous) {
      for (const id of previous.keys()) {
        if (!currentIds.has(id)) {
          removed.push(id);
        }
      }
    }

    return { changed, removed };
  }

  private broadcastAll(msg: ServerMessage, except?: Connection): void {
    for (const [conn, state] of this.clients) {
      if (conn === except) continue;
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
