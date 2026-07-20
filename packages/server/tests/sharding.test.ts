import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ZoneShardManager } from "../src/sharding/zoneShardManager.js";

// Helper to access private members for testing
function getWorkers(manager: ZoneShardManager): Map<string, { stop: () => Promise<void> }> {
  return (manager as unknown as { workers: Map<string, { stop: () => Promise<void> }> }).workers;
}

function getEventHandlers(manager: ZoneShardManager): unknown[] {
  return (manager as unknown as { eventHandlers: unknown[] }).eventHandlers;
}

describe("ZoneShardManager Logic", () => {
  let manager: ZoneShardManager;

  beforeEach(() => {
    // Use a dummy worker script path since we're not actually spawning workers
    manager = new ZoneShardManager("dummy-worker.js");
  });

  afterEach(async () => {
    await manager.stopAll();
  });

  it("should track zone count", () => {
    expect(manager.getZoneCount()).toBe(0);
  });

  it("should track entity count", () => {
    expect(manager.getEntityCount()).toBe(0);
  });

  it("should return empty zones list initially", () => {
    expect(manager.getZones()).toEqual([]);
  });

  it("should register and unregister entities", () => {
    // Manually add a zone to the internal map for testing
    const workers = getWorkers(manager);
    workers.set("zone1", { stop: async () => {} });
    
    manager.registerEntity(1, "zone1");
    expect(manager.getEntityZone(1)).toBe("zone1");
    expect(manager.getEntityCount()).toBe(1);

    manager.unregisterEntity(1);
    expect(manager.getEntityZone(1)).toBeUndefined();
    expect(manager.getEntityCount()).toBe(0);
  });

  it("should throw error when registering entity in non-existent zone", () => {
    expect(() => {
      manager.registerEntity(1, "nonexistent");
    }).toThrow("Zone nonexistent not found");
  });

  it("should throw error when sending command to unregistered entity", () => {
    expect(() => {
      manager.sendCommand(1, { kind: "move", dx: 1, dy: 0 });
    }).toThrow("Entity 1 not registered in any zone");
  });

  it("should add and remove event handlers", () => {
    const handler = (_zoneId: string, _events: unknown[]) => {};
    
    manager.addEventHandler(handler);
    const eventHandlers = getEventHandlers(manager);
    expect(eventHandlers.length).toBe(1);
    
    manager.removeEventHandler(handler);
    expect(eventHandlers.length).toBe(0);
  });

  it("should handle multiple entity registrations", () => {
    const workers = getWorkers(manager);
    workers.set("zone1", { stop: async () => {} });
    workers.set("zone2", { stop: async () => {} });
    
    manager.registerEntity(1, "zone1");
    manager.registerEntity(2, "zone1");
    manager.registerEntity(3, "zone2");
    
    expect(manager.getEntityCount()).toBe(3);
    expect(manager.getEntityZone(1)).toBe("zone1");
    expect(manager.getEntityZone(2)).toBe("zone1");
    expect(manager.getEntityZone(3)).toBe("zone2");
  });

  it("should clean up entity mappings when stopping zone", async () => {
    const workers = getWorkers(manager);
    workers.set("zone1", { stop: async () => {} });
    workers.set("zone2", { stop: async () => {} });
    
    manager.registerEntity(1, "zone1");
    manager.registerEntity(2, "zone1");
    manager.registerEntity(3, "zone2");

    expect(manager.getEntityCount()).toBe(3);

    await manager.stopZone("zone1");

    expect(manager.getEntityCount()).toBe(1);
    expect(manager.getEntityZone(1)).toBeUndefined();
    expect(manager.getEntityZone(2)).toBeUndefined();
    expect(manager.getEntityZone(3)).toBe("zone2");
  });

  it("should throw error when stopping non-existent zone", async () => {
    await expect(manager.stopZone("nonexistent")).rejects.toThrow(
      "Zone nonexistent not found"
    );
  });

  it("should throw error when starting duplicate zone", async () => {
    const workers = getWorkers(manager);
    workers.set("zone1", { stop: async () => {} });
    
    await expect(manager.startZone("zone1")).rejects.toThrow(
      "Zone zone1 already started"
    );
  });
});

describe("Zone Sharding Architecture", () => {
  it("should document the sharding design", () => {
    // This test documents the zone sharding architecture
    const architecture = {
      description: "Zone sharding allows each zone to run in its own worker thread",
      benefits: [
        "Better scalability - zones can run on different CPU cores",
        "Isolation - zone crashes don't affect other zones",
        "Independent scaling - busy zones can be moved to dedicated workers",
      ],
      components: {
        ZoneWorker: "Manages a single zone in a dedicated worker thread",
        ZoneShardManager: "Coordinates multiple zone workers and routes commands",
        ZoneWorkerScript: "The actual worker script that runs zone simulation",
      },
      flow: [
        "Gateway receives player command",
        "ZoneShardManager routes command to correct zone worker",
        "Zone worker processes command and generates events",
        "Events are sent back to gateway for broadcast",
        "Zone transitions are coordinated between workers",
      ],
    };
    
    expect(architecture.description).toBeDefined();
    expect(architecture.benefits.length).toBeGreaterThan(0);
    expect(architecture.components.ZoneWorker).toBeDefined();
    expect(architecture.flow.length).toBeGreaterThan(0);
  });
});
