import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { writeFile, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FileWorldStore } from "../src/persistence/fileWorldStore.js";
import { makeWorld, spawnPlayer, spawnMonster, spawnItem } from "@game/shared";
import type { Item, Tile } from "@game/shared";

describe("FileWorldStore", () => {
  let testDir: string;
  let store: FileWorldStore;

  beforeEach(async () => {
    testDir = join(tmpdir(), `game-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    store = new FileWorldStore(join(testDir, "world.json"));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("saves and loads a world", async () => {
    const world = makeWorld();
    const zone = {
      id: "test",
      width: 10,
      height: 10,
      tiles: Array(100).fill("floor") as Tile[],
    };
    world.zones.set("test", zone);
    world.tick = 42;

    const playerId = spawnPlayer(world, "test", "Alice", 1000);
    expect(playerId).toBeDefined();

    await store.save(world);
    const loaded = await store.load();

    expect(loaded).toBeDefined();
    expect(loaded!.tick).toBe(42);
    expect(loaded!.players.size).toBe(1);
    expect(loaded!.players.get(playerId!)?.handle).toBe("Alice");
  });

  it("returns null when no saved world exists", async () => {
    const loaded = await store.load();
    expect(loaded).toBeNull();
  });

  it("overwrites existing save", async () => {
    const world1 = makeWorld();
    world1.tick = 10;
    await store.save(world1);

    const world2 = makeWorld();
    world2.tick = 20;
    await store.save(world2);

    const loaded = await store.load();
    expect(loaded!.tick).toBe(20);
  });

  it("preserves complex world state", async () => {
    const world = makeWorld();
    const zone = {
      id: "test",
      width: 20,
      height: 20,
      tiles: Array(400).fill("floor") as Tile[],
    };
    world.zones.set("test", zone);

    // Add player
    const playerId = spawnPlayer(world, "test", "Bob", 1000);
    expect(playerId).toBeDefined();

    // Add monster
    const monsterId = spawnMonster(world, "test", 10, 10, "g", "aggressive", 100);
    expect(monsterId).toBeDefined();

    // Add item
    const item: Item = { kind: "potion", name: "Health Potion", value: 10 };
    const itemId = spawnItem(world, "test", 5, 5, item);
    expect(itemId).toBeDefined();

    // Modify player stats
    const stats = world.stats.get(playerId!);
    expect(stats).toBeDefined();
    stats!.hp = 15;
    stats!.attack = 8;

    // Add items to inventory
    const inventory = world.inventories.get(playerId!);
    expect(inventory).toBeDefined();
    inventory!.items.push({ kind: "sword", name: "Iron Sword", value: 5 });

    await store.save(world);
    const loaded = await store.load();

    expect(loaded).toBeDefined();
    expect(loaded!.players.size).toBe(1);
    expect(loaded!.ais.size).toBe(1);
    expect(loaded!.items.size).toBe(1);

    const loadedStats = loaded!.stats.get(playerId!);
    expect(loadedStats?.hp).toBe(15);
    expect(loadedStats?.attack).toBe(8);

    const loadedInventory = loaded!.inventories.get(playerId!);
    expect(loadedInventory?.items.length).toBe(1);
    expect(loadedInventory?.items[0]?.kind).toBe("sword");
  });

  it("handles save errors gracefully", async () => {
    const invalidPath = "/nonexistent/directory/world.json";
    const invalidStore = new FileWorldStore(invalidPath);
    const world = makeWorld();

    // Should not throw, but log error
    await expect(invalidStore.save(world)).rejects.toThrow();
  });

  it("handles corrupt save file", async () => {
    const filePath = join(testDir, "world.json");
    await writeFile(filePath, "invalid json", "utf-8");

    const loaded = await store.load();
    expect(loaded).toBeNull();
  });
});
