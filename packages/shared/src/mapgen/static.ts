import type { Zone, ZoneId, Tile } from "../model/world.js";

/**
 * Phase-1 map: a rectangular room with a couple of pillars. Seeded signature
 * so it can be swapped for real procedural generation without touching callers.
 */
export function generateZone(id: ZoneId, width: number, height: number, _seed: number): Zone {
  const tiles: Tile[] = new Array<Tile>(width * height).fill("floor");

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const border = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      const pillar = (x === width >> 1 && y === height >> 1) || (x === 5 && y === 3);
      if (border || pillar) tiles[y * width + x] = "wall";
    }
  }

  return { id, width, height, tiles };
}
