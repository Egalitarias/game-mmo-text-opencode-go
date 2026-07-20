import { describe, it, expect } from "vitest";
import {
  makeWorld,
  generateZone,
  spawnPlayer,
  spawnMonster,
  resolveAttack,
  respawnPlayer,
  createRng,
} from "../src/index.js";

describe("respawnPlayer", () => {
  it("respawns player at a walkable location", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    const player = spawnPlayer(world, "zone1", "Player", 0)!;
    
    // Move player to a different location
    const oldPos = world.positions.get(player)!;
    world.positions.set(player, { x: 10, y: 10, zone: "zone1" });
    world.occupancy.delete(`${oldPos.zone},${oldPos.x},${oldPos.y}`);
    world.occupancy.set("zone1,10,10", player);
    
    const newPos = respawnPlayer(world, player);
    
    expect(newPos).toBeDefined();
    expect(newPos?.zone).toBe("zone1");
    expect(world.positions.get(player)).toEqual(newPos);
  });

  it("resets player HP to maxHp", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    const player = spawnPlayer(world, "zone1", "Player", 0)!;
    
    // Damage the player
    const stats = world.stats.get(player)!;
    stats.hp = 1;
    
    respawnPlayer(world, player);
    
    expect(world.stats.get(player)?.hp).toBe(stats.maxHp);
  });

  it("updates occupancy index correctly", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    const player = spawnPlayer(world, "zone1", "Player", 0)!;
    const oldPos = world.positions.get(player)!;
    
    const newPos = respawnPlayer(world, player);
    
    // Old position should be cleared
    expect(world.occupancy.get(`${oldPos.zone},${oldPos.x},${oldPos.y}`)).toBeUndefined();
    
    // New position should be occupied
    expect(world.occupancy.get(`${newPos?.zone},${newPos?.x},${newPos?.y}`)).toBe(player);
  });

  it("returns undefined for non-player entities", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    const monster = spawnMonster(world, "zone1", 5, 5, "g", "wander")!;
    
    const result = respawnPlayer(world, monster);
    
    expect(result).toBeUndefined();
  });

  it("returns undefined for non-existent player", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    const result = respawnPlayer(world, 999);
    
    expect(result).toBeUndefined();
  });
});

describe("player death and respawn", () => {
  it("player respawns when killed", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    const attacker = spawnMonster(world, "zone1", 5, 5, "g", "aggressive")!;
    const player = spawnPlayer(world, "zone1", "Player", 0)!;
    
    // Set player HP to 1 so they die in one hit
    world.stats.set(player, { hp: 1, maxHp: 20, attack: 5, defense: 2 });
    world.stats.set(attacker, { hp: 10, maxHp: 10, attack: 100, defense: 1 });
    
    const rng = createRng(1);
    const events = resolveAttack(world, rng, attacker, player);
    
    expect(events.some(e => e.kind === "died")).toBe(true);
    expect(events.some(e => e.kind === "respawned")).toBe(true);
  });

  it("player stays in world.players after respawn", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    const attacker = spawnMonster(world, "zone1", 5, 5, "g", "aggressive")!;
    const player = spawnPlayer(world, "zone1", "Player", 0)!;
    
    world.stats.set(player, { hp: 1, maxHp: 20, attack: 5, defense: 2 });
    world.stats.set(attacker, { hp: 10, maxHp: 10, attack: 100, defense: 1 });
    
    const rng = createRng(1);
    resolveAttack(world, rng, attacker, player);
    
    // Player should still exist in world.players
    expect(world.players.has(player)).toBe(true);
    expect(world.entities.has(player)).toBe(true);
    expect(world.positions.has(player)).toBe(true);
    expect(world.stats.has(player)).toBe(true);
  });

  it("player HP is reset after respawn", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    const attacker = spawnMonster(world, "zone1", 5, 5, "g", "aggressive")!;
    const player = spawnPlayer(world, "zone1", "Player", 0)!;
    
    const maxHp = 20;
    world.stats.set(player, { hp: 1, maxHp, attack: 5, defense: 2 });
    world.stats.set(attacker, { hp: 10, maxHp: 10, attack: 100, defense: 1 });
    
    const rng = createRng(1);
    resolveAttack(world, rng, attacker, player);
    
    expect(world.stats.get(player)?.hp).toBe(maxHp);
  });

  it("player can move after respawn", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    const attacker = spawnMonster(world, "zone1", 5, 5, "g", "aggressive")!;
    const player = spawnPlayer(world, "zone1", "Player", 0)!;
    
    world.stats.set(player, { hp: 1, maxHp: 20, attack: 5, defense: 2 });
    world.stats.set(attacker, { hp: 10, maxHp: 10, attack: 100, defense: 1 });
    
    const rng = createRng(1);
    resolveAttack(world, rng, attacker, player);
    
    // Player should be able to move
    const pos = world.positions.get(player)!;
    expect(pos).toBeDefined();
    expect(pos.x).toBeGreaterThanOrEqual(0);
    expect(pos.y).toBeGreaterThanOrEqual(0);
  });

  it("respawn event includes new position", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    const attacker = spawnMonster(world, "zone1", 5, 5, "g", "aggressive")!;
    const player = spawnPlayer(world, "zone1", "Player", 0)!;
    
    world.stats.set(player, { hp: 1, maxHp: 20, attack: 5, defense: 2 });
    world.stats.set(attacker, { hp: 10, maxHp: 10, attack: 100, defense: 1 });
    
    const rng = createRng(1);
    const events = resolveAttack(world, rng, attacker, player);
    
    const respawnEvent = events.find(e => e.kind === "respawned");
    expect(respawnEvent).toBeDefined();
    if (respawnEvent?.kind === "respawned") {
      expect(respawnEvent.entityId).toBe(player);
      expect(respawnEvent.at).toBeDefined();
      expect(respawnEvent.at.x).toBeGreaterThanOrEqual(0);
      expect(respawnEvent.at.y).toBeGreaterThanOrEqual(0);
      expect(respawnEvent.at.zone).toBe("zone1");
    }
  });
});

describe("monster death", () => {
  it("monsters are removed when killed (no respawn)", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    const player = spawnPlayer(world, "zone1", "Player", 0)!;
    const monster = spawnMonster(world, "zone1", 5, 5, "g", "wander")!;
    
    world.stats.set(monster, { hp: 1, maxHp: 10, attack: 3, defense: 1 });
    world.stats.set(player, { hp: 20, maxHp: 20, attack: 100, defense: 2 });
    
    const rng = createRng(1);
    const events = resolveAttack(world, rng, player, monster);
    
    expect(events.some(e => e.kind === "died")).toBe(true);
    expect(events.some(e => e.kind === "respawned")).toBe(false);
    
    // Monster should be completely removed
    expect(world.entities.has(monster)).toBe(false);
    expect(world.positions.has(monster)).toBe(false);
    expect(world.stats.has(monster)).toBe(false);
    expect(world.ais.has(monster)).toBe(false);
  });

  it("monster death does not affect player", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    const player = spawnPlayer(world, "zone1", "Player", 0)!;
    const monster = spawnMonster(world, "zone1", 5, 5, "g", "wander")!;
    
    world.stats.set(monster, { hp: 1, maxHp: 10, attack: 3, defense: 1 });
    world.stats.set(player, { hp: 20, maxHp: 20, attack: 100, defense: 2 });
    
    const rng = createRng(1);
    resolveAttack(world, rng, player, monster);
    
    // Player should be unaffected
    expect(world.players.has(player)).toBe(true);
    expect(world.entities.has(player)).toBe(true);
  });
});
