import type { EntityId, Position, World } from "../model/world.js";
import { entityAt, isWalkable } from "../model/world.js";
import type { Rng } from "../rng/rng.js";
import type { Event } from "./types.js";
import { resolveAttack } from "./combat.js";

/**
 * Move an entity by (dx, dy). Walking into a wall is a bump.
 * Walking into another entity triggers a melee attack.
 * Mutates world, returns what happened.
 */
export function tryMove(
  world: World,
  rng: Rng,
  entityId: EntityId,
  dx: -1 | 0 | 1,
  dy: -1 | 0 | 1,
): Event[] {
  const pos = world.positions.get(entityId);
  if (!pos) return [];

  const zone = world.zones.get(pos.zone);
  if (!zone) return [];

  const nx = pos.x + dx;
  const ny = pos.y + dy;

  if (!isWalkable(zone, nx, ny)) return [{ kind: "bumped", entityId }];
  
  const targetId = entityAt(world, pos.zone, nx, ny);
  if (targetId !== undefined) {
    // Attack the entity we bumped into
    return resolveAttack(world, rng, entityId, targetId);
  }

  const to: Position = { x: nx, y: ny, zone: pos.zone };
  world.occupancy.delete(`${pos.zone},${pos.x},${pos.y}`);
  world.occupancy.set(`${to.zone},${to.x},${to.y}`, entityId);
  world.positions.set(entityId, to);
  return [{ kind: "moved", entityId, to }];
}
