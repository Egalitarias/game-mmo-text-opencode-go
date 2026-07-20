import type { Zone, ZoneId } from "../model/world.js";
import { generateCave } from "./cellular.js";
import { generateZoneWithVaults } from "./zoneGenerator.js";

/**
 * Generate a zone using cellular automata for cave-like terrain.
 * Seeded: same seed always produces the same map.
 * Optionally includes hand-authored vaults for variety.
 */
export function generateZone(
  id: ZoneId,
  width: number,
  height: number,
  seed: number,
  options?: { enableVaults?: boolean; difficulty?: number }
): Zone {
  if (options?.enableVaults) {
    const result = generateZoneWithVaults({
      id,
      width,
      height,
      seed,
      difficulty: options.difficulty ?? 5,
      enableVaults: true,
    });
    return result.zone;
  }

  return generateCave(id, width, height, seed);
}
