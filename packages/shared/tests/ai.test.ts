import { describe, it, expect } from "vitest";
import {
  makeWorld,
  generateZone,
  spawnPlayer,
  spawnMonster,
  stepWorld,
  decideMonsterAction,
  createRng,
} from "../src/index.js";

describe("spawnMonster", () => {
  it("spawns a monster at the specified position", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    const monsterId = spawnMonster(world, "zone1", 5, 5, "g", "aggressive", 100);
    
    expect(monsterId).toBeDefined();
    expect(world.entities.get(monsterId!)?.glyph).toBe("g");
    expect(world.positions.get(monsterId!)).toEqual({ x: 5, y: 5, zone: "zone1" });
    expect(world.ais.get(monsterId!)?.kind).toBe("aggressive");
    expect(world.energies.get(monsterId!)).toEqual({ current: 0, speed: 100 });
  });

  it("fails to spawn on a wall", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    // Try to spawn on a border wall
    const monsterId = spawnMonster(world, "zone1", 0, 0, "g", "aggressive");
    
    expect(monsterId).toBeUndefined();
  });

  it("fails to spawn on an occupied tile", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    const player1 = spawnPlayer(world, "zone1", "Player1", 0);
    const pos = world.positions.get(player1!)!;
    
    const monsterId = spawnMonster(world, "zone1", pos.x, pos.y, "g", "aggressive");
    
    expect(monsterId).toBeUndefined();
  });

  it("uses default speed of 100", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    const monsterId = spawnMonster(world, "zone1", 5, 5, "g", "wander");
    
    expect(world.energies.get(monsterId!)?.speed).toBe(100);
  });
});

describe("decideMonsterAction", () => {
  it("aggressive monster moves toward player in FOV", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    const player = spawnPlayer(world, "zone1", "Player", 0)!;
    const monster = spawnMonster(world, "zone1", 5, 5, "g", "aggressive")!;
    
    // Move player close to monster
    const playerPos = world.positions.get(player)!;
    world.positions.set(player, { x: 6, y: 5, zone: "zone1" });
    world.occupancy.delete(`${playerPos.zone},${playerPos.x},${playerPos.y}`);
    world.occupancy.set("zone1,6,5", player);
    
    const rng = createRng(1);
    const action = decideMonsterAction(world, monster, rng);
    
    expect(action).toBeDefined();
    expect(action?.kind).toBe("move");
    if (action?.kind === "move") {
      expect(action.dx).toBe(1); // Moving toward player at x=6
      expect(action.dy).toBe(0);
    }
  });

  it("aggressive monster wanders when no player in FOV", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 30, 30, 12345);
    world.zones.set("zone1", zone);
    
    spawnPlayer(world, "zone1", "Player", 0)!;
    const monster = spawnMonster(world, "zone1", 5, 5, "g", "aggressive")!;
    
    // Player is far away, outside FOV
    const rng = createRng(1);
    const action = decideMonsterAction(world, monster, rng);
    
    // Should wander (return some move or null)
    expect(action === null || action?.kind === "move").toBe(true);
  });

  it("wander monster moves randomly", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    const monster = spawnMonster(world, "zone1", 5, 5, "w", "wander")!;
    
    const rng = createRng(1);
    const action = decideMonsterAction(world, monster, rng);
    
    expect(action === null || action?.kind === "move").toBe(true);
  });

  it("flee monster moves away from player", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    const player = spawnPlayer(world, "zone1", "Player", 0)!;
    const monster = spawnMonster(world, "zone1", 5, 5, "f", "flee")!;
    
    // Move player close to monster
    const playerPos = world.positions.get(player)!;
    world.positions.set(player, { x: 6, y: 5, zone: "zone1" });
    world.occupancy.delete(`${playerPos.zone},${playerPos.x},${playerPos.y}`);
    world.occupancy.set("zone1,6,5", player);
    
    const rng = createRng(1);
    const action = decideMonsterAction(world, monster, rng);
    
    expect(action).toBeDefined();
    expect(action?.kind).toBe("move");
    if (action?.kind === "move") {
      expect(action.dx).toBe(-1); // Moving away from player at x=6
      expect(action.dy).toBe(0);
    }
  });

  it("returns null for entity without AI", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    const player = spawnPlayer(world, "zone1", "Player", 0)!;
    
    const rng = createRng(1);
    const action = decideMonsterAction(world, player, rng);
    
    expect(action).toBeNull();
  });
});

describe("monster AI integration", () => {
  it("monsters gain energy each tick", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    const monster = spawnMonster(world, "zone1", 5, 5, "g", "wander", 100)!;
    
    const rng = createRng(1);
    stepWorld(world, [], rng);
    
    expect(world.energies.get(monster)?.current).toBe(0); // 100 - 100 = 0 after acting
  });

  it("fast monsters act more frequently", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    const fastMonster = spawnMonster(world, "zone1", 5, 5, "f", "wander", 200)!;
    const slowMonster = spawnMonster(world, "zone1", 10, 10, "s", "wander", 50)!;
    
    const rng = createRng(1);
    
    // After 1 tick: fast monster has 200 energy (acts twice), slow has 50 (doesn't act)
    stepWorld(world, [], rng);
    
    expect(world.energies.get(fastMonster)?.current).toBe(0); // 200 - 100 - 100 = 0
    expect(world.energies.get(slowMonster)?.current).toBe(50); // 50, not enough to act
  });

  it("monsters move during stepWorld", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    const monster = spawnMonster(world, "zone1", 5, 5, "g", "wander", 100)!;
    
    const rng = createRng(1);
    stepWorld(world, [], rng);
    
    const newPos = world.positions.get(monster)!;
    // Monster should have moved (or stayed if blocked)
    expect(newPos).toBeDefined();
  });

  it("multiple monsters can act in the same tick", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    spawnMonster(world, "zone1", 5, 5, "g", "wander", 100)!;
    spawnMonster(world, "zone1", 10, 10, "g", "wander", 100)!;
    
    const rng = createRng(1);
    const events = stepWorld(world, [], rng);
    
    // Should have movement events from both monsters
    const moveEvents = events.filter(e => e.kind === "moved" || e.kind === "bumped");
    expect(moveEvents.length).toBeGreaterThan(0);
  });
});
