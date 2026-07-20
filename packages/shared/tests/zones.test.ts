import { describe, it, expect } from "vitest";
import {
  makeWorld,
  generateZone,
  spawnPlayer,
  tryMove,
  createRng,
  transitionZone,
  tileAt,
} from "../src/index.js";
import type { Zone, Tile } from "../src/index.js";

describe("zone transitions", () => {
  it("stairs_up and stairs_down tiles are walkable", () => {
    const world = makeWorld();
    const zone: Zone = {
      id: "test",
      width: 5,
      height: 5,
      tiles: [
        "wall", "wall", "wall", "wall", "wall",
        "wall", "floor", "stairs_up", "stairs_down", "wall",
        "wall", "wall", "wall", "wall", "wall",
        "wall", "wall", "wall", "wall", "wall",
        "wall", "wall", "wall", "wall", "wall",
      ],
    };
    world.zones.set("test", zone);

    expect(tileAt(zone, 2, 1)).toBe("stairs_up");
    expect(tileAt(zone, 3, 1)).toBe("stairs_down");
  });

  it("transitionZone moves entity to target zone", () => {
    const world = makeWorld();
    const zone1 = generateZone("zone1", 10, 10, 1);
    const zone2 = generateZone("zone2", 10, 10, 2);
    world.zones.set("zone1", zone1);
    world.zones.set("zone2", zone2);

    const player = spawnPlayer(world, "zone1", "Player", 0)!;
    const oldPos = world.positions.get(player)!;

    const newPos = transitionZone(world, player, "zone2", 5, 5);

    expect(newPos).toBeDefined();
    expect(newPos?.zone).toBe("zone2");
    expect(newPos?.x).toBe(5);
    expect(newPos?.y).toBe(5);
    expect(world.positions.get(player)).toEqual(newPos);
    
    // Old position should be cleared from occupancy
    expect(world.occupancy.get(`${oldPos.zone},${oldPos.x},${oldPos.y}`)).toBeUndefined();
    
    // New position should be occupied
    expect(world.occupancy.get(`${newPos?.zone},${newPos?.x},${newPos?.y}`)).toBe(player);
  });

  it("transitionZone fails if target position is occupied", () => {
    const world = makeWorld();
    const zone1 = generateZone("zone1", 10, 10, 1);
    const zone2 = generateZone("zone2", 10, 10, 2);
    world.zones.set("zone1", zone1);
    world.zones.set("zone2", zone2);

    const player1 = spawnPlayer(world, "zone1", "Player1", 0)!;
    const player2 = spawnPlayer(world, "zone2", "Player2", 0)!;
    
    // Move player2 to (5, 5)
    const pos2 = world.positions.get(player2)!;
    world.positions.set(player2, { x: 5, y: 5, zone: "zone2" });
    world.occupancy.delete(`${pos2.zone},${pos2.x},${pos2.y}`);
    world.occupancy.set("zone2,5,5", player2);

    const newPos = transitionZone(world, player1, "zone2", 5, 5);

    expect(newPos).toBeUndefined();
    expect(world.positions.get(player1)?.zone).toBe("zone1");
  });

  it("transitionZone fails if target position is a wall", () => {
    const world = makeWorld();
    const zone1 = generateZone("zone1", 10, 10, 1);
    const zone2 = generateZone("zone2", 10, 10, 2);
    world.zones.set("zone1", zone1);
    world.zones.set("zone2", zone2);

    const player = spawnPlayer(world, "zone1", "Player", 0)!;

    // Try to transition to a wall (border)
    const newPos = transitionZone(world, player, "zone2", 0, 0);

    expect(newPos).toBeUndefined();
    expect(world.positions.get(player)?.zone).toBe("zone1");
  });

  it("moving onto stairs triggers zone transition", () => {
    const world = makeWorld();
    const tiles1: Tile[] = new Array(100).fill("floor") as Tile[];
    const tiles2: Tile[] = new Array(100).fill("floor") as Tile[];
    const zone1: Zone = {
      id: "zone1",
      width: 10,
      height: 10,
      tiles: tiles1,
      connections: new Map(),
    };
    const zone2: Zone = {
      id: "zone2",
      width: 10,
      height: 10,
      tiles: tiles2,
      connections: new Map(),
    };
    
    // Add walls around borders
    for (let i = 0; i < 10; i++) {
      zone1.tiles[i] = "wall"; // top
      zone1.tiles[90 + i] = "wall"; // bottom
      zone1.tiles[i * 10] = "wall"; // left
      zone1.tiles[i * 10 + 9] = "wall"; // right
      
      zone2.tiles[i] = "wall";
      zone2.tiles[90 + i] = "wall";
      zone2.tiles[i * 10] = "wall";
      zone2.tiles[i * 10 + 9] = "wall";
    }
    
    // Add stairs at (5, 5) in zone1
    zone1.tiles[5 * 10 + 5] = "stairs_down";
    if (zone1.connections) {
      zone1.connections.set("5,5", {
        targetZone: "zone2",
        targetX: 3,
        targetY: 3,
      });
    }
    
    world.zones.set("zone1", zone1);
    world.zones.set("zone2", zone2);

    const player = spawnPlayer(world, "zone1", "Player", 0)!;
    
    // Move player to (4, 5)
    const pos = world.positions.get(player)!;
    world.positions.set(player, { x: 4, y: 5, zone: "zone1" });
    world.occupancy.delete(`${pos.zone},${pos.x},${pos.y}`);
    world.occupancy.set("zone1,4,5", player);

    const rng = createRng(1);
    const events = tryMove(world, rng, player, 1, 0);

    // Should have both moved and zone_changed events
    expect(events.some(e => e.kind === "moved")).toBe(true);
    expect(events.some(e => e.kind === "zone_changed")).toBe(true);
    
    const zoneChangedEvent = events.find(e => e.kind === "zone_changed");
    if (zoneChangedEvent?.kind === "zone_changed") {
      expect(zoneChangedEvent.from.zone).toBe("zone1");
      expect(zoneChangedEvent.to.zone).toBe("zone2");
      expect(zoneChangedEvent.to.x).toBe(3);
      expect(zoneChangedEvent.to.y).toBe(3);
    }
    
    // Player should now be in zone2
    expect(world.positions.get(player)?.zone).toBe("zone2");
  });

  it("stairs without connections do not trigger transition", () => {
    const world = makeWorld();
    const tiles: Tile[] = new Array(100).fill("floor") as Tile[];
    const zone1: Zone = {
      id: "zone1",
      width: 10,
      height: 10,
      tiles: tiles,
    };
    
    // Add walls around borders
    for (let i = 0; i < 10; i++) {
      zone1.tiles[i] = "wall";
      zone1.tiles[90 + i] = "wall";
      zone1.tiles[i * 10] = "wall";
      zone1.tiles[i * 10 + 9] = "wall";
    }
    
    // Add stairs without connection
    zone1.tiles[5 * 10 + 5] = "stairs_down";
    
    world.zones.set("zone1", zone1);

    const player = spawnPlayer(world, "zone1", "Player", 0)!;
    
    // Move player to (4, 5)
    const pos = world.positions.get(player)!;
    world.positions.set(player, { x: 4, y: 5, zone: "zone1" });
    world.occupancy.delete(`${pos.zone},${pos.x},${pos.y}`);
    world.occupancy.set("zone1,4,5", player);

    const rng = createRng(1);
    const events = tryMove(world, rng, player, 1, 0);

    // Should only have moved event, no zone_changed
    expect(events.some(e => e.kind === "moved")).toBe(true);
    expect(events.some(e => e.kind === "zone_changed")).toBe(false);
    
    // Player should still be in zone1
    expect(world.positions.get(player)?.zone).toBe("zone1");
  });

  it("bidirectional stairs work both ways", () => {
    const world = makeWorld();
    const tiles1: Tile[] = new Array(100).fill("floor") as Tile[];
    const tiles2: Tile[] = new Array(100).fill("floor") as Tile[];
    const zone1: Zone = {
      id: "zone1",
      width: 10,
      height: 10,
      tiles: tiles1,
      connections: new Map(),
    };
    const zone2: Zone = {
      id: "zone2",
      width: 10,
      height: 10,
      tiles: tiles2,
      connections: new Map(),
    };
    
    // Add walls around borders
    for (let i = 0; i < 10; i++) {
      zone1.tiles[i] = "wall";
      zone1.tiles[90 + i] = "wall";
      zone1.tiles[i * 10] = "wall";
      zone1.tiles[i * 10 + 9] = "wall";
      
      zone2.tiles[i] = "wall";
      zone2.tiles[90 + i] = "wall";
      zone2.tiles[i * 10] = "wall";
      zone2.tiles[i * 10 + 9] = "wall";
    }
    
    // Set up bidirectional stairs
    zone1.tiles[5 * 10 + 5] = "stairs_down";
    if (zone1.connections) {
      zone1.connections.set("5,5", {
        targetZone: "zone2",
        targetX: 3,
        targetY: 3,
      });
    }
    
    zone2.tiles[3 * 10 + 3] = "stairs_up";
    if (zone2.connections) {
      zone2.connections.set("3,3", {
        targetZone: "zone1",
        targetX: 5,
        targetY: 5,
      });
    }
    
    world.zones.set("zone1", zone1);
    world.zones.set("zone2", zone2);

    const player = spawnPlayer(world, "zone1", "Player", 0)!;
    
    // Move player to stairs in zone1
    const pos1 = world.positions.get(player)!;
    world.positions.set(player, { x: 4, y: 5, zone: "zone1" });
    world.occupancy.delete(`${pos1.zone},${pos1.x},${pos1.y}`);
    world.occupancy.set("zone1,4,5", player);

    const rng = createRng(1);
    
    // Move onto stairs (zone1 -> zone2)
    let events = tryMove(world, rng, player, 1, 0);
    expect(events.some(e => e.kind === "zone_changed")).toBe(true);
    expect(world.positions.get(player)?.zone).toBe("zone2");
    
    // Move player next to stairs in zone2
    const pos2 = world.positions.get(player)!;
    world.positions.set(player, { x: 2, y: 3, zone: "zone2" });
    world.occupancy.delete(`${pos2.zone},${pos2.x},${pos2.y}`);
    world.occupancy.set("zone2,2,3", player);
    
    // Move onto stairs (zone2 -> zone1)
    events = tryMove(world, rng, player, 1, 0);
    expect(events.some(e => e.kind === "zone_changed")).toBe(true);
    expect(world.positions.get(player)?.zone).toBe("zone1");
  });
});
