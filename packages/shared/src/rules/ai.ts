import type { Command, EntityId, Rng, World, Zone } from "../index.js";
import { computeFov } from "./fov.js";

/**
 * Decide the next action for a monster based on its AI type.
 * Returns a move command or null if no action should be taken.
 */
export function decideMonsterAction(
  world: World,
  monsterId: EntityId,
  rng: Rng,
): Command | null {
  const ai = world.ais.get(monsterId);
  if (!ai) return null;

  const pos = world.positions.get(monsterId);
  if (!pos) return null;

  const zone = world.zones.get(pos.zone);
  if (!zone) return null;

  switch (ai.kind) {
    case "aggressive":
      return decideAggressive(world, monsterId, pos, zone, rng);
    case "wander":
      return decideWander(pos, zone, rng);
    case "flee":
      return decideFlee(world, monsterId, pos, zone, rng);
  }
}

/**
 * Aggressive AI: move toward the nearest player within FOV.
 */
function decideAggressive(
  world: World,
  monsterId: EntityId,
  pos: { x: number; y: number; zone: string },
  zone: Zone,
  rng: Rng,
): Command | null {
  const fov = computeFov(world, monsterId, 8);
  
  // Find nearest player in FOV
  let nearestPlayer: EntityId | null = null;
  let nearestDist = Infinity;

  for (const [playerId] of world.players) {
    const playerPos = world.positions.get(playerId);
    if (!playerPos || playerPos.zone !== pos.zone) continue;
    if (!fov.has(`${playerPos.x},${playerPos.y}`)) continue;

    const dist = Math.abs(playerPos.x - pos.x) + Math.abs(playerPos.y - pos.y);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestPlayer = playerId;
    }
  }

  if (!nearestPlayer) return decideWander(pos, zone, rng);

  const targetPos = world.positions.get(nearestPlayer)!;
  return moveToward(pos, targetPos, zone, rng);
}

/**
 * Wander AI: move randomly in a valid direction.
 */
function decideWander(
  pos: { x: number; y: number; zone: string },
  zone: Zone,
  rng: Rng,
): Command | null {
  const directions: Array<{ dx: -1 | 0 | 1; dy: -1 | 0 | 1 }> = [
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
  ];

  // Shuffle directions
  for (let i = directions.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const temp = directions[i]!;
    directions[i] = directions[j]!;
    directions[j] = temp;
  }

  for (const dir of directions) {
    const nx = pos.x + dir.dx;
    const ny = pos.y + dir.dy;
    
    if (nx < 0 || nx >= zone.width || ny < 0 || ny >= zone.height) continue;
    if (zone.tiles[ny * zone.width + nx] === "wall") continue;

    return { kind: "move", dx: dir.dx, dy: dir.dy };
  }

  return null;
}

/**
 * Flee AI: move away from the nearest player within FOV.
 */
function decideFlee(
  world: World,
  monsterId: EntityId,
  pos: { x: number; y: number; zone: string },
  zone: Zone,
  rng: Rng,
): Command | null {
  const fov = computeFov(world, monsterId, 8);
  
  // Find nearest player in FOV
  let nearestPlayer: EntityId | null = null;
  let nearestDist = Infinity;

  for (const [playerId] of world.players) {
    const playerPos = world.positions.get(playerId);
    if (!playerPos || playerPos.zone !== pos.zone) continue;
    if (!fov.has(`${playerPos.x},${playerPos.y}`)) continue;

    const dist = Math.abs(playerPos.x - pos.x) + Math.abs(playerPos.y - pos.y);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestPlayer = playerId;
    }
  }

  if (!nearestPlayer) return decideWander(pos, zone, rng);

  const targetPos = world.positions.get(nearestPlayer)!;
  return moveAway(pos, targetPos, zone, rng);
}

/**
 * Calculate a move command toward a target position.
 */
function moveToward(
  from: { x: number; y: number; zone: string },
  to: { x: number; y: number },
  zone: Zone,
  rng: Rng,
): Command | null {
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);

  // Try to move in the primary direction first
  const moves: Array<{ dx: -1 | 0 | 1; dy: -1 | 0 | 1 }> = [];
  if (dx !== 0) moves.push({ dx: dx as -1 | 0 | 1, dy: 0 });
  if (dy !== 0) moves.push({ dx: 0, dy: dy as -1 | 0 | 1 });

  // Shuffle to add variety
  if (moves.length > 1 && rng.next() < 0.5) {
    const temp = moves[0]!;
    moves[0] = moves[1]!;
    moves[1] = temp;
  }

  for (const move of moves) {
    const nx = from.x + move.dx;
    const ny = from.y + move.dy;
    
    if (nx < 0 || nx >= zone.width || ny < 0 || ny >= zone.height) continue;
    if (zone.tiles[ny * zone.width + nx] === "wall") continue;

    return { kind: "move", dx: move.dx, dy: move.dy };
  }

  return null;
}

/**
 * Calculate a move command away from a target position.
 */
function moveAway(
  from: { x: number; y: number; zone: string },
  to: { x: number; y: number },
  zone: Zone,
  rng: Rng,
): Command | null {
  const dx = -Math.sign(to.x - from.x);
  const dy = -Math.sign(to.y - from.y);

  // Try to move in the primary direction first
  const moves: Array<{ dx: -1 | 0 | 1; dy: -1 | 0 | 1 }> = [];
  if (dx !== 0) moves.push({ dx: dx as -1 | 0 | 1, dy: 0 });
  if (dy !== 0) moves.push({ dx: 0, dy: dy as -1 | 0 | 1 });

  // Shuffle to add variety
  if (moves.length > 1 && rng.next() < 0.5) {
    const temp = moves[0]!;
    moves[0] = moves[1]!;
    moves[1] = temp;
  }

  for (const move of moves) {
    const nx = from.x + move.dx;
    const ny = from.y + move.dy;
    
    if (nx < 0 || nx >= zone.width || ny < 0 || ny >= zone.height) continue;
    if (zone.tiles[ny * zone.width + nx] === "wall") continue;

    return { kind: "move", dx: move.dx, dy: move.dy };
  }

  return null;
}
