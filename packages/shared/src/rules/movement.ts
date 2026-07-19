import type { EntityId, Position, World } from "../model/world.js";
import { entityAt, isWalkable } from "../model/world.js";
import type { Rng } from "../rng/rng.js";

export type Event =
  | { kind: "moved"; entityId: EntityId; to: Position }
  | { kind: "bumped"; entityId: EntityId }
  | { kind: "joined"; entityId: EntityId; handle: string }
  | { kind: "left"; entityId: EntityId; handle: string };

export type Command = { kind: "move"; dx: -1 | 0 | 1; dy: -1 | 0 | 1 };

/**
 * Move an entity by (dx, dy). Walking into a wall or another entity is a bump
 * (melee attacks arrive in phase 2). Mutates world, returns what happened.
 */
export function tryMove(
  world: World,
  _rng: Rng,
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
  if (entityAt(world, pos.zone, nx, ny) !== undefined) return [{ kind: "bumped", entityId }];

  const to: Position = { x: nx, y: ny, zone: pos.zone };
  world.positions.set(entityId, to);
  return [{ kind: "moved", entityId, to }];
}
