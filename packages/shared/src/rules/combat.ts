import type { EntityId, World } from "../model/world.js";
import type { Rng } from "../rng/rng.js";
import type { Event } from "./types.js";
import { removeEntity } from "../model/world.js";

/**
 * Resolve a melee attack between two entities.
 * Damage = max(1, attacker.attack - defender.defense + random variance)
 * Returns attack event and death event if target dies.
 */
export function resolveAttack(
  world: World,
  rng: Rng,
  attackerId: EntityId,
  targetId: EntityId,
): Event[] {
  const attackerStats = world.stats.get(attackerId);
  const targetStats = world.stats.get(targetId);
  
  if (!attackerStats || !targetStats) return [];

  // Calculate damage with some randomness
  const baseDamage = attackerStats.attack - targetStats.defense;
  const variance = rng.int(3) - 1; // -1, 0, or +1
  const damage = Math.max(1, baseDamage + variance);

  // Apply damage
  targetStats.hp -= damage;

  const events: Event[] = [
    { kind: "attacked", attackerId, targetId, damage },
  ];

  // Check if target died
  if (targetStats.hp <= 0) {
    events.push({ kind: "died", entityId: targetId });
    removeEntity(world, targetId);
  }

  return events;
}
