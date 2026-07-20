import { describe, it, expect } from "vitest";
import {
  makeWorld,
  generateZone,
  spawnPlayer,
  spawnItem,
  pickupItem,
  dropItem,
  stepWorld,
  createRng,
} from "../src/index.js";
import type { Item } from "../src/index.js";

describe("spawnItem", () => {
  it("spawns an item at the specified position", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    const item: Item = { kind: "potion", name: "Health Potion", value: 10 };
    const itemId = spawnItem(world, "zone1", 5, 5, item);
    
    expect(itemId).toBeDefined();
    expect(world.entities.get(itemId!)?.glyph).toBe("!");
    expect(world.positions.get(itemId!)).toEqual({ x: 5, y: 5, zone: "zone1" });
    expect(world.items.get(itemId!)).toEqual(item);
  });

  it("fails to spawn on a wall", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    const item: Item = { kind: "potion", name: "Health Potion", value: 10 };
    const itemId = spawnItem(world, "zone1", 0, 0, item);
    
    expect(itemId).toBeUndefined();
  });

  it("fails to spawn on an occupied tile", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    const player = spawnPlayer(world, "zone1", "Player", 0)!;
    const pos = world.positions.get(player)!;
    
    const item: Item = { kind: "potion", name: "Health Potion", value: 10 };
    const itemId = spawnItem(world, "zone1", pos.x, pos.y, item);
    
    expect(itemId).toBeUndefined();
  });

  it("uses correct glyphs for different item types", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    const potion = spawnItem(world, "zone1", 5, 5, { kind: "potion", name: "Potion" });
    const sword = spawnItem(world, "zone1", 6, 5, { kind: "sword", name: "Sword" });
    const shield = spawnItem(world, "zone1", 7, 5, { kind: "shield", name: "Shield" });
    const gold = spawnItem(world, "zone1", 8, 5, { kind: "gold", name: "Gold" });
    
    expect(world.entities.get(potion!)?.glyph).toBe("!");
    expect(world.entities.get(sword!)?.glyph).toBe("/");
    expect(world.entities.get(shield!)?.glyph).toBe("]");
    expect(world.entities.get(gold!)?.glyph).toBe("$");
  });
});

describe("pickupItem", () => {
  it("picks up an item from the player's position", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    const player = spawnPlayer(world, "zone1", "Player", 0)!;
    const playerPos = world.positions.get(player)!;
    
    // Spawn item at a different position
    const item: Item = { kind: "potion", name: "Health Potion", value: 10 };
    const itemX = playerPos.x + 1;
    const itemY = playerPos.y;
    const itemId = spawnItem(world, "zone1", itemX, itemY, item)!;
    
    // Move player to item position
    world.occupancy.delete(`${playerPos.zone},${playerPos.x},${playerPos.y}`);
    world.positions.set(player, { x: itemX, y: itemY, zone: "zone1" });
    world.occupancy.set(`${playerPos.zone},${itemX},${itemY}`, player);
    
    const events = pickupItem(world, player);
    
    expect(events.length).toBe(1);
    expect(events[0]?.kind).toBe("pickedUp");
    if (events[0]?.kind === "pickedUp") {
      expect(events[0].entityId).toBe(player);
      expect(events[0].item).toEqual(item);
    }
    
    // Item should be removed from world
    expect(world.entities.has(itemId)).toBe(false);
    expect(world.positions.has(itemId)).toBe(false);
    expect(world.items.has(itemId)).toBe(false);
    
    // Item should be in player's inventory
    const inventory = world.inventories.get(player);
    expect(inventory?.items).toContainEqual(item);
  });

  it("fails when no item at player's position", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    const player = spawnPlayer(world, "zone1", "Player", 0)!;
    
    const events = pickupItem(world, player);
    
    expect(events).toEqual([]);
  });

  it("fails when inventory is full", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    const player = spawnPlayer(world, "zone1", "Player", 0)!;
    const pos = world.positions.get(player)!;
    
    // Fill inventory
    const inventory = world.inventories.get(player)!;
    for (let i = 0; i < inventory.maxSize; i++) {
      inventory.items.push({ kind: "gold", name: "Gold" });
    }
    
    const item: Item = { kind: "potion", name: "Health Potion", value: 10 };
    spawnItem(world, "zone1", pos.x, pos.y, item)!;
    
    // Move player to item position
    world.occupancy.delete(`${pos.zone},${pos.x},${pos.y}`);
    world.positions.set(player, { x: pos.x, y: pos.y, zone: "zone1" });
    world.occupancy.set(`${pos.zone},${pos.x},${pos.y}`, player);
    
    const events = pickupItem(world, player);
    
    expect(events).toEqual([]);
    expect(inventory.items.length).toBe(inventory.maxSize);
  });

  it("fails for entity without inventory", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    const player = spawnPlayer(world, "zone1", "Player", 0)!;
    world.inventories.delete(player);
    
    const events = pickupItem(world, player);
    
    expect(events).toEqual([]);
  });
});

describe("dropItem", () => {
  it("drops an item from inventory at player's position", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    const player = spawnPlayer(world, "zone1", "Player", 0)!;
    const pos = world.positions.get(player)!;
    
    const item: Item = { kind: "potion", name: "Health Potion", value: 10 };
    const inventory = world.inventories.get(player)!;
    inventory.items.push(item);
    
    const events = dropItem(world, player, 0);
    
    expect(events.length).toBe(1);
    expect(events[0]?.kind).toBe("dropped");
    if (events[0]?.kind === "dropped") {
      expect(events[0].entityId).toBe(player);
      expect(events[0].item).toEqual(item);
      expect(events[0].at).toEqual(pos);
    }
    
    // Item should be removed from inventory
    expect(inventory.items.length).toBe(0);
    
    // Item should exist in world
    const itemId = world.items.keys().next().value;
    expect(itemId).toBeDefined();
    expect(world.items.get(itemId!)).toEqual(item);
    expect(world.positions.get(itemId!)).toEqual(pos);
  });

  it("fails with invalid slot index", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    const player = spawnPlayer(world, "zone1", "Player", 0)!;
    
    const events = dropItem(world, player, 0);
    
    expect(events).toEqual([]);
  });

  it("fails with negative slot index", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    const player = spawnPlayer(world, "zone1", "Player", 0)!;
    const inventory = world.inventories.get(player)!;
    inventory.items.push({ kind: "potion", name: "Potion" });
    
    const events = dropItem(world, player, -1);
    
    expect(events).toEqual([]);
  });

  it("fails when position is occupied by another entity", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    const player = spawnPlayer(world, "zone1", "Player", 0)!;
    const pos = world.positions.get(player)!;
    
    // Spawn another entity at player's position (this shouldn't happen normally, but test edge case)
    const other = spawnPlayer(world, "zone1", "Other", 0)!;
    world.positions.set(other, { ...pos });
    world.occupancy.set(`${pos.zone},${pos.x},${pos.y}`, other);
    
    const inventory = world.inventories.get(player)!;
    inventory.items.push({ kind: "potion", name: "Potion" });
    
    const events = dropItem(world, player, 0);
    
    expect(events).toEqual([]);
  });

  it("drops correct item from middle of inventory", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    const player = spawnPlayer(world, "zone1", "Player", 0)!;
    
    const inventory = world.inventories.get(player)!;
    inventory.items.push({ kind: "potion", name: "Potion 1" });
    inventory.items.push({ kind: "sword", name: "Sword" });
    inventory.items.push({ kind: "potion", name: "Potion 2" });
    
    const events = dropItem(world, player, 1);
    
    expect(events.length).toBe(1);
    if (events[0]?.kind === "dropped") {
      expect(events[0].item.name).toBe("Sword");
    }
    
    expect(inventory.items.length).toBe(2);
    expect(inventory.items[0]?.name).toBe("Potion 1");
    expect(inventory.items[1]?.name).toBe("Potion 2");
  });
});

describe("inventory integration with stepWorld", () => {
  it("pickup command works through stepWorld", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    const player = spawnPlayer(world, "zone1", "Player", 0)!;
    const playerPos = world.positions.get(player)!;
    
    // Spawn item at a different position
    const item: Item = { kind: "potion", name: "Health Potion", value: 10 };
    const itemX = playerPos.x + 1;
    const itemY = playerPos.y;
    spawnItem(world, "zone1", itemX, itemY, item)!;
    
    // Move player to item position
    world.occupancy.delete(`${playerPos.zone},${playerPos.x},${playerPos.y}`);
    world.positions.set(player, { x: itemX, y: itemY, zone: "zone1" });
    world.occupancy.set(`${playerPos.zone},${itemX},${itemY}`, player);
    
    const rng = createRng(1);
    const events = stepWorld(world, [{ entityId: player, cmd: { kind: "pickup" } }], rng);
    
    expect(events.some(e => e.kind === "pickedUp")).toBe(true);
  });

  it("drop command works through stepWorld", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    const player = spawnPlayer(world, "zone1", "Player", 0)!;
    
    const inventory = world.inventories.get(player)!;
    inventory.items.push({ kind: "potion", name: "Health Potion", value: 10 });
    
    const rng = createRng(1);
    const events = stepWorld(world, [{ entityId: player, cmd: { kind: "drop", slot: 0 } }], rng);
    
    expect(events.some(e => e.kind === "dropped")).toBe(true);
  });
});

describe("player inventory initialization", () => {
  it("players spawn with empty inventory", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    const player = spawnPlayer(world, "zone1", "Player", 0)!;
    const inventory = world.inventories.get(player);
    
    expect(inventory).toBeDefined();
    expect(inventory?.items).toEqual([]);
    expect(inventory?.maxSize).toBe(10);
  });
});
