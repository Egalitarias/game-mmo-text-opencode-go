import { describe, it, expect } from "vitest";
import {
  makeWorld,
  generateZone,
  spawnPlayer,
  spawnMonster,
  resolveAttack,
  tryMove,
  createRng,
} from "../src/index.js";

describe("resolveAttack", () => {
  it("calculates damage based on attack and defense stats", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    const attacker = spawnPlayer(world, "zone1", "Attacker", 0)!;
    const target = spawnMonster(world, "zone1", 5, 5, "g", "wander")!;
    
    // Set specific stats for predictable damage
    world.stats.set(attacker, { hp: 20, maxHp: 20, attack: 10, defense: 2 });
    world.stats.set(target, { hp: 20, maxHp: 20, attack: 5, defense: 3 });
    
    const rng = createRng(1);
    const events = resolveAttack(world, rng, attacker, target);
    
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]?.kind).toBe("attacked");
    if (events[0]?.kind === "attacked") {
      expect(events[0].attackerId).toBe(attacker);
      expect(events[0].targetId).toBe(target);
      expect(events[0].damage).toBeGreaterThanOrEqual(1);
    }
  });

  it("applies damage to target's HP", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    const attacker = spawnPlayer(world, "zone1", "Attacker", 0)!;
    const target = spawnMonster(world, "zone1", 5, 5, "g", "wander")!;
    
    world.stats.set(attacker, { hp: 20, maxHp: 20, attack: 10, defense: 2 });
    world.stats.set(target, { hp: 20, maxHp: 20, attack: 5, defense: 3 });
    
    const initialHp = world.stats.get(target)!.hp;
    const rng = createRng(1);
    const events = resolveAttack(world, rng, attacker, target);
    
    const damage = events[0]?.kind === "attacked" ? events[0].damage : 0;
    expect(world.stats.get(target)!.hp).toBe(initialHp - damage);
  });

  it("returns death event when target HP reaches 0", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    const attacker = spawnPlayer(world, "zone1", "Attacker", 0)!;
    const target = spawnMonster(world, "zone1", 5, 5, "g", "wander")!;
    
    world.stats.set(attacker, { hp: 20, maxHp: 20, attack: 100, defense: 2 });
    world.stats.set(target, { hp: 5, maxHp: 20, attack: 5, defense: 3 });
    
    const rng = createRng(1);
    const events = resolveAttack(world, rng, attacker, target);
    
    expect(events.some(e => e.kind === "died")).toBe(true);
    expect(world.entities.has(target)).toBe(false);
    expect(world.positions.has(target)).toBe(false);
  });

  it("removes dead entity from world", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    const attacker = spawnPlayer(world, "zone1", "Attacker", 0)!;
    const target = spawnMonster(world, "zone1", 5, 5, "g", "wander")!;
    
    world.stats.set(attacker, { hp: 20, maxHp: 20, attack: 100, defense: 2 });
    world.stats.set(target, { hp: 1, maxHp: 20, attack: 5, defense: 3 });
    
    const rng = createRng(1);
    resolveAttack(world, rng, attacker, target);
    
    expect(world.entities.has(target)).toBe(false);
    expect(world.positions.has(target)).toBe(false);
    expect(world.stats.has(target)).toBe(false);
    expect(world.ais.has(target)).toBe(false);
  });

  it("minimum damage is 1 even with high defense", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    const attacker = spawnPlayer(world, "zone1", "Attacker", 0)!;
    const target = spawnMonster(world, "zone1", 5, 5, "g", "wander")!;
    
    world.stats.set(attacker, { hp: 20, maxHp: 20, attack: 1, defense: 2 });
    world.stats.set(target, { hp: 20, maxHp: 20, attack: 5, defense: 100 });
    
    const rng = createRng(1);
    const events = resolveAttack(world, rng, attacker, target);
    
    expect(events[0]?.kind).toBe("attacked");
    if (events[0]?.kind === "attacked") {
      expect(events[0].damage).toBeGreaterThanOrEqual(1);
    }
  });

  it("returns empty array if attacker has no stats", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    const attacker = spawnPlayer(world, "zone1", "Attacker", 0)!;
    const target = spawnMonster(world, "zone1", 5, 5, "g", "wander")!;
    
    world.stats.delete(attacker);
    
    const rng = createRng(1);
    const events = resolveAttack(world, rng, attacker, target);
    
    expect(events).toEqual([]);
  });

  it("returns empty array if target has no stats", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    const attacker = spawnPlayer(world, "zone1", "Attacker", 0)!;
    const target = spawnMonster(world, "zone1", 5, 5, "g", "wander")!;
    
    world.stats.delete(target);
    
    const rng = createRng(1);
    const events = resolveAttack(world, rng, attacker, target);
    
    expect(events).toEqual([]);
  });
});

describe("tryMove with combat", () => {
  it("attacks entity when moving into it", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    const player = spawnPlayer(world, "zone1", "Player", 0)!;
    spawnMonster(world, "zone1", 5, 5, "g", "wander")!;
    
    // Move player next to monster
    const playerPos = world.positions.get(player)!;
    world.positions.set(player, { x: 4, y: 5, zone: "zone1" });
    world.occupancy.delete(`${playerPos.zone},${playerPos.x},${playerPos.y}`);
    world.occupancy.set("zone1,4,5", player);
    
    const rng = createRng(1);
    const events = tryMove(world, rng, player, 1, 0);
    
    expect(events.some(e => e.kind === "attacked")).toBe(true);
  });

  it("does not move when attacking", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    const player = spawnPlayer(world, "zone1", "Player", 0)!;
    spawnMonster(world, "zone1", 5, 5, "g", "wander")!;
    
    // Move player next to monster
    const playerPos = world.positions.get(player)!;
    world.positions.set(player, { x: 4, y: 5, zone: "zone1" });
    world.occupancy.delete(`${playerPos.zone},${playerPos.x},${playerPos.y}`);
    world.occupancy.set("zone1,4,5", player);
    
    const rng = createRng(1);
    tryMove(world, rng, player, 1, 0);
    
    // Player should still be at (4, 5)
    expect(world.positions.get(player)).toEqual({ x: 4, y: 5, zone: "zone1" });
  });

  it("can move into tile after killing monster", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    const player = spawnPlayer(world, "zone1", "Player", 0)!;
    const monster = spawnMonster(world, "zone1", 5, 5, "g", "wander")!;
    
    // Move player next to monster
    const playerPos = world.positions.get(player)!;
    world.positions.set(player, { x: 4, y: 5, zone: "zone1" });
    world.occupancy.delete(`${playerPos.zone},${playerPos.x},${playerPos.y}`);
    world.occupancy.set("zone1,4,5", player);
    
    // Set monster HP to 1 so it dies in one hit
    world.stats.set(monster, { hp: 1, maxHp: 1, attack: 3, defense: 1 });
    world.stats.set(player, { hp: 20, maxHp: 20, attack: 10, defense: 2 });
    
    const rng = createRng(1);
    const events1 = tryMove(world, rng, player, 1, 0);
    
    expect(events1.some(e => e.kind === "died")).toBe(true);
    
    // Now player can move into the tile
    const events2 = tryMove(world, rng, player, 1, 0);
    expect(events2.some(e => e.kind === "moved")).toBe(true);
  });

  it("monsters can attack players", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    const player = spawnPlayer(world, "zone1", "Player", 0)!;
    const monster = spawnMonster(world, "zone1", 5, 5, "g", "aggressive")!;
    
    // Move monster next to player
    const monsterPos = world.positions.get(monster)!;
    world.positions.set(monster, { x: 4, y: 5, zone: "zone1" });
    world.occupancy.delete(`${monsterPos.zone},${monsterPos.x},${monsterPos.y}`);
    world.occupancy.set("zone1,4,5", monster);
    
    // Move player to (5, 5)
    const playerPos = world.positions.get(player)!;
    world.positions.set(player, { x: 5, y: 5, zone: "zone1" });
    world.occupancy.delete(`${playerPos.zone},${playerPos.x},${playerPos.y}`);
    world.occupancy.set("zone1,5,5", player);
    
    const rng = createRng(1);
    const events = tryMove(world, rng, monster, 1, 0);
    
    expect(events.some(e => e.kind === "attacked")).toBe(true);
    if (events[0]?.kind === "attacked") {
      expect(events[0].attackerId).toBe(monster);
      expect(events[0].targetId).toBe(player);
    }
  });
});

describe("player and monster stats", () => {
  it("players spawn with default stats", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    const player = spawnPlayer(world, "zone1", "Player", 0)!;
    const stats = world.stats.get(player);
    
    expect(stats).toBeDefined();
    expect(stats?.hp).toBe(20);
    expect(stats?.maxHp).toBe(20);
    expect(stats?.attack).toBe(5);
    expect(stats?.defense).toBe(2);
  });

  it("monsters spawn with default stats", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    const monster = spawnMonster(world, "zone1", 5, 5, "g", "wander")!;
    const stats = world.stats.get(monster);
    
    expect(stats).toBeDefined();
    expect(stats?.hp).toBe(10);
    expect(stats?.maxHp).toBe(10);
    expect(stats?.attack).toBe(3);
    expect(stats?.defense).toBe(1);
  });

  it("monsters can spawn with custom stats", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    const monster = spawnMonster(
      world,
      "zone1",
      5,
      5,
      "G",
      "aggressive",
      100,
      { hp: 50, maxHp: 50, attack: 15, defense: 5 }
    )!;
    const stats = world.stats.get(monster);
    
    expect(stats).toBeDefined();
    expect(stats?.hp).toBe(50);
    expect(stats?.maxHp).toBe(50);
    expect(stats?.attack).toBe(15);
    expect(stats?.defense).toBe(5);
  });
});
