import { describe, it, expect } from "vitest";
import { computeFov, makeWorld, generateZone, spawnPlayer } from "../src/index.js";

describe("computeFov", () => {
  it("entity always sees itself", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    const entityId = spawnPlayer(world, "zone1", "TestPlayer", 0)!;
    
    const visible = computeFov(world, entityId);
    const pos = world.positions.get(entityId)!;
    
    expect(visible.has(`${pos.x},${pos.y}`)).toBe(true);
  });

  it("returns empty set for non-existent entity", () => {
    const world = makeWorld();
    const visible = computeFov(world, 999);
    expect(visible.size).toBe(0);
  });

  it("sees tiles in open area within radius", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    const entityId = spawnPlayer(world, "zone1", "TestPlayer", 0)!;
    
    const visible = computeFov(world, entityId, 5);
    
    // Should see more than just self in open area
    expect(visible.size).toBeGreaterThan(1);
  });

  it("respects radius limit", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 30, 30, 12345);
    world.zones.set("zone1", zone);
    const entityId = spawnPlayer(world, "zone1", "TestPlayer", 0)!;
    
    const visible3 = computeFov(world, entityId, 3);
    const visible10 = computeFov(world, entityId, 10);
    
    // Larger radius should see more tiles
    expect(visible10.size).toBeGreaterThan(visible3.size);
  });

  it("walls block visibility", () => {
    const world = makeWorld();
    // Create a small zone with a wall in the middle
    const zone = generateZone("zone1", 10, 10, 1);
    world.zones.set("zone1", zone);
    
    // Manually create a wall pattern
    const tiles = zone.tiles;
    // Clear all to floor first
    for (let i = 0; i < tiles.length; i++) {
      tiles[i] = "floor";
    }
    // Add walls on borders
    for (let x = 0; x < 10; x++) {
      tiles[x] = "wall"; // top
      tiles[90 + x] = "wall"; // bottom
    }
    for (let y = 0; y < 10; y++) {
      tiles[y * 10] = "wall"; // left
      tiles[y * 10 + 9] = "wall"; // right
    }
    // Add a wall in the middle
    tiles[5 * 10 + 5] = "wall";
    
    const entityId = spawnPlayer(world, "zone1", "TestPlayer", 0)!;
    const pos = world.positions.get(entityId)!;
    
    const visible = computeFov(world, entityId, 10);
    
    // Entity should see itself
    expect(visible.has(`${pos.x},${pos.y}`)).toBe(true);
    
    // Should see some tiles but not all (walls block)
    expect(visible.size).toBeGreaterThan(1);
    expect(visible.size).toBeLessThan(100); // Can't see entire map
  });

  it("FOV is symmetric - if A sees B, B sees A", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 20, 20, 12345);
    world.zones.set("zone1", zone);
    
    // Spawn two players
    const player1 = spawnPlayer(world, "zone1", "Player1", 0)!;
    const player2 = spawnPlayer(world, "zone1", "Player2", 0)!;
    
    const pos1 = world.positions.get(player1)!;
    const pos2 = world.positions.get(player2)!;
    
    const fov1 = computeFov(world, player1, 20);
    const fov2 = computeFov(world, player2, 20);
    
    const p1SeesP2 = fov1.has(`${pos2.x},${pos2.y}`);
    const p2SeesP1 = fov2.has(`${pos1.x},${pos1.y}`);
    
    // Both should see each other or neither should
    expect(p1SeesP2).toBe(p2SeesP1);
  });

  it("handles entity at map boundaries", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 10, 10, 12345);
    world.zones.set("zone1", zone);
    
    // Manually place entity near corner
    const entityId = world.nextEntityId++;
    world.entities.set(entityId, { id: entityId, glyph: "@" });
    world.positions.set(entityId, { x: 1, y: 1, zone: "zone1" });
    world.players.set(entityId, { handle: "Corner", connectedAt: 0 });
    
    const visible = computeFov(world, entityId, 5);
    
    // Should still compute FOV without errors
    expect(visible.size).toBeGreaterThan(0);
    expect(visible.has("1,1")).toBe(true);
  });

  it("default radius is 10", () => {
    const world = makeWorld();
    const zone = generateZone("zone1", 30, 30, 12345);
    world.zones.set("zone1", zone);
    const entityId = spawnPlayer(world, "zone1", "TestPlayer", 0)!;
    
    const visibleDefault = computeFov(world, entityId);
    const visibleExplicit = computeFov(world, entityId, 10);
    
    expect(visibleDefault.size).toBe(visibleExplicit.size);
  });
});
