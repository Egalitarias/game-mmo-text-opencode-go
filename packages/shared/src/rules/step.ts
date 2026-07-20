import type { EntityId, World } from "../model/world.js";
import type { Rng } from "../rng/rng.js";
import type { Command, Event } from "./types.js";
import { tryMove } from "./movement.js";
import { decideMonsterAction } from "./ai.js";

export interface QueuedCommand {
  entityId: EntityId;
  cmd: Command;
}

/**
 * Advance the world by one tick: apply each queued command in arrival order,
 * then process monster AI, then increment the tick counter.
 * Deterministic given (world, cmds, rng).
 */
export function stepWorld(world: World, cmds: QueuedCommand[], rng: Rng): Event[] {
  const events: Event[] = [];
  
  // Process player commands
  for (const { entityId, cmd } of cmds) {
    switch (cmd.kind) {
      case "move":
        events.push(...tryMove(world, rng, entityId, cmd.dx, cmd.dy));
        break;
    }
  }
  
  // Process monster AI
  events.push(...processMonsterAI(world, rng));
  
  world.tick += 1;
  return events;
}

/**
 * Process AI for all monsters using the energy system.
 * Monsters gain energy each tick based on their speed.
 * When energy >= 100, they can act and energy is reduced by 100.
 */
function processMonsterAI(world: World, rng: Rng): Event[] {
  const events: Event[] = [];
  
  for (const [monsterId] of world.ais) {
    const energy = world.energies.get(monsterId);
    if (!energy) continue;
    
    // Gain energy based on speed
    energy.current += energy.speed;
    
    // Act if we have enough energy
    while (energy.current >= 100) {
      energy.current -= 100;
      
      const cmd = decideMonsterAction(world, monsterId, rng);
      if (cmd) {
        switch (cmd.kind) {
          case "move":
            events.push(...tryMove(world, rng, monsterId, cmd.dx, cmd.dy));
            break;
        }
      }
    }
  }
  
  return events;
}
