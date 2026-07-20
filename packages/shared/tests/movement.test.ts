import { describe, expect, it } from "vitest";
import {
  createRng,
  entityAt,
  generateZone,
  makeWorld,
  removeEntity,
  spawnPlayer,
  stepWorld,
  tryMove,
} from "../src/index.js";

function setup() {
  const world = makeWorld();
  world.zones.set("cave", generateZone("cave", 20, 10, 42));
  const rng = createRng(1);
  const id = spawnPlayer(world, "cave", "TestHero", 0);
  if (id === undefined) throw new Error("spawn failed");
  return { world, rng, id };
}

describe("tryMove", () => {
  it("moves onto a floor tile and returns a moved event", () => {
    const { world, rng, id } = setup();
    const before = world.positions.get(id)!;
    const events = tryMove(world, rng, id, 1, 0);

    expect(events).toEqual([
      { kind: "moved", entityId: id, to: { x: before.x + 1, y: before.y, zone: "cave" } },
    ]);
    expect(world.positions.get(id)).toEqual({ x: before.x + 1, y: before.y, zone: "cave" });
  });

  it("bumps on a wall and leaves position unchanged", () => {
    const { world, rng, id } = setup();
    const before = world.positions.get(id)!;
    // Player spawns at (1,1); the border at x=0 is wall.
    const events = tryMove(world, rng, id, -1, 0);

    expect(events).toEqual([{ kind: "bumped", entityId: id }]);
    expect(world.positions.get(id)).toEqual(before);
  });

  it("bumps when another entity occupies the target tile", () => {
    const { world, rng, id } = setup();
    const pos = world.positions.get(id)!;
    const other = spawnPlayer(world, "cave", "Other", 0)!;
    const otherPos = world.positions.get(other)!;
    world.occupancy.delete(`${otherPos.zone},${otherPos.x},${otherPos.y}`);
    world.positions.set(other, { x: pos.x + 1, y: pos.y, zone: "cave" });
    world.occupancy.set(`${pos.zone},${pos.x + 1},${pos.y}`, other);

    expect(tryMove(world, rng, id, 1, 0)).toEqual([{ kind: "bumped", entityId: id }]);
  });
});

describe("stepWorld", () => {
  it("applies queued commands and increments the tick", () => {
    const { world, rng, id } = setup();
    const events = stepWorld(world, [{ entityId: id, cmd: { kind: "move", dx: 1, dy: 0 } }], rng);

    expect(world.tick).toBe(1);
    expect(events.map((e) => e.kind)).toEqual(["moved"]);
  });

  it("is deterministic: same commands on identical worlds give identical results", () => {
    const a = setup();
    const b = setup();
    const cmds = [
      { entityId: a.id, cmd: { kind: "move", dx: 1, dy: 0 } as const },
      { entityId: a.id, cmd: { kind: "move", dx: 0, dy: 1 } as const },
    ];
    stepWorld(a.world, cmds, a.rng);
    stepWorld(b.world, cmds, b.rng);

    expect(a.world.positions.get(a.id)).toEqual(b.world.positions.get(b.id));
    expect(a.world.tick).toBe(b.world.tick);
  });
});

describe("occupancy index", () => {
  it("entityAt uses O(1) lookup via occupancy index", () => {
    const world = makeWorld();
    world.zones.set("cave", generateZone("cave", 20, 10, 42));
    const id = spawnPlayer(world, "cave", "Alice", 0)!;
    const pos = world.positions.get(id)!;

    expect(entityAt(world, "cave", pos.x, pos.y)).toBe(id);
    expect(entityAt(world, "cave", pos.x + 1, pos.y)).toBeUndefined();
  });

  it("spawnPlayer adds entity to occupancy index", () => {
    const world = makeWorld();
    world.zones.set("cave", generateZone("cave", 20, 10, 42));
    const id = spawnPlayer(world, "cave", "Alice", 0)!;
    const pos = world.positions.get(id)!;

    expect(world.occupancy.get(`${pos.zone},${pos.x},${pos.y}`)).toBe(id);
  });

  it("removeEntity removes entity from occupancy index", () => {
    const world = makeWorld();
    world.zones.set("cave", generateZone("cave", 20, 10, 42));
    const id = spawnPlayer(world, "cave", "Alice", 0)!;
    const pos = world.positions.get(id)!;

    expect(world.occupancy.has(`${pos.zone},${pos.x},${pos.y}`)).toBe(true);
    removeEntity(world, id);
    expect(world.occupancy.has(`${pos.zone},${pos.x},${pos.y}`)).toBe(false);
  });

  it("tryMove updates occupancy index when moving", () => {
    const { world, rng, id } = setup();
    const before = world.positions.get(id)!;
    
    expect(world.occupancy.get(`${before.zone},${before.x},${before.y}`)).toBe(id);
    
    tryMove(world, rng, id, 1, 0);
    const after = world.positions.get(id)!;
    
    expect(world.occupancy.has(`${before.zone},${before.x},${before.y}`)).toBe(false);
    expect(world.occupancy.get(`${after.zone},${after.x},${after.y}`)).toBe(id);
  });

  it("tryMove does not update occupancy index on bump", () => {
    const { world, rng, id } = setup();
    const before = world.positions.get(id)!;
    
    // Try to move into a wall
    tryMove(world, rng, id, -1, 0);
    
    expect(world.occupancy.get(`${before.zone},${before.x},${before.y}`)).toBe(id);
  });
});
