import { parentPort, workerData } from "node:worker_threads";
import {
  makeWorld,
  generateZone,
  stepWorld,
  createRng,
  spawnMonster,
  spawnItem,
} from "@game/shared";
import type {
  ZoneId,
  EntityId,
  Command,
  Item,
  Entity,
  Stats,
  Inventory,
  PlayerSession,
} from "@game/shared";
import type { ZoneWorkerMessage, ZoneWorkerResponse } from "./zoneWorker.js";

if (!parentPort) {
  throw new Error("This script must be run as a worker thread");
}

const zoneId = (workerData as { zoneId: ZoneId }).zoneId;
const world = makeWorld();
const ZONE_SEED = 1337;

// Initialize zone
const zone = generateZone(zoneId, 40, 20, ZONE_SEED);
world.zones.set(zoneId, zone);

// Spawn initial monsters
const monsterCount = 5 + Math.floor(Math.random() * 6);
for (let i = 0; i < monsterCount; i++) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const x = 1 + Math.floor(Math.random() * (zone.width - 2));
    const y = 1 + Math.floor(Math.random() * (zone.height - 2));
    
    const aiKinds: Array<"aggressive" | "wander" | "flee"> = ["aggressive", "wander", "flee"];
    const aiKind = aiKinds[Math.floor(Math.random() * aiKinds.length)]!;
    const glyphs: Record<string, string> = { aggressive: "g", wander: "w", flee: "f" };
    const glyph = glyphs[aiKind] ?? "m";
    
    const monsterId = spawnMonster(world, zoneId, x, y, glyph, aiKind, 100);
    if (monsterId !== undefined) break;
  }
}

// Spawn initial items
const itemCount = 3 + Math.floor(Math.random() * 4);
for (let i = 0; i < itemCount; i++) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const x = 1 + Math.floor(Math.random() * (zone.width - 2));
    const y = 1 + Math.floor(Math.random() * (zone.height - 2));
    
    const itemKinds: Array<Item["kind"]> = ["potion", "sword", "shield", "gold"];
    const itemKind = itemKinds[Math.floor(Math.random() * itemKinds.length)]!;
    const item: Item = { kind: itemKind, name: itemKind, value: 10 };
    
    const itemId = spawnItem(world, zoneId, x, y, item);
    if (itemId !== undefined) break;
  }
}

// Command queue for this tick
const commandQueue: Map<EntityId, Command> = new Map();

function sendResponse(response: ZoneWorkerResponse): void {
  parentPort!.postMessage(response);
}

parentPort.on("message", (message: ZoneWorkerMessage) => {
  switch (message.type) {
    case "command":
      if (message.entityId !== undefined && message.cmd) {
        commandQueue.set(message.entityId, message.cmd);
      }
      break;

    case "transition_in": {
      if (message.entityId !== undefined && message.position && message.worldState) {
        // Add entity to this zone
        const { entityId, position, worldState } = message;
        
        if (worldState.entities) {
          for (const [id, entity] of worldState.entities) {
            if (id === entityId) {
              world.entities.set(id, entity);
              break;
            }
          }
        }
        
        world.positions.set(entityId, {
          x: position.x,
          y: position.y,
          zone: zoneId,
        });
        
        if (worldState.stats) {
          for (const [id, stats] of worldState.stats) {
            if (id === entityId) {
              world.stats.set(id, stats);
              break;
            }
          }
        }
        
        if (worldState.inventories) {
          for (const [id, inventory] of worldState.inventories) {
            if (id === entityId) {
              world.inventories.set(id, inventory);
              break;
            }
          }
        }
        
        if (worldState.players) {
          for (const [id, player] of worldState.players) {
            if (id === entityId) {
              world.players.set(id, player);
              break;
            }
          }
        }
      }
      break;
    }

    case "tick": {
      const rng = createRng((ZONE_SEED << 16) ^ world.tick);
      const cmds = Array.from(commandQueue.entries()).map(([entityId, cmd]) => ({
        entityId,
        cmd,
      }));
      
      const events = stepWorld(world, cmds, rng);
      commandQueue.clear();
      
      // Check for zone transitions
      for (const event of events) {
        if (event.kind === "zone_changed") {
          const entity = world.entities.get(event.entityId);
          const stats = world.stats.get(event.entityId);
          const inventory = world.inventories.get(event.entityId);
          const player = world.players.get(event.entityId);
          
          // Send transition request to gateway
          sendResponse({
            type: "transition_request",
            entityId: event.entityId,
            targetZone: event.to.zone,
            position: { x: event.to.x, y: event.to.y },
            worldState: {
              entities: entity ? new Map<EntityId, Entity>([[event.entityId, entity]]) : new Map<EntityId, Entity>(),
              stats: stats ? new Map<EntityId, Stats>([[event.entityId, stats]]) : new Map<EntityId, Stats>(),
              inventories: inventory ? new Map<EntityId, Inventory>([[event.entityId, inventory]]) : new Map<EntityId, Inventory>(),
              players: player ? new Map<EntityId, PlayerSession>([[event.entityId, player]]) : new Map<EntityId, PlayerSession>(),
            },
          });
          
          // Remove entity from this zone
          world.entities.delete(event.entityId);
          world.positions.delete(event.entityId);
          world.stats.delete(event.entityId);
          world.inventories.delete(event.entityId);
          world.players.delete(event.entityId);
        }
      }
      
      // Send events back to gateway
      if (events.length > 0) {
        sendResponse({
          type: "events",
          events,
        });
      }
      
      // Send state update
      sendResponse({
        type: "state_update",
        worldState: {
          tick: world.tick,
          entities: world.entities,
          positions: world.positions,
          stats: world.stats,
          inventories: world.inventories,
          players: world.players,
        },
      });
      break;
    }

    case "state":
      // Sync world state from gateway (e.g., after transition)
      if (message.worldState) {
        if (message.worldState.entities) {
          for (const [id, entity] of message.worldState.entities) {
            world.entities.set(id, entity);
          }
        }
        if (message.worldState.positions) {
          for (const [id, position] of message.worldState.positions) {
            world.positions.set(id, position);
          }
        }
        if (message.worldState.stats) {
          for (const [id, stats] of message.worldState.stats) {
            world.stats.set(id, stats);
          }
        }
        if (message.worldState.inventories) {
          for (const [id, inventory] of message.worldState.inventories) {
            world.inventories.set(id, inventory);
          }
        }
        if (message.worldState.players) {
          for (const [id, player] of message.worldState.players) {
            world.players.set(id, player);
          }
        }
      }
      break;
  }
});

// Send initial state
sendResponse({
  type: "state_update",
  worldState: {
    tick: world.tick,
    entities: world.entities,
    positions: world.positions,
    stats: world.stats,
    inventories: world.inventories,
    players: world.players,
  },
});
