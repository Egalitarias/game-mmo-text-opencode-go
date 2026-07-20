import { describe, expect, it } from "vitest";
import { makeWorld, spawnPlayer, spawnMonster, spawnItem, serializeWorld, deserializeWorld } from "../src/index.js";
import type { Item, Tile } from "../src/index.js";

describe("world serialization", () => {
  it("serializes and deserializes an empty world", () => {
    const world = makeWorld();
    world.tick = 42;
    world.nextEntityId = 100;

    const snapshot = serializeWorld(world);
    const restored = deserializeWorld(snapshot);

    expect(restored.tick).toBe(42);
    expect(restored.nextEntityId).toBe(100);
    expect(restored.entities.size).toBe(0);
    expect(restored.positions.size).toBe(0);
  });

  it("serializes and deserializes a world with a player", () => {
    const world = makeWorld();
    const zone = {
      id: "test",
      width: 10,
      height: 10,
      tiles: Array(100).fill("floor") as Tile[],
    };
    world.zones.set("test", zone);

    const playerId = spawnPlayer(world, "test", "Alice", 1000);
    expect(playerId).toBeDefined();

    const snapshot = serializeWorld(world);
    const restored = deserializeWorld(snapshot);

    expect(restored.players.size).toBe(1);
    expect(restored.players.get(playerId!)?.handle).toBe("Alice");
    expect(restored.positions.get(playerId!)?.zone).toBe("test");
  });

  it("serializes and deserializes a world with monsters", () => {
    const world = makeWorld();
    const zone = {
      id: "test",
      width: 10,
      height: 10,
      tiles: Array(100).fill("floor") as Tile[],
    };
    world.zones.set("test", zone);

    const monsterId = spawnMonster(world, "test", 5, 5, "g", "aggressive", 100);
    expect(monsterId).toBeDefined();

    const snapshot = serializeWorld(world);
    const restored = deserializeWorld(snapshot);

    expect(restored.ais.size).toBe(1);
    expect(restored.ais.get(monsterId!)?.kind).toBe("aggressive");
    expect(restored.energies.get(monsterId!)?.speed).toBe(100);
  });

  it("serializes and deserializes a world with items", () => {
    const world = makeWorld();
    const zone = {
      id: "test",
      width: 10,
      height: 10,
      tiles: Array(100).fill("floor") as Tile[],
    };
    world.zones.set("test", zone);

    const item: Item = { kind: "potion", name: "Health Potion", value: 10 };
    const itemId = spawnItem(world, "test", 3, 3, item);
    expect(itemId).toBeDefined();

    const snapshot = serializeWorld(world);
    const restored = deserializeWorld(snapshot);

    expect(restored.items.size).toBe(1);
    expect(restored.items.get(itemId!)?.kind).toBe("potion");
    expect(restored.items.get(itemId!)?.name).toBe("Health Potion");
    expect(restored.items.get(itemId!)?.value).toBe(10);
  });

  it("serializes and deserializes a world with inventories", () => {
    const world = makeWorld();
    const zone = {
      id: "test",
      width: 10,
      height: 10,
      tiles: Array(100).fill("floor") as Tile[],
    };
    world.zones.set("test", zone);

    const playerId = spawnPlayer(world, "test", "Bob", 1000);
    expect(playerId).toBeDefined();

    const inventory = world.inventories.get(playerId!);
    expect(inventory).toBeDefined();
    inventory!.items.push({ kind: "sword", name: "Iron Sword", value: 5 });
    inventory!.items.push({ kind: "shield", name: "Wooden Shield", value: 3 });

    const snapshot = serializeWorld(world);
    const restored = deserializeWorld(snapshot);

    const restoredInventory = restored.inventories.get(playerId!);
    expect(restoredInventory).toBeDefined();
    expect(restoredInventory!.items.length).toBe(2);
    expect(restoredInventory!.items[0]?.kind).toBe("sword");
    expect(restoredInventory!.items[1]?.kind).toBe("shield");
  });

  it("serializes and deserializes zones with connections", () => {
    const world = makeWorld();
    const zone1 = {
      id: "zone1",
      width: 10,
      height: 10,
      tiles: Array(100).fill("floor") as Tile[],
      connections: new Map([
        ["5,5", { targetZone: "zone2", targetX: 1, targetY: 1 }],
      ]),
    };
    const zone2 = {
      id: "zone2",
      width: 10,
      height: 10,
      tiles: Array(100).fill("floor") as Tile[],
    };
    world.zones.set("zone1", zone1);
    world.zones.set("zone2", zone2);

    const snapshot = serializeWorld(world);
    const restored = deserializeWorld(snapshot);

    expect(restored.zones.size).toBe(2);
    const restoredZone1 = restored.zones.get("zone1");
    expect(restoredZone1).toBeDefined();
    expect(restoredZone1!.connections).toBeDefined();
    expect(restoredZone1!.connections!.get("5,5")?.targetZone).toBe("zone2");
  });

  it("preserves occupancy index", () => {
    const world = makeWorld();
    const zone = {
      id: "test",
      width: 10,
      height: 10,
      tiles: Array(100).fill("floor") as Tile[],
    };
    world.zones.set("test", zone);

    const playerId = spawnPlayer(world, "test", "Charlie", 1000);
    expect(playerId).toBeDefined();

    const pos = world.positions.get(playerId!);
    expect(pos).toBeDefined();

    const snapshot = serializeWorld(world);
    const restored = deserializeWorld(snapshot);

    const key = `${pos!.zone},${pos!.x},${pos!.y}`;
    expect(restored.occupancy.get(key)).toBe(playerId);
  });

  it("preserves stats", () => {
    const world = makeWorld();
    const zone = {
      id: "test",
      width: 10,
      height: 10,
      tiles: Array(100).fill("floor") as Tile[],
    };
    world.zones.set("test", zone);

    const playerId = spawnPlayer(world, "test", "Dave", 1000);
    expect(playerId).toBeDefined();

    const stats = world.stats.get(playerId!);
    expect(stats).toBeDefined();
    stats!.hp = 15;
    stats!.attack = 8;

    const snapshot = serializeWorld(world);
    const restored = deserializeWorld(snapshot);

    const restoredStats = restored.stats.get(playerId!);
    expect(restoredStats).toBeDefined();
    expect(restoredStats!.hp).toBe(15);
    expect(restoredStats!.attack).toBe(8);
  });
});
