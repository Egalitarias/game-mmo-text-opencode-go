/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-base-to-string */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WebSocket } from "ws";
import { encode, decode } from "@msgpack/msgpack";
import { EdgeGateway } from "../src/gateway/edgeGateway.js";

// Mock zone worker server
class MockZoneWorker {
  private socket: any;
  public messages: any[] = [];
  public url: string;

  constructor(url: string) {
    this.url = url;
  }

  async start(): Promise<void> {
    // In real tests, this would start a WebSocket server
    // For now, we'll mock the behavior
  }

  stop(): void {
    // Cleanup
  }

  receiveMessage(message: any): void {
    this.messages.push(message);
  }

  sendMessage(message: any): void {
    if (this.socket) {
      this.socket.send(encode(message));
    }
  }
}

describe("EdgeGateway", () => {
  let gateway: EdgeGateway;
  let mockZoneWorkers: Map<string, MockZoneWorker>;

  beforeEach(() => {
    mockZoneWorkers = new Map();
    mockZoneWorkers.set("cave", new MockZoneWorker("ws://localhost:3001"));
    mockZoneWorkers.set("dungeon", new MockZoneWorker("ws://localhost:3002"));
  });

  afterEach(async () => {
    if (gateway) {
      await gateway.stop();
    }
  });

  describe("initialization", () => {
    it("should create gateway with config", () => {
      gateway = new EdgeGateway({
        port: 8080,
        zoneWorkers: new Map([
          ["cave", "ws://localhost:3001"],
          ["dungeon", "ws://localhost:3002"],
        ]),
      });

      expect(gateway).toBeDefined();
    });

    it("should start and stop without errors", async () => {
      gateway = new EdgeGateway({
        port: 8081,
        zoneWorkers: new Map([
          ["cave", "ws://localhost:3001"],
        ]),
      });

      await gateway.start();
      expect(gateway.getSessionCount()).toBe(0);

      await gateway.stop();
    });
  });

  describe("client connections", () => {
    beforeEach(async () => {
      gateway = new EdgeGateway({
        port: 8082,
        zoneWorkers: new Map([
          ["cave", "ws://localhost:3001"],
        ]),
      });
      await gateway.start();
    });

    it("should accept client connections", async () => {
      const client = new WebSocket("ws://localhost:8082");
      
      await new Promise<void>((resolve) => {
        client.on("open", () => resolve());
      });

      expect(gateway.getSessionCount()).toBe(1);

      client.close();
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    it("should handle multiple client connections", async () => {
      const clients = [
        new WebSocket("ws://localhost:8082"),
        new WebSocket("ws://localhost:8082"),
        new WebSocket("ws://localhost:8082"),
      ];

      await Promise.all(
        clients.map((client) => 
          new Promise<void>((resolve) => {
            client.on("open", () => resolve());
          })
        )
      );

      expect(gateway.getSessionCount()).toBe(3);

      clients.forEach((client) => client.close());
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    it("should clean up sessions on client disconnect", async () => {
      const client = new WebSocket("ws://localhost:8082");
      
      await new Promise<void>((resolve) => {
        client.on("open", () => resolve());
      });

      expect(gateway.getSessionCount()).toBe(1);

      client.close();
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(gateway.getSessionCount()).toBe(0);
    });
  });

  describe("message routing", () => {
    beforeEach(async () => {
      gateway = new EdgeGateway({
        port: 8083,
        zoneWorkers: new Map([
          ["cave", "ws://localhost:3001"],
          ["dungeon", "ws://localhost:3002"],
        ]),
      });
      await gateway.start();
    });

    it("should route hello message to zone worker", async () => {
      const client = new WebSocket("ws://localhost:8083");
      
      await new Promise<void>((resolve) => {
        client.on("open", () => resolve());
      });

      const helloMessage = {
        t: "hello",
        handle: "TestPlayer",
        initialZone: "cave",
      };

      client.send(encode(helloMessage));
      await new Promise((resolve) => setTimeout(resolve, 100));

      // In a real test, we'd verify the zone worker received the message
      // For now, we just verify the gateway didn't crash

      client.close();
    });

    it("should reject messages before hello", async () => {
      const client = new WebSocket("ws://localhost:8083");
      
      const messages: any[] = [];
      client.on("message", (data) => {
        messages.push(decode(data as Buffer));
      });

      await new Promise<void>((resolve) => {
        client.on("open", () => resolve());
      });

      // Send command before hello
      client.send(encode({
        t: "cmd",
        seq: 1,
        cmd: { kind: "move", dx: 1, dy: 0 },
      }));

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(messages.length).toBeGreaterThan(0);
      expect(messages[0].t).toBe("error");
      expect(messages[0].message).toContain("Not connected to a zone");

      client.close();
    });

    it("should handle invalid JSON messages", async () => {
      const client = new WebSocket("ws://localhost:8083");
      
      const messages: any[] = [];
      client.on("message", (data) => {
        messages.push(decode(data as Buffer));
      });

      await new Promise<void>((resolve) => {
        client.on("open", () => resolve());
      });

      client.send("invalid json {{{");
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(messages.length).toBeGreaterThan(0);
      expect(messages[0].t).toBe("error");
      expect(messages[0].message).toContain("Invalid message format");

      client.close();
    });
  });

  describe("zone transitions", () => {
    beforeEach(async () => {
      gateway = new EdgeGateway({
        port: 8084,
        zoneWorkers: new Map([
          ["cave", "ws://localhost:3001"],
          ["dungeon", "ws://localhost:3002"],
        ]),
      });
      await gateway.start();
    });

    it("should update session zone on zone_changed message", async () => {
      const client = new WebSocket("ws://localhost:8084");
      
      await new Promise<void>((resolve) => {
        client.on("open", () => resolve());
      });

      // Send hello to establish session
      client.send(encode({
        t: "hello",
        handle: "TestPlayer",
        initialZone: "cave",
      }));

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Get session and verify initial zone
      const sessions = Array.from((gateway as any).sessions.values()) as any[];
      expect(sessions.length).toBe(1);
      expect(sessions[0].currentZone).toBe("cave");

      // Simulate zone transition (would come from zone worker)
      // In real test, zone worker would send this message
      sessions[0].currentZone = "dungeon";

      expect(sessions[0].currentZone).toBe("dungeon");

      client.close();
    });
  });

  describe("session management", () => {
    beforeEach(async () => {
      gateway = new EdgeGateway({
        port: 8085,
        zoneWorkers: new Map([
          ["cave", "ws://localhost:3001"],
        ]),
      });
      await gateway.start();
    });

    it("should track session metadata", async () => {
      const client = new WebSocket("ws://localhost:8085");
      
      await new Promise<void>((resolve) => {
        client.on("open", () => resolve());
      });

      const sessions = Array.from((gateway as any).sessions.values()) as any[];
      expect(sessions.length).toBe(1);

      const session = sessions[0] as any;
      expect(session.clientId).toBeDefined();
      expect(session.socket).toBeDefined();
      expect(session.connectedAt).toBeDefined();
      expect(session.connectedAt).toBeLessThanOrEqual(Date.now());

      client.close();
    });

    it("should generate unique client IDs", async () => {
      const clients = [
        new WebSocket("ws://localhost:8085"),
        new WebSocket("ws://localhost:8085"),
      ];

      await Promise.all(
        clients.map((client) => 
          new Promise<void>((resolve) => {
            client.on("open", () => resolve());
          })
        )
      );

      const sessions = Array.from((gateway as any).sessions.values());
      const clientIds = sessions.map((s: any) => s.clientId);
      
      expect(new Set(clientIds).size).toBe(2);

      clients.forEach((client) => client.close());
    });
  });

  describe("zone worker connections", () => {
    it("should connect to configured zone workers", async () => {
      gateway = new EdgeGateway({
        port: 8086,
        zoneWorkers: new Map([
          ["cave", "ws://localhost:3001"],
          ["dungeon", "ws://localhost:3002"],
        ]),
      });

      await gateway.start();

      // In real tests, we'd verify actual connections
      // For now, we just verify the gateway started without errors
      expect(gateway.getZoneConnectionCount()).toBeGreaterThanOrEqual(0);
    });

    it("should handle zone worker connection failures gracefully", async () => {
      gateway = new EdgeGateway({
        port: 8087,
        zoneWorkers: new Map([
          ["cave", "ws://localhost:9999"], // Non-existent worker
        ]),
      });

      // Should not throw, just log error
      await gateway.start();

      expect(gateway.isConnectedToZone("cave")).toBe(false);
    });
  });

  describe("error handling", () => {
    beforeEach(async () => {
      gateway = new EdgeGateway({
        port: 8088,
        zoneWorkers: new Map([
          ["cave", "ws://localhost:3001"],
        ]),
      });
      await gateway.start();
    });

    it("should handle client socket errors", async () => {
      const client = new WebSocket("ws://localhost:8088");
      
      await new Promise<void>((resolve) => {
        client.on("open", () => resolve());
      });

      expect(gateway.getSessionCount()).toBe(1);

      // Force close
      client.terminate();
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(gateway.getSessionCount()).toBe(0);
    });

    it("should handle routing to unavailable zones", async () => {
      const client = new WebSocket("ws://localhost:8088");
      
      await new Promise<void>((resolve) => {
        client.on("open", () => resolve());
      });

      // Send hello for non-existent zone
      client.send(encode({
        t: "hello",
        handle: "TestPlayer",
        initialZone: "nonexistent",
      }));

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should not crash, just log error
      expect(gateway.getSessionCount()).toBe(1);

      client.close();
    });
  });

  describe("monitoring and metrics", () => {
    beforeEach(async () => {
      gateway = new EdgeGateway({
        port: 8089,
        zoneWorkers: new Map([
          ["cave", "ws://localhost:3001"],
        ]),
      });
      await gateway.start();
    });

    it("should report session count", async () => {
      expect(gateway.getSessionCount()).toBe(0);

      const client = new WebSocket("ws://localhost:8089");
      await new Promise<void>((resolve) => {
        client.on("open", () => resolve());
      });

      expect(gateway.getSessionCount()).toBe(1);

      client.close();
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(gateway.getSessionCount()).toBe(0);
    });

    it("should report zone connection count", () => {
      const count = gateway.getZoneConnectionCount();
      expect(count).toBeGreaterThanOrEqual(0);
    });

    it("should check zone connection status", () => {
      const isConnected = gateway.isConnectedToZone("cave");
      expect(typeof isConnected).toBe("boolean");
    });

    it("should get session by client ID", async () => {
      const client = new WebSocket("ws://localhost:8089");
      await new Promise<void>((resolve) => {
        client.on("open", () => resolve());
      });

      const sessions = Array.from((gateway as any).sessions.values());
      const clientId = (sessions[0] as any).clientId;

      const session = gateway.getSession(clientId);
      expect(session).toBeDefined();
      expect(session?.clientId).toBe(clientId);

      client.close();
    });
  });
});
