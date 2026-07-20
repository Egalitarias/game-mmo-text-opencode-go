import type { EntityId, World } from "../model/world.js";
import { entityAt } from "../model/world.js";
import type { Event } from "./types.js";

/**
 * Pick up an item from the player's current position.
 * Returns pickup event if successful, empty array if no item or inventory full.
 */
export function pickupItem(world: World, playerId: EntityId): Event[] {
  const pos = world.positions.get(playerId);
  if (!pos) return [];

  const inventory = world.inventories.get(playerId);
  if (!inventory) return [];

  // Find item at player's position (search through items, not occupancy)
  let itemId: EntityId | undefined;
  for (const [id, itemPos] of world.positions) {
    if (
      id !== playerId &&
      itemPos.zone === pos.zone &&
      itemPos.x === pos.x &&
      itemPos.y === pos.y &&
      world.items.has(id)
    ) {
      itemId = id;
      break;
    }
  }
  
  if (itemId === undefined) return [];

  const item = world.items.get(itemId);
  if (!item) return [];

  // Check if inventory is full
  if (inventory.items.length >= inventory.maxSize) return [];

  // Add item to inventory
  inventory.items.push(item);

  // Remove item entity from world
  world.entities.delete(itemId);
  world.positions.delete(itemId);
  world.items.delete(itemId);
  world.occupancy.delete(`${pos.zone},${pos.x},${pos.y}`);

  return [{ kind: "pickedUp", entityId: playerId, item }];
}

/**
 * Drop an item from the player's inventory at their current position.
 * Returns drop event if successful, empty array if invalid slot or position occupied.
 */
export function dropItem(world: World, playerId: EntityId, slot: number): Event[] {
  const pos = world.positions.get(playerId);
  if (!pos) return [];

  const inventory = world.inventories.get(playerId);
  if (!inventory) return [];

  // Check if slot is valid
  if (slot < 0 || slot >= inventory.items.length) return [];

  const item = inventory.items[slot];
  if (!item) return [];

  // Check if current position is occupied (by another entity, not the player)
  const occupantId = entityAt(world, pos.zone, pos.x, pos.y);
  if (occupantId !== undefined && occupantId !== playerId) return [];

  // Remove item from inventory
  inventory.items.splice(slot, 1);

  // Create item entity at player's position
  const itemId = world.nextEntityId++;
  const glyphs: Record<string, string> = {
    potion: "!",
    sword: "/",
    shield: "]",
    gold: "$",
  };
  world.entities.set(itemId, { id: itemId, glyph: glyphs[item.kind] ?? "?" });
  world.positions.set(itemId, { ...pos });
  world.items.set(itemId, item);
  world.occupancy.set(`${pos.zone},${pos.x},${pos.y}`, itemId);

  return [{ kind: "dropped", entityId: playerId, item, at: pos }];
}
