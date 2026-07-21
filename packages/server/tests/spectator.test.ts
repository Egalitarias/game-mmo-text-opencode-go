import { describe, it, expect, beforeEach } from "vitest";
import { GameServer } from "../src/sim/gameServer.js";
import type { Connection } from "../src/gateway/connection.js";
import type { ServerMessage } from "@game/shared";

class MockConnection implements Connection {
  messages: ServerMessage[] = [];
  closed = false;

  send(msg: ServerMessage): void {
    this.messages.push(msg);
  }

  close(): void {
    this.closed = true;
  }

  getMessagesByType<T extends ServerMessage["t"]>(type: T): Extract<ServerMessage, { t: T }>[] {
    return this.messages.filter((m): m is Extract<ServerMessage, { t: T }> => m.t === type);
  }
}

describe("Spectator Mode", () => {
  let server: GameServer;

  beforeEach(() => {
    server = new GameServer();
  });

  it("should allow spectator connections without spawning an entity", () => {
    const conn = new MockConnection();
    server.handleConnection(conn);
    server.handleMessage(conn, JSON.stringify({
      t: "hello",
      handle: "spectator1",
      protocolVersion: 1,
      spectator: true,
    }));

    const welcomeMsgs = conn.getMessagesByType("welcome");
    expect(welcomeMsgs).toHaveLength(1);
    expect(welcomeMsgs[0]!.entityId).toBe(-1); // Spectators get entityId -1
  });

  it("should send full snapshot to spectators (no FOV filtering)", () => {
    // First, add a regular player
    const playerConn = new MockConnection();
    server.handleConnection(playerConn);
    server.handleMessage(playerConn, JSON.stringify({
      t: "hello",
      handle: "player1",
      protocolVersion: 1,
    }));

    // Then add a spectator
    const spectatorConn = new MockConnection();
    server.handleConnection(spectatorConn);
    server.handleMessage(spectatorConn, JSON.stringify({
      t: "hello",
      handle: "spectator1",
      protocolVersion: 1,
      spectator: true,
    }));

    const snapshotMsgs = spectatorConn.getMessagesByType("snapshot");
    expect(snapshotMsgs).toHaveLength(1);
    // Spectator should see all entities (player + monsters)
    expect(snapshotMsgs[0]!.entities.length).toBeGreaterThan(0);
  });

  it("should reject commands from spectators", () => {
    const conn = new MockConnection();
    server.handleConnection(conn);
    server.handleMessage(conn, JSON.stringify({
      t: "hello",
      handle: "spectator1",
      protocolVersion: 1,
      spectator: true,
    }));

    // Try to send a command
    server.handleMessage(conn, JSON.stringify({
      t: "cmd",
      seq: 1,
      cmd: { kind: "move", dx: 1, dy: 0 },
    }));

    const rejectMsgs = conn.getMessagesByType("reject");
    expect(rejectMsgs).toHaveLength(1);
    expect(rejectMsgs[0]!.reason).toContain("spectator");
  });

  it("should not add spectators to the roster", () => {
    // Add a regular player
    const playerConn = new MockConnection();
    server.handleConnection(playerConn);
    server.handleMessage(playerConn, JSON.stringify({
      t: "hello",
      handle: "player1",
      protocolVersion: 1,
    }));

    const playerWelcome = playerConn.getMessagesByType("welcome");
    expect(playerWelcome[0]!.roster).toContain("player1");

    // Add a spectator
    const spectatorConn = new MockConnection();
    server.handleConnection(spectatorConn);
    server.handleMessage(spectatorConn, JSON.stringify({
      t: "hello",
      handle: "spectator1",
      protocolVersion: 1,
      spectator: true,
    }));

    // Spectator should not be in the roster
    const spectatorWelcome = spectatorConn.getMessagesByType("welcome");
    expect(spectatorWelcome[0]!.roster).not.toContain("spectator1");
  });

  it("should not broadcast joined event for spectators", () => {
    // Add a regular player first
    const playerConn = new MockConnection();
    server.handleConnection(playerConn);
    server.handleMessage(playerConn, JSON.stringify({
      t: "hello",
      handle: "player1",
      protocolVersion: 1,
    }));

    // Clear player's messages
    playerConn.messages = [];

    // Add a spectator
    const spectatorConn = new MockConnection();
    server.handleConnection(spectatorConn);
    server.handleMessage(spectatorConn, JSON.stringify({
      t: "hello",
      handle: "spectator1",
      protocolVersion: 1,
      spectator: true,
    }));

    // Player should not receive a joined event for the spectator
    const eventMsgs = playerConn.getMessagesByType("events");
    const joinedEvents = eventMsgs.flatMap((m) => m.events).filter((e) => e.kind === "joined");
    expect(joinedEvents.find((e) => e.kind === "joined" && e.handle === "spectator1")).toBeUndefined();
  });

  it("should allow spectators to chat", () => {
    const conn = new MockConnection();
    server.handleConnection(conn);
    server.handleMessage(conn, JSON.stringify({
      t: "hello",
      handle: "spectator1",
      protocolVersion: 1,
      spectator: true,
    }));

    // Spectators can still chat (this is allowed)
    server.handleMessage(conn, JSON.stringify({
      t: "chat",
      channel: "global",
      text: "Hello from spectator!",
    }));

    // Chat should not be rejected
    const rejectMsgs = conn.getMessagesByType("reject");
    expect(rejectMsgs).toHaveLength(0);
  });

  it("should send deltas to spectators with full view", () => {
    // Add a spectator
    const spectatorConn = new MockConnection();
    server.handleConnection(spectatorConn);
    server.handleMessage(spectatorConn, JSON.stringify({
      t: "hello",
      handle: "spectator1",
      protocolVersion: 1,
      spectator: true,
    }));

    // Add a player
    const playerConn = new MockConnection();
    server.handleConnection(playerConn);
    server.handleMessage(playerConn, JSON.stringify({
      t: "hello",
      handle: "player1",
      protocolVersion: 1,
    }));

    // Move the player
    server.handleMessage(playerConn, JSON.stringify({
      t: "cmd",
      seq: 1,
      cmd: { kind: "move", dx: 1, dy: 0 },
    }));

    // Tick to process the command
    server.tick();

    // Spectator should receive delta updates
    const deltaMsgs = spectatorConn.getMessagesByType("delta");
    expect(deltaMsgs.length).toBeGreaterThan(0);
  });

  it("should reject a player handle that matches an existing spectator handle", () => {
    const spectatorConn = new MockConnection();
    server.handleConnection(spectatorConn);
    server.handleMessage(spectatorConn, JSON.stringify({
      t: "hello",
      handle: "watcher",
      protocolVersion: 1,
      spectator: true,
    }));

    const playerConn = new MockConnection();
    server.handleConnection(playerConn);
    server.handleMessage(playerConn, JSON.stringify({
      t: "hello",
      handle: "watcher",
      protocolVersion: 1,
    }));

    const rejectMsgs = playerConn.getMessagesByType("reject");
    expect(rejectMsgs).toHaveLength(1);
    expect(rejectMsgs[0]!.reason).toContain("taken");
  });

  it("should reject a spectator handle that matches an existing player handle", () => {
    const playerConn = new MockConnection();
    server.handleConnection(playerConn);
    server.handleMessage(playerConn, JSON.stringify({
      t: "hello",
      handle: "player1",
      protocolVersion: 1,
    }));

    const spectatorConn = new MockConnection();
    server.handleConnection(spectatorConn);
    server.handleMessage(spectatorConn, JSON.stringify({
      t: "hello",
      handle: "player1",
      protocolVersion: 1,
      spectator: true,
    }));

    const rejectMsgs = spectatorConn.getMessagesByType("reject");
    expect(rejectMsgs).toHaveLength(1);
    expect(rejectMsgs[0]!.reason).toContain("taken");
  });

  it("should cleanly disconnect spectators without removing entities", () => {
    const spectatorConn = new MockConnection();
    server.handleConnection(spectatorConn);
    server.handleMessage(spectatorConn, JSON.stringify({
      t: "hello",
      handle: "spectator1",
      protocolVersion: 1,
      spectator: true,
    }));

    const playerConn = new MockConnection();
    server.handleConnection(playerConn);
    server.handleMessage(playerConn, JSON.stringify({
      t: "hello",
      handle: "player1",
      protocolVersion: 1,
    }));

    playerConn.messages = [];

    server.handleClose(spectatorConn);

    const eventMsgs = playerConn.getMessagesByType("events");
    const leftEvents = eventMsgs.flatMap((m) => m.events).filter((e) => e.kind === "left");
    expect(leftEvents).toHaveLength(0);
  });

  it("should include spectators in zone chat broadcasts", () => {
    const playerConn = new MockConnection();
    server.handleConnection(playerConn);
    server.handleMessage(playerConn, JSON.stringify({
      t: "hello",
      handle: "player1",
      protocolVersion: 1,
    }));

    const spectatorConn = new MockConnection();
    server.handleConnection(spectatorConn);
    server.handleMessage(spectatorConn, JSON.stringify({
      t: "hello",
      handle: "spectator1",
      protocolVersion: 1,
      spectator: true,
    }));

    spectatorConn.messages = [];

    server.handleMessage(playerConn, JSON.stringify({
      t: "chat",
      channel: "zone",
      text: "hello zone",
    }));

    const chatMsgs = spectatorConn.getMessagesByType("chat");
    expect(chatMsgs).toHaveLength(1);
    expect(chatMsgs[0]!.text).toBe("hello zone");
  });

  it("should include spectatorCount in welcome messages", () => {
    const playerConn = new MockConnection();
    server.handleConnection(playerConn);
    server.handleMessage(playerConn, JSON.stringify({
      t: "hello",
      handle: "player1",
      protocolVersion: 1,
    }));

    const playerWelcome = playerConn.getMessagesByType("welcome");
    expect(playerWelcome[0]!.spectatorCount).toBe(0);

    const spectatorConn = new MockConnection();
    server.handleConnection(spectatorConn);
    server.handleMessage(spectatorConn, JSON.stringify({
      t: "hello",
      handle: "spectator1",
      protocolVersion: 1,
      spectator: true,
    }));

    const spectatorWelcome = spectatorConn.getMessagesByType("welcome");
    expect(spectatorWelcome[0]!.spectatorCount).toBe(1);
  });
});
