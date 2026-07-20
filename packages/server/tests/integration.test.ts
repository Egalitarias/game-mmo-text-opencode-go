import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION, generateZone, makeWorld } from "@game/shared";
import type { ServerMessage } from "@game/shared";
import type { Connection } from "../src/gateway/connection.js";
import { GameServer, ZONE_ID, ZONE_SEED } from "../src/sim/gameServer.js";
import { ChatHistory } from "../src/gateway/chat.js";

class FakeConnection implements Connection {
  sent: ServerMessage[] = [];
  closed = false;
  send(msg: ServerMessage): void {
    this.sent.push(msg);
  }
  close(): void {
    this.closed = true;
  }
  /** All messages of one type received so far. */
  ofType<T extends ServerMessage["t"]>(t: T): Extract<ServerMessage, { t: T }>[] {
    return this.sent.filter((m): m is Extract<ServerMessage, { t: T }> => m.t === t);
  }
  last<T extends ServerMessage["t"]>(t: T): Extract<ServerMessage, { t: T }> {
    const msgs = this.ofType(t);
    const m = msgs[msgs.length - 1];
    if (!m) throw new Error(`no message of type ${t}`);
    return m;
  }
}

function makeServer(now = () => 1000) {
  return new GameServer({ now });
}

function join(server: GameServer, handle: string): FakeConnection {
  const conn = new FakeConnection();
  server.handleConnection(conn);
  server.handleMessage(
    conn,
    JSON.stringify({ t: "hello", handle, protocolVersion: PROTOCOL_VERSION }),
  );
  return conn;
}

describe("session lifecycle", () => {
  it("welcomes a player with roster and snapshot", () => {
    const server = makeServer();
    const conn = join(server, "Alice");

    const welcome = conn.last("welcome");
    expect(welcome.roster).toEqual(["Alice"]);
    expect(conn.last("snapshot").entities).toHaveLength(1);
    expect(conn.last("snapshot").entities[0]?.glyph).toBe("@");
  });

  it("rejects a taken handle (case-insensitive) and lets the client retry", () => {
    const server = makeServer();
    join(server, "Alice");
    const second = join(server, "ALICE");

    expect(second.last("reject").reason).toContain("taken");
    const retry = new FakeConnection();
    server.handleConnection(retry);
    server.handleMessage(
      retry,
      JSON.stringify({ t: "hello", handle: "alice2", protocolVersion: PROTOCOL_VERSION }),
    );
    expect(retry.last("welcome").roster).toContain("alice2");
  });

  it("rejects a mismatched protocol version", () => {
    const server = makeServer();
    const conn = new FakeConnection();
    server.handleConnection(conn);
    server.handleMessage(conn, JSON.stringify({ t: "hello", handle: "Bob", protocolVersion: 999 }));
    expect(conn.last("reject").reason).toContain("protocol mismatch");
  });

  it("does not echo the joiner's own joined event (welcome roster already has self)", () => {
    const server = makeServer();
    const alice = join(server, "Alice");

    const events = alice.ofType("events").flatMap((m) => m.events);
    expect(events).not.toContainEqual(expect.objectContaining({ kind: "joined", handle: "Alice" }));
    expect(alice.last("welcome").roster).toEqual(["Alice"]);
  });

  it("announces join and leave to other players", () => {
    const server = makeServer();
    const alice = join(server, "Alice");
    const bob = join(server, "Bob");

    const joined = alice.ofType("events").flatMap((m) => m.events);
    expect(joined).toContainEqual(expect.objectContaining({ kind: "joined", handle: "Bob" }));

    server.handleClose(bob);
    const left = alice.ofType("events").flatMap((m) => m.events);
    expect(left).toContainEqual(expect.objectContaining({ kind: "left", handle: "Bob" }));
  });
});

describe("movement", () => {
  it("applies a queued move on the next tick and broadcasts it", () => {
    const server = makeServer();
    const conn = join(server, "Alice");
    const before = conn.last("snapshot").entities[0]!.pos;

    server.handleMessage(
      conn,
      JSON.stringify({ t: "cmd", seq: 1, cmd: { kind: "move", dx: 1, dy: 0 } }),
    );
    server.tick();

    const after = conn.last("snapshot").entities[0]!.pos;
    expect(after).toEqual({ x: before.x + 1, y: before.y, zone: "cave" });
    expect(conn.last("events").events).toContainEqual(expect.objectContaining({ kind: "moved" }));
  });

  it("applies at most one command per entity per tick (last write wins)", () => {
    const server = makeServer();
    const conn = join(server, "Alice");
    const before = conn.last("snapshot").entities[0]!.pos;

    // A scripted client flooding commands must not outrun keyboard players.
    for (let i = 0; i < 10; i++) {
      server.handleMessage(
        conn,
        JSON.stringify({ t: "cmd", seq: i, cmd: { kind: "move", dx: 1, dy: 0 } }),
      );
    }
    server.tick();

    const after = conn.last("snapshot").entities[0]!.pos;
    expect(after).toEqual({ x: before.x + 1, y: before.y, zone: "cave" });
  });

  it("skips snapshot broadcast on idle ticks (no events)", () => {
    const server = makeServer();
    const conn = join(server, "Alice");
    const snapshotsBefore = conn.ofType("snapshot").length;

    server.tick();

    expect(conn.ofType("snapshot")).toHaveLength(snapshotsBefore);
  });

  it("rejects commands before login", () => {
    const server = makeServer();
    const conn = new FakeConnection();
    server.handleConnection(conn);
    server.handleMessage(
      conn,
      JSON.stringify({ t: "cmd", seq: 7, cmd: { kind: "move", dx: 1, dy: 0 } }),
    );
    expect(conn.last("reject")).toEqual({ t: "reject", seq: 7, reason: "not logged in" });
  });
});

describe("chat", () => {
  it("routes zone chat to same-zone players and global to everyone", () => {
    const server = makeServer();
    const alice = join(server, "Alice");
    const bob = join(server, "Bob");

    server.handleMessage(alice, JSON.stringify({ t: "chat", channel: "zone", text: "hi zone" }));
    expect(bob.last("chat")).toMatchObject({ from: "Alice", channel: "zone", text: "hi zone" });

    server.handleMessage(alice, JSON.stringify({ t: "chat", channel: "global", text: "hi all" }));
    expect(bob.last("chat")).toMatchObject({ from: "Alice", channel: "global", text: "hi all" });
    // Sender sees their own message too (echoed as authoritative).
    expect(alice.last("chat")).toMatchObject({ from: "Alice", text: "hi all" });
  });

  it("sends recent chat history to new joiners", () => {
    const server = makeServer();
    const alice = join(server, "Alice");
    server.handleMessage(
      alice,
      JSON.stringify({ t: "chat", channel: "global", text: "early msg" }),
    );

    const carol = join(server, "Carol");
    expect(carol.ofType("chat").map((m) => m.text)).toContain("early msg");
  });

  it("rate limits chat spam (burst 4, then rejected)", () => {
    const server = makeServer(() => 1000); // frozen clock: no refill
    const alice = join(server, "Alice");
    const bob = join(server, "Bob");

    for (let i = 0; i < 4; i++) {
      server.handleMessage(alice, JSON.stringify({ t: "chat", channel: "global", text: `m${i}` }));
    }
    server.handleMessage(alice, JSON.stringify({ t: "chat", channel: "global", text: "spam" }));

    expect(bob.ofType("chat")).toHaveLength(4);
    expect(alice.last("reject").reason).toBe("chat rate limited");
  });

  it("does not consume a rate-limit token when zone chat is aborted (no position)", () => {
    const server = makeServer(() => 1000); // frozen clock: no refill
    const alice = join(server, "Alice");
    const entityId = alice.last("welcome").entityId;

    // Remove Alice's position so zone chat aborts early.
    server.world.positions.delete(entityId);

    // Send zone chat 4 times — none should consume a token.
    for (let i = 0; i < 4; i++) {
      server.handleMessage(alice, JSON.stringify({ t: "chat", channel: "zone", text: `z${i}` }));
    }

    // All 4 tokens should still be available: global chat should succeed 4 times.
    const bob = join(server, "Bob");
    for (let i = 0; i < 4; i++) {
      server.handleMessage(alice, JSON.stringify({ t: "chat", channel: "global", text: `g${i}` }));
    }
    expect(bob.ofType("chat")).toHaveLength(4);

    // 5th global should be rate limited.
    server.handleMessage(alice, JSON.stringify({ t: "chat", channel: "global", text: "spam" }));
    expect(alice.last("reject").reason).toBe("chat rate limited");
  });

  it("rejects malformed messages", () => {
    const server = makeServer();
    const conn = join(server, "Alice");
    server.handleMessage(conn, "definitely not json");
    expect(conn.last("reject").reason).toBe("malformed message");
  });
});

describe("ChatHistory", () => {
  it("trims old messages when capacity is exceeded", () => {
    const history = new ChatHistory(3);
    const key = "test";

    for (let i = 0; i < 5; i++) {
      history.push(key, { t: "chat", from: "Alice", channel: "global", text: `msg${i}`, tick: i });
    }

    const recent = history.recent(key);
    expect(recent).toHaveLength(3);
    expect(recent.map((m) => m.text)).toEqual(["msg2", "msg3", "msg4"]);
  });

  it("returns empty array for unknown keys", () => {
    const history = new ChatHistory(10);
    expect(history.recent("nonexistent")).toEqual([]);
  });
});

describe("edge cases", () => {
  it("silently ignores a second hello from an already-logged-in connection", () => {
    const server = makeServer();
    const conn = join(server, "Alice");
    const welcomeCount = conn.ofType("welcome").length;

    server.handleMessage(
      conn,
      JSON.stringify({ t: "hello", handle: "Alice2", protocolVersion: PROTOCOL_VERSION }),
    );

    expect(conn.ofType("welcome")).toHaveLength(welcomeCount);
    expect(conn.ofType("reject")).toHaveLength(0);
  });

  it("rejects with 'world is full' when no walkable tiles are available", () => {
    const world = makeWorld();
    const tinyZone = generateZone(ZONE_ID, 3, 3, ZONE_SEED);
    world.zones.set(ZONE_ID, tinyZone);
    const server = new GameServer({ now: () => 1000, world });

    const alice = join(server, "Alice");
    expect(alice.ofType("welcome")).toHaveLength(1);

    // Fill all remaining walkable tiles with fake entities.
    const zone = world.zones.get(ZONE_ID)!;
    for (let y = 0; y < zone.height; y++) {
      for (let x = 0; x < zone.width; x++) {
        const tile = zone.tiles[y * zone.width + x];
        if (tile === "floor" && !world.positions.has(world.nextEntityId - 1)) {
          const id = world.nextEntityId++;
          world.entities.set(id, { id, glyph: "@" });
          world.positions.set(id, { x, y, zone: ZONE_ID });
        }
      }
    }

    const bob = new FakeConnection();
    server.handleConnection(bob);
    server.handleMessage(
      bob,
      JSON.stringify({ t: "hello", handle: "Bob", protocolVersion: PROTOCOL_VERSION }),
    );

    expect(bob.last("reject").reason).toBe("world is full");
  });
});
