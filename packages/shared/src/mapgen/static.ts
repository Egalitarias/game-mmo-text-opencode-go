import type { Zone, ZoneId } from "../model/world.js";
import { generateCave } from "./cellular.js";

/**
 * Generate a zone using cellular automata for cave-like terrain.
 * Seeded: same seed always produces the same map.
 */
export function generateZone(id: ZoneId, width: number, height: number, seed: number): Zone {
  return generateCave(id, width, height, seed);
}
