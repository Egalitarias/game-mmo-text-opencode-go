import type { Zone, ZoneId, Tile } from "../model/world.js";

/**
 * Phase-1 map: a rectangular room with a couple of pillars. Seeded signature
 * so it can be swapped for real procedural generation without touching callers.
 */
export function generateZone(id: ZoneId, width: number, height: number, _seed: number): Zone {
  const tiles: Tile[] = new Array<Tile>(width * height).fill("floor");

  // Two pillars on the middle row, symmetric about the vertical midline,
  // derived from the zone size so they exist at any dimensions.
  const pillarY = Math.floor(height / 2);
  const pillarX1 = Math.floor(width / 4);
  const pillarX2 = width - 1 - pillarX1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const border = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      const pillar = y === pillarY && (x === pillarX1 || x === pillarX2);
      if (border || pillar) tiles[y * width + x] = "wall";
    }
  }

  return { id, width, height, tiles };
}
