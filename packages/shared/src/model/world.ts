export type EntityId = number;
export type ZoneId = string;

export interface Position {
  x: number;
  y: number;
  zone: ZoneId;
}

export type Tile = "floor" | "wall";

export interface Zone {
  id: ZoneId;
  width: number;
  height: number;
  /** Row-major tiles, index = y * width + x. */
  tiles: Tile[];
}

export interface Entity {
  id: EntityId;
  glyph: string;
}

export interface PlayerSession {
  /** Display name, chosen at connect, unique among online players. */
  handle: string;
  connectedAt: number;
}

export interface Ai {
  kind: "aggressive" | "wander" | "flee";
}

export interface Energy {
  current: number;
  speed: number;
}

export interface World {
  tick: number;
  zones: Map<ZoneId, Zone>;
  entities: Map<EntityId, Entity>;
  positions: Map<EntityId, Position>;
  players: Map<EntityId, PlayerSession>;
  ais: Map<EntityId, Ai>;
  energies: Map<EntityId, Energy>;
  nextEntityId: EntityId;
  /** Occupancy index: "zone,x,y" → EntityId for O(1) lookups. */
  occupancy: Map<string, EntityId>;
}

export function makeWorld(): World {
  return {
    tick: 0,
    zones: new Map(),
    entities: new Map(),
    positions: new Map(),
    players: new Map(),
    ais: new Map(),
    energies: new Map(),
    nextEntityId: 1,
    occupancy: new Map(),
  };
}

export function tileAt(zone: Zone, x: number, y: number): Tile | undefined {
  if (x < 0 || y < 0 || x >= zone.width || y >= zone.height) return undefined;
  return zone.tiles[y * zone.width + x];
}

export function isWalkable(zone: Zone, x: number, y: number): boolean {
  return tileAt(zone, x, y) === "floor";
}

function occupancyKey(zoneId: ZoneId, x: number, y: number): string {
  return `${zoneId},${x},${y}`;
}

/** Spawn a player entity on the first walkable tile of the zone (scan order). */
export function spawnPlayer(
  world: World,
  zoneId: ZoneId,
  handle: string,
  now: number,
): EntityId | undefined {
  const zone = world.zones.get(zoneId);
  if (!zone) return undefined;

  for (let y = 0; y < zone.height; y++) {
    for (let x = 0; x < zone.width; x++) {
      if (isWalkable(zone, x, y) && !entityAt(world, zoneId, x, y)) {
        const id = world.nextEntityId++;
        world.entities.set(id, { id, glyph: "@" });
        world.positions.set(id, { x, y, zone: zoneId });
        world.players.set(id, { handle, connectedAt: now });
        world.occupancy.set(occupancyKey(zoneId, x, y), id);
        return id;
      }
    }
  }
  return undefined;
}

/** Spawn a monster entity at the specified position. */
export function spawnMonster(
  world: World,
  zoneId: ZoneId,
  x: number,
  y: number,
  glyph: string,
  aiKind: Ai["kind"],
  speed: number = 100,
): EntityId | undefined {
  const zone = world.zones.get(zoneId);
  if (!zone) return undefined;
  if (!isWalkable(zone, x, y)) return undefined;
  if (entityAt(world, zoneId, x, y)) return undefined;

  const id = world.nextEntityId++;
  world.entities.set(id, { id, glyph });
  world.positions.set(id, { x, y, zone: zoneId });
  world.ais.set(id, { kind: aiKind });
  world.energies.set(id, { current: 0, speed });
  world.occupancy.set(occupancyKey(zoneId, x, y), id);
  return id;
}

export function removeEntity(world: World, id: EntityId): void {
  const pos = world.positions.get(id);
  if (pos) {
    world.occupancy.delete(occupancyKey(pos.zone, pos.x, pos.y));
  }
  world.entities.delete(id);
  world.positions.delete(id);
  world.players.delete(id);
  world.ais.delete(id);
  world.energies.delete(id);
}

export function entityAt(world: World, zoneId: ZoneId, x: number, y: number): EntityId | undefined {
  return world.occupancy.get(occupancyKey(zoneId, x, y));
}
