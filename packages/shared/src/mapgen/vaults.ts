import type { Tile, Item, Zone } from "../model/world.js";

export interface VaultSpawn {
  x: number;
  y: number;
  type: "monster" | "item";
  monsterType?: "aggressive" | "wander" | "flee";
  item?: Item;
}

export interface VaultTemplate {
  name: string;
  width: number;
  height: number;
  tiles: Tile[][];
  spawns: VaultSpawn[];
  difficulty: number; // 1-10, used for zone-appropriate placement
}

/**
 * Pre-defined vault templates for map generation
 */
export const VAULT_TEMPLATES: VaultTemplate[] = [
  {
    name: "Treasure Room",
    width: 5,
    height: 5,
    tiles: [
      ["wall", "wall", "wall", "wall", "wall"],
      ["wall", "floor", "floor", "floor", "wall"],
      ["wall", "floor", "floor", "floor", "wall"],
      ["wall", "floor", "floor", "floor", "wall"],
      ["wall", "wall", "floor", "wall", "wall"],
    ],
    spawns: [
      { x: 2, y: 2, type: "item", item: { kind: "gold", name: "Gold Pile", value: 50 } },
      { x: 1, y: 1, type: "item", item: { kind: "potion", name: "Health Potion", value: 20 } },
      { x: 3, y: 3, type: "monster", monsterType: "aggressive" },
    ],
    difficulty: 3,
  },
  {
    name: "Guard Room",
    width: 7,
    height: 5,
    tiles: [
      ["wall", "wall", "wall", "wall", "wall", "wall", "wall"],
      ["wall", "floor", "floor", "floor", "floor", "floor", "wall"],
      ["wall", "floor", "floor", "floor", "floor", "floor", "wall"],
      ["wall", "floor", "floor", "floor", "floor", "floor", "wall"],
      ["wall", "wall", "wall", "floor", "wall", "wall", "wall"],
    ],
    spawns: [
      { x: 2, y: 2, type: "monster", monsterType: "aggressive" },
      { x: 4, y: 2, type: "monster", monsterType: "aggressive" },
      { x: 3, y: 1, type: "item", item: { kind: "sword", name: "Guard's Sword", value: 5 } },
    ],
    difficulty: 5,
  },
  {
    name: "Small Shrine",
    width: 4,
    height: 4,
    tiles: [
      ["wall", "wall", "wall", "wall"],
      ["wall", "floor", "floor", "wall"],
      ["wall", "floor", "floor", "wall"],
      ["wall", "wall", "floor", "wall"],
    ],
    spawns: [
      { x: 1, y: 1, type: "item", item: { kind: "potion", name: "Blessed Water", value: 30 } },
      { x: 2, y: 2, type: "item", item: { kind: "shield", name: "Holy Shield", value: 8 } },
    ],
    difficulty: 2,
  },
  {
    name: "Monster Lair",
    width: 6,
    height: 6,
    tiles: [
      ["wall", "wall", "wall", "wall", "wall", "wall"],
      ["wall", "floor", "floor", "floor", "floor", "wall"],
      ["wall", "floor", "floor", "floor", "floor", "wall"],
      ["wall", "floor", "floor", "floor", "floor", "wall"],
      ["wall", "floor", "floor", "floor", "floor", "wall"],
      ["wall", "wall", "wall", "floor", "wall", "wall"],
    ],
    spawns: [
      { x: 2, y: 2, type: "monster", monsterType: "aggressive" },
      { x: 3, y: 3, type: "monster", monsterType: "aggressive" },
      { x: 4, y: 2, type: "monster", monsterType: "wander" },
      { x: 2, y: 4, type: "item", item: { kind: "gold", name: "Monster Hoard", value: 100 } },
    ],
    difficulty: 7,
  },
  {
    name: "Armory",
    width: 5,
    height: 4,
    tiles: [
      ["wall", "wall", "wall", "wall", "wall"],
      ["wall", "floor", "floor", "floor", "wall"],
      ["wall", "floor", "floor", "floor", "wall"],
      ["wall", "wall", "floor", "wall", "wall"],
    ],
    spawns: [
      { x: 1, y: 1, type: "item", item: { kind: "sword", name: "Steel Sword", value: 7 } },
      { x: 2, y: 1, type: "item", item: { kind: "shield", name: "Iron Shield", value: 5 } },
      { x: 3, y: 1, type: "item", item: { kind: "sword", name: "Bronze Sword", value: 4 } },
      { x: 2, y: 2, type: "monster", monsterType: "wander" },
    ],
    difficulty: 4,
  },
];

/**
 * Select a random vault template appropriate for the zone difficulty
 */
export function selectVault(zoneDifficulty: number, seed: number): VaultTemplate | null {
  // Use seed for deterministic selection
  const random = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  // Filter vaults within difficulty range (±2 of zone difficulty)
  const suitable = VAULT_TEMPLATES.filter(
    (v) => Math.abs(v.difficulty - zoneDifficulty) <= 2
  );

  if (suitable.length === 0) return null;

  // Select random vault
  const index = Math.floor(random() * suitable.length);
  return suitable[index] ?? null;
}

/**
 * Check if a vault can be placed at the given location
 */
export function canPlaceVault(
  zone: Zone,
  vault: VaultTemplate,
  x: number,
  y: number
): boolean {
  // Check bounds
  if (x < 0 || y < 0 || x + vault.width > zone.width || y + vault.height > zone.height) {
    return false;
  }

  // Check that vault doesn't overlap with existing floors (allow some overlap for integration)
  let floorOverlap = 0;
  for (let vy = 0; vy < vault.height; vy++) {
    for (let vx = 0; vx < vault.width; vx++) {
      const zoneX = x + vx;
      const zoneY = y + vy;
      const zoneTile = zone.tiles[zoneY * zone.width + zoneX];
      const vaultRow = vault.tiles[vy];
      const vaultTile = vaultRow ? vaultRow[vx] : undefined;

      // Count overlaps where both are floors
      if (zoneTile === "floor" && vaultTile === "floor") {
        floorOverlap++;
      }
    }
  }

  // Allow up to 30% floor overlap for better integration
  const vaultFloorCount = vault.tiles.flat().filter((t) => t === "floor").length;
  const maxOverlap = Math.floor(vaultFloorCount * 0.3);

  return floorOverlap <= maxOverlap;
}

/**
 * Place a vault into the zone at the given location
 */
export function placeVault(
  zone: Zone,
  vault: VaultTemplate,
  x: number,
  y: number
): VaultSpawn[] {
  // Place vault tiles
  for (let vy = 0; vy < vault.height; vy++) {
    for (let vx = 0; vx < vault.width; vx++) {
      const zoneX = x + vx;
      const zoneY = y + vy;
      const vaultRow = vault.tiles[vy];
      const vaultTile = vaultRow ? vaultRow[vx] : undefined;

      // Only overwrite if vault tile is not empty
      if (vaultTile) {
        zone.tiles[zoneY * zone.width + zoneX] = vaultTile;
      }
    }
  }

  // Adjust spawn positions to zone coordinates
  return vault.spawns.map((spawn) => ({
    ...spawn,
    x: x + spawn.x,
    y: y + spawn.y,
  }));
}

/**
 * Attempt to place multiple vaults in a zone
 */
export function placeVaults(
  zone: Zone,
  zoneDifficulty: number,
  seed: number,
  maxAttempts: number = 20,
  maxVaults: number = 3
): VaultSpawn[] {
  const allSpawns: VaultSpawn[] = [];
  let vaultsPlaced = 0;
  let attempts = 0;

  // Use seed for deterministic placement
  const random = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  while (vaultsPlaced < maxVaults && attempts < maxAttempts) {
    attempts++;

    // Select a vault
    const vault = selectVault(zoneDifficulty, seed + attempts);
    if (!vault) continue;

    // Try random placement location
    const x = Math.floor(random() * (zone.width - vault.width));
    const y = Math.floor(random() * (zone.height - vault.height));

    // Check if placement is valid
    if (canPlaceVault(zone, vault, x, y)) {
      const spawns = placeVault(zone, vault, x, y);
      allSpawns.push(...spawns);
      vaultsPlaced++;
    }
  }

  return allSpawns;
}
