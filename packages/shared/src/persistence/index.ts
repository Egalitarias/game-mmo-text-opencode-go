import type { World, Zone, ZoneConnection, Item, Inventory } from "../model/world.js";
import { makeWorld } from "../model/world.js";

/**
 * Serializable representation of a World for persistence.
 * Maps are converted to arrays for JSON serialization.
 */
export interface WorldSnapshot {
  tick: number;
  nextEntityId: number;
  zones: Array<{
    id: string;
    width: number;
    height: number;
    tiles: string[];
    connections?: Array<[string, ZoneConnection]> | undefined;
  }>;
  entities: Array<[number, { id: number; glyph: string }]>;
  positions: Array<[number, { x: number; y: number; zone: string }]>;
  players: Array<[number, { handle: string; connectedAt: number }]>;
  stats: Array<[number, { hp: number; maxHp: number; attack: number; defense: number }]>;
  ais: Array<[number, { kind: "aggressive" | "wander" | "flee" }]>;
  energies: Array<[number, { current: number; speed: number }]>;
  items: Array<[number, Item]>;
  inventories: Array<[number, Inventory]>;
  occupancy: Array<[string, number]>;
}

/**
 * Serialize a World to a JSON-compatible snapshot.
 */
export function serializeWorld(world: World): WorldSnapshot {
  return {
    tick: world.tick,
    nextEntityId: world.nextEntityId,
    zones: Array.from(world.zones.entries()).map(([id, zone]) => {
      const zoneData: WorldSnapshot["zones"][0] = {
        id,
        width: zone.width,
        height: zone.height,
        tiles: zone.tiles,
      };
      if (zone.connections) {
        zoneData.connections = Array.from(zone.connections.entries());
      }
      return zoneData;
    }),
    entities: Array.from(world.entities.entries()),
    positions: Array.from(world.positions.entries()),
    players: Array.from(world.players.entries()),
    stats: Array.from(world.stats.entries()),
    ais: Array.from(world.ais.entries()),
    energies: Array.from(world.energies.entries()),
    items: Array.from(world.items.entries()),
    inventories: Array.from(world.inventories.entries()),
    occupancy: Array.from(world.occupancy.entries()),
  };
}

/**
 * Deserialize a WorldSnapshot back to a World.
 */
export function deserializeWorld(snapshot: WorldSnapshot): World {
  const world = makeWorld();
  
  world.tick = snapshot.tick;
  world.nextEntityId = snapshot.nextEntityId;
  
  // Reconstruct zones
  for (const zoneData of snapshot.zones) {
    const zone: Zone = {
      id: zoneData.id,
      width: zoneData.width,
      height: zoneData.height,
      tiles: zoneData.tiles as Zone["tiles"],
    };
    if (zoneData.connections) {
      zone.connections = new Map(zoneData.connections);
    }
    world.zones.set(zoneData.id, zone);
  }
  
  // Reconstruct all entity maps
  world.entities = new Map(snapshot.entities);
  world.positions = new Map(snapshot.positions);
  world.players = new Map(snapshot.players);
  world.stats = new Map(snapshot.stats);
  world.ais = new Map(snapshot.ais);
  world.energies = new Map(snapshot.energies);
  
  for (const [id, item] of snapshot.items) {
    world.items.set(id, item);
  }
  
  for (const [id, inv] of snapshot.inventories) {
    world.inventories.set(id, inv);
  }
  
  world.occupancy = new Map(snapshot.occupancy);
  
  return world;
}

/**
 * Interface for world persistence.
 */
export interface WorldStore {
  save(world: World): Promise<void>;
  load(): Promise<World | null>;
}
