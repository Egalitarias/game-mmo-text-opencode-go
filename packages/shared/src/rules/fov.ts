import type { EntityId, World } from "../model/world.js";

/**
 * Compute field of view for an entity using shadow casting.
 * Returns a set of visible tile coordinates as "x,y" strings.
 *
 * Shadow casting algorithm:
 * - Cast rays in 8 octants from the entity position
 * - Track shadows cast by walls
 * - A tile is visible if a ray can reach it without passing through a wall
 */
export function computeFov(world: World, entityId: EntityId, radius: number = 10): Set<string> {
  const pos = world.positions.get(entityId);
  if (!pos) return new Set();

  const zone = world.zones.get(pos.zone);
  if (!zone) return new Set();

  const visible = new Set<string>();
  const { x: cx, y: cy } = pos;

  // Always see self
  visible.add(`${cx},${cy}`);

  // Process all 8 octants
  for (let octant = 0; octant < 8; octant++) {
    castLight(zone, visible, cx, cy, 1, 1.0, 0.0, radius, octant);
  }

  return visible;
}

/**
 * Cast light in one octant using recursive shadow casting.
 */
function castLight(
  zone: { width: number; height: number; tiles: string[] },
  visible: Set<string>,
  cx: number,
  cy: number,
  row: number,
  startSlope: number,
  endSlope: number,
  radius: number,
  octant: number,
): void {
  if (startSlope < endSlope) return;

  let newStart = 0;

  for (let j = row; j <= radius; j++) {
    let blocked = false;

    for (let dx = -j, dy = -j; dx <= 0; dx++) {
      // Translate coordinates based on octant
      const [x, y] = transformOctant(cx, cy, dx, dy, octant);

      // Calculate slopes
      const lSlope = (dx - 0.5) / (dy + 0.5);
      const rSlope = (dx + 0.5) / (dy - 0.5);

      if (startSlope < rSlope) continue;
      if (endSlope > lSlope) break;

      // Check if within radius
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= radius) {
        // Check bounds
        if (x >= 0 && x < zone.width && y >= 0 && y < zone.height) {
          visible.add(`${x},${y}`);
        }
      }

      // Check if this tile blocks light
      const isWall = x < 0 || x >= zone.width || y < 0 || y >= zone.height ||
                     zone.tiles[y * zone.width + x] === "wall";

      if (blocked) {
        if (isWall) {
          newStart = rSlope;
          continue;
        } else {
          blocked = false;
          startSlope = newStart;
        }
      } else if (isWall && j < radius) {
        blocked = true;
        castLight(zone, visible, cx, cy, j + 1, startSlope, lSlope, radius, octant);
        newStart = rSlope;
      }
    }

    if (blocked) break;
  }
}

/**
 * Transform coordinates from octant 0 to the target octant.
 */
function transformOctant(cx: number, cy: number, dx: number, dy: number, octant: number): [number, number] {
  switch (octant) {
    case 0: return [cx + dx, cy + dy];
    case 1: return [cx + dy, cy + dx];
    case 2: return [cx + dy, cy - dx];
    case 3: return [cx + dx, cy - dy];
    case 4: return [cx - dx, cy - dy];
    case 5: return [cx - dy, cy - dx];
    case 6: return [cx - dy, cy + dx];
    case 7: return [cx - dx, cy + dy];
    default: return [cx + dx, cy + dy];
  }
}
