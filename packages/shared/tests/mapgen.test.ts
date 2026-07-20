import { describe, expect, it } from "vitest";
import { generateZone } from "../src/index.js";

describe("generateZone (cellular automata)", () => {
  it("produces identical maps for the same seed", () => {
    const a = generateZone("cave", 40, 20, 1337);
    const b = generateZone("cave", 40, 20, 1337);
    expect(a.tiles).toEqual(b.tiles);
  });

  it("produces different maps for different seeds", () => {
    const a = generateZone("cave", 40, 20, 1);
    const b = generateZone("cave", 40, 20, 2);
    expect(a.tiles).not.toEqual(b.tiles);
  });

  it("has walls on all borders", () => {
    const zone = generateZone("cave", 40, 20, 42);
    
    // Top and bottom rows
    for (let x = 0; x < zone.width; x++) {
      expect(zone.tiles[x]).toBe("wall"); // top
      expect(zone.tiles[(zone.height - 1) * zone.width + x]).toBe("wall"); // bottom
    }
    
    // Left and right columns
    for (let y = 0; y < zone.height; y++) {
      expect(zone.tiles[y * zone.width]).toBe("wall"); // left
      expect(zone.tiles[y * zone.width + zone.width - 1]).toBe("wall"); // right
    }
  });

  it("produces a connected map (all floor tiles reachable)", () => {
    const zone = generateZone("cave", 40, 20, 123);
    
    // Find first floor tile
    let startX = -1, startY = -1;
    for (let y = 0; y < zone.height && startX === -1; y++) {
      for (let x = 0; x < zone.width && startX === -1; x++) {
        if (zone.tiles[y * zone.width + x] === "floor") {
          startX = x;
          startY = y;
        }
      }
    }
    
    if (startX === -1) {
      throw new Error("No floor tiles found");
    }
    
    // Flood fill from first floor tile
    const visited = new Set<number>();
    const stack = [startY * zone.width + startX];
    
    while (stack.length > 0) {
      const idx = stack.pop()!;
      if (visited.has(idx)) continue;
      
      const x = idx % zone.width;
      const y = Math.floor(idx / zone.width);
      
      if (x < 0 || x >= zone.width || y < 0 || y >= zone.height) continue;
      if (zone.tiles[idx] !== "floor") continue;
      
      visited.add(idx);
      stack.push((y - 1) * zone.width + x);
      stack.push((y + 1) * zone.width + x);
      stack.push(y * zone.width + (x - 1));
      stack.push(y * zone.width + (x + 1));
    }
    
    // Count all floor tiles
    const totalFloor = zone.tiles.filter(t => t === "floor").length;
    
    // All floor tiles should be reachable
    expect(visited.size).toBe(totalFloor);
  });

  it("has a reasonable floor percentage (30-70%)", () => {
    const zone = generateZone("cave", 40, 20, 999);
    const totalTiles = zone.width * zone.height;
    const floorCount = zone.tiles.filter(t => t === "floor").length;
    const floorPercent = floorCount / totalTiles;
    
    expect(floorPercent).toBeGreaterThan(0.30);
    expect(floorPercent).toBeLessThan(0.70);
  });

  it("produces valid tile types only", () => {
    const zone = generateZone("cave", 40, 20, 777);
    for (const tile of zone.tiles) {
      expect(["floor", "wall"]).toContain(tile);
    }
  });

  it("has correct dimensions", () => {
    const zone = generateZone("cave", 50, 25, 42);
    expect(zone.width).toBe(50);
    expect(zone.height).toBe(25);
    expect(zone.tiles.length).toBe(50 * 25);
  });

  it("preserves zone id", () => {
    const zone = generateZone("dungeon", 40, 20, 42);
    expect(zone.id).toBe("dungeon");
  });

  // Snapshot tests for specific seeds to detect regressions
  describe("snapshot tests", () => {
    it("seed 1337 produces expected pattern", () => {
      const zone = generateZone("cave", 40, 20, 1337);
      const floorCount = zone.tiles.filter(t => t === "floor").length;
      const wallCount = zone.tiles.filter(t => t === "wall").length;
      
      // Snapshot the counts as a regression check
      expect(floorCount).toBe(436);
      expect(wallCount).toBe(364);
    });

    it("seed 42 produces expected pattern", () => {
      const zone = generateZone("cave", 40, 20, 42);
      const floorCount = zone.tiles.filter(t => t === "floor").length;
      const wallCount = zone.tiles.filter(t => t === "wall").length;
      
      expect(floorCount).toBe(500);
      expect(wallCount).toBe(300);
    });

    it("seed 999 produces expected pattern", () => {
      const zone = generateZone("cave", 40, 20, 999);
      const floorCount = zone.tiles.filter(t => t === "floor").length;
      const wallCount = zone.tiles.filter(t => t === "wall").length;
      
      expect(floorCount).toBe(484);
      expect(wallCount).toBe(316);
    });
  });
});
