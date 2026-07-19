import type { EntityId, World } from "../model/world.js";
import type { Rng } from "../rng/rng.js";
import type { Command, Event } from "./movement.js";
import { tryMove } from "./movement.js";

export interface QueuedCommand {
  entityId: EntityId;
  cmd: Command;
}

/**
 * Advance the world by one tick: apply each queued command in arrival order,
 * then increment the tick counter. Deterministic given (world, cmds, rng).
 */
export function stepWorld(world: World, cmds: QueuedCommand[], rng: Rng): Event[] {
  const events: Event[] = [];
  for (const { entityId, cmd } of cmds) {
    switch (cmd.kind) {
      case "move":
        events.push(...tryMove(world, rng, entityId, cmd.dx, cmd.dy));
        break;
    }
  }
  world.tick += 1;
  return events;
}
