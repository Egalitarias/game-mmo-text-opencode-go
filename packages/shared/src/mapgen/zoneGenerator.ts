import type { Zone, ZoneId, World, EntityId } from "../model/world.js";
import { generateCave } from "./cellular.js";
import { placeVaults, type VaultSpawn } from "./vaults.js";
import { spawnMonster, spawnItem } from "../model/world.js";

export interface ZoneGenerationOptions {
  id: ZoneId;
  width: number;
  height: number;
  seed: number;
  difficulty?: number; // 1-10, affects vault selection
  enableVaults?: boolean;
  maxVaults?: number;
}

export interface ZoneGenerationResult {
  zone: Zone;
  spawns: VaultSpawn[];
}

/**
 * Generate a zone with procedural caves and hand-authored vaults.
 * Returns both the zone and spawn points for entities.
 */
export function generateZoneWithVaults(options: ZoneGenerationOptions): ZoneGenerationResult {
  const {
    id,
    width,
    height,
    seed,
    difficulty = 5,
    enableVaults = true,
    maxVaults = 3,
  } = options;

  // Generate base cave using cellular automata
  const zone = generateCave(id, width, height, seed);

  // Place vaults if enabled
  let spawns: VaultSpawn[] = [];
  if (enableVaults) {
    // Use a different seed for vault placement to keep it independent
    const vaultSeed = seed + 1000;
    spawns = placeVaults(zone, difficulty, vaultSeed, 20, maxVaults);
  }

  return { zone, spawns };
}

/**
 * Spawn entities from vault spawn points into the world.
 * Returns the IDs of spawned entities.
 */
export function spawnVaultEntities(
  world: World,
  zoneId: ZoneId,
  spawns: VaultSpawn[]
): EntityId[] {
  const entityIds: EntityId[] = [];

  for (const spawn of spawns) {
    let entityId: EntityId | undefined;

    if (spawn.type === "monster" && spawn.monsterType) {
      // Spawn monster with appropriate stats based on type
      const stats = getMonsterStats(spawn.monsterType);
      entityId = spawnMonster(
        world,
        zoneId,
        spawn.x,
        spawn.y,
        getMonsterGlyph(spawn.monsterType),
        spawn.monsterType,
        100,
        stats
      );
    } else if (spawn.type === "item" && spawn.item) {
      // Spawn item
      entityId = spawnItem(world, zoneId, spawn.x, spawn.y, spawn.item);
    }

    if (entityId !== undefined) {
      entityIds.push(entityId);
    }
  }

  return entityIds;
}

/**
 * Get monster stats based on type
 */
function getMonsterStats(type: "aggressive" | "wander" | "flee"): {
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
} {
  switch (type) {
    case "aggressive":
      return { hp: 15, maxHp: 15, attack: 6, defense: 2 };
    case "wander":
      return { hp: 10, maxHp: 10, attack: 4, defense: 1 };
    case "flee":
      return { hp: 8, maxHp: 8, attack: 3, defense: 1 };
  }
}

/**
 * Get monster glyph based on type
 */
function getMonsterGlyph(type: "aggressive" | "wander" | "flee"): string {
  switch (type) {
    case "aggressive":
      return "g"; // goblin
    case "wander":
      return "w"; // wandering creature
    case "flee":
      return "f"; // fleeing creature
  }
}
