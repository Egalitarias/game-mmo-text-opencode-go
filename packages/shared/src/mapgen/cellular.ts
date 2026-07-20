import type { Zone, ZoneId, Tile } from "../model/world.js";
import { createRng } from "../rng/rng.js";

/**
 * Procedural cave generation using cellular automata.
 * Produces organic, cave-like terrain with connected floor regions.
 */

const INITIAL_WALL_CHANCE = 0.40;
const SMOOTHING_ITERATIONS = 4;
const BIRTH_LIMIT = 5;
const DEATH_LIMIT = 3;

/**
 * Count wall neighbors in the 8 surrounding cells (Moore neighborhood).
 */
function countWallNeighbors(tiles: Tile[], width: number, x: number, y: number): number {
  let count = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= tiles.length / width) {
        count++; // Out of bounds counts as wall
      } else if (tiles[ny * width + nx] === "wall") {
        count++;
      }
    }
  }
  return count;
}

/**
 * Apply one iteration of cellular automata smoothing.
 */
function smoothIteration(tiles: Tile[], width: number, height: number): Tile[] {
  const newTiles = [...tiles];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const neighbors = countWallNeighbors(tiles, width, x, y);
      const idx = y * width + x;
      if (tiles[idx] === "wall") {
        newTiles[idx] = neighbors >= DEATH_LIMIT ? "wall" : "floor";
      } else {
        newTiles[idx] = neighbors > BIRTH_LIMIT ? "wall" : "floor";
      }
    }
  }
  return newTiles;
}

/**
 * Flood fill to find all connected floor tiles from a starting point.
 */
function floodFill(tiles: Tile[], width: number, height: number, startX: number, startY: number): Set<number> {
  const visited = new Set<number>();
  const stack = [startY * width + startX];
  
  while (stack.length > 0) {
    const idx = stack.pop()!;
    if (visited.has(idx)) continue;
    
    const x = idx % width;
    const y = Math.floor(idx / width);
    
    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    if (tiles[idx] !== "floor") continue;
    
    visited.add(idx);
    stack.push((y - 1) * width + x); // up
    stack.push((y + 1) * width + x); // down
    stack.push(y * width + (x - 1)); // left
    stack.push(y * width + (x + 1)); // right
  }
  
  return visited;
}

/**
 * Find the largest connected component of floor tiles and fill all others with walls.
 */
function connectLargestComponent(tiles: Tile[], width: number, height: number): Tile[] {
  const newTiles = [...tiles];
  const visited = new Set<number>();
  let largestComponent = new Set<number>();
  
  // Find all connected components
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (newTiles[idx] === "floor" && !visited.has(idx)) {
        const component = floodFill(newTiles, width, height, x, y);
        component.forEach(i => visited.add(i));
        if (component.size > largestComponent.size) {
          largestComponent = component;
        }
      }
    }
  }
  
  // Fill all floor tiles not in the largest component with walls
  for (let i = 0; i < newTiles.length; i++) {
    if (newTiles[i] === "floor" && !largestComponent.has(i)) {
      newTiles[i] = "wall";
    }
  }
  
  return newTiles;
}

/**
 * Generate a cave zone using cellular automata.
 * Deterministic: same seed always produces the same map.
 */
export function generateCave(id: ZoneId, width: number, height: number, seed: number): Zone {
  const rng = createRng(seed);
  
  // Initialize with random walls and floors
  let tiles: Tile[] = new Array<Tile>(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      // Borders are always walls
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        tiles[idx] = "wall";
      } else {
        tiles[idx] = rng.next() < INITIAL_WALL_CHANCE ? "wall" : "floor";
      }
    }
  }
  
  // Apply cellular automata smoothing
  for (let i = 0; i < SMOOTHING_ITERATIONS; i++) {
    tiles = smoothIteration(tiles, width, height);
  }
  
  // Ensure borders remain walls after smoothing
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        tiles[y * width + x] = "wall";
      }
    }
  }
  
  // Connect the largest component and fill isolated regions
  tiles = connectLargestComponent(tiles, width, height);
  
  return { id, width, height, tiles };
}
