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

export interface Stats {
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
}

export interface Ai {
  kind: "aggressive" | "wander" | "flee";
}

export interface Energy {
  current: number;
  speed: number;
}

export type ItemKind = "potion" | "sword" | "shield" | "gold";

export interface Item {
  kind: ItemKind;
  name: string;
  /** For potions: healing amount. For weapons/armor: stat bonus. */
  value?: number;
}

export interface Inventory {
  items: Item[];
  maxSize: number;
}

export interface World {
  tick: number;
  zones: Map<ZoneId, Zone>;
  entities: Map<EntityId, Entity>;
  positions: Map<EntityId, Position>;
  players: Map<EntityId, PlayerSession>;
  stats: Map<EntityId, Stats>;
  ais: Map<EntityId, Ai>;
  energies: Map<EntityId, Energy>;
  items: Map<EntityId, Item>;
  inventories: Map<EntityId, Inventory>;
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
    stats: new Map(),
    ais: new Map(),
    energies: new Map(),
    items: new Map(),
    inventories: new Map(),
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
        world.stats.set(id, { hp: 20, maxHp: 20, attack: 5, defense: 2 });
        world.inventories.set(id, { items: [], maxSize: 10 });
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
  stats?: Partial<Stats>,
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
  world.stats.set(id, {
    hp: stats?.hp ?? 10,
    maxHp: stats?.maxHp ?? 10,
    attack: stats?.attack ?? 3,
    defense: stats?.defense ?? 1,
  });
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
  world.stats.delete(id);
  world.ais.delete(id);
  world.energies.delete(id);
  world.items.delete(id);
  world.inventories.delete(id);
}

/** Spawn an item entity at the specified position. */
export function spawnItem(
  world: World,
  zoneId: ZoneId,
  x: number,
  y: number,
  item: Item,
): EntityId | undefined {
  const zone = world.zones.get(zoneId);
  if (!zone) return undefined;
  if (!isWalkable(zone, x, y)) return undefined;
  if (entityAt(world, zoneId, x, y)) return undefined;

  const id = world.nextEntityId++;
  const glyphs: Record<ItemKind, string> = {
    potion: "!",
    sword: "/",
    shield: "]",
    gold: "$",
  };
  world.entities.set(id, { id, glyph: glyphs[item.kind] });
  world.positions.set(id, { x, y, zone: zoneId });
  world.items.set(id, item);
  world.occupancy.set(occupancyKey(zoneId, x, y), id);
  return id;
}

/**
 * Respawn a player at a safe location with full HP.
 * Returns the new position, or undefined if no spawn point is available.
 */
export function respawnPlayer(world: World, playerId: EntityId): Position | undefined {
  const player = world.players.get(playerId);
  if (!player) return undefined;

  // Find a spawn point (first walkable tile in any zone)
  for (const [zoneId, zone] of world.zones) {
    for (let y = 0; y < zone.height; y++) {
      for (let x = 0; x < zone.width; x++) {
        if (isWalkable(zone, x, y) && !entityAt(world, zoneId, x, y)) {
          // Remove old position from occupancy
          const oldPos = world.positions.get(playerId);
          if (oldPos) {
            world.occupancy.delete(occupancyKey(oldPos.zone, oldPos.x, oldPos.y));
          }
          
          // Set new position
          const newPos: Position = { x, y, zone: zoneId };
          world.positions.set(playerId, newPos);
          world.occupancy.set(occupancyKey(zoneId, x, y), playerId);
          
          // Reset HP to max
          const stats = world.stats.get(playerId);
          if (stats) {
            stats.hp = stats.maxHp;
          }
          
          return newPos;
        }
      }
    }
  }
  
  return undefined;
}

export function entityAt(world: World, zoneId: ZoneId, x: number, y: number): EntityId | undefined {
  return world.occupancy.get(occupancyKey(zoneId, x, y));
}
