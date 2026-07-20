import { ZoneWorker } from "./zoneWorker.js";
import type { EntityId, ZoneId, Command, Event, World } from "@game/shared";

export interface ShardedWorldState {
  zones: Map<ZoneId, Partial<World>>;
  entityZoneMap: Map<EntityId, ZoneId>;
}

/**
 * Manages multiple zone workers and coordinates between them.
 * Routes commands to the correct zone and handles zone transitions.
 */
export class ZoneShardManager {
  private workers: Map<ZoneId, ZoneWorker> = new Map();
  private entityZoneMap: Map<EntityId, ZoneId> = new Map();
  private eventHandlers: Array<(zoneId: ZoneId, events: Event[]) => void> = [];

  constructor(private readonly workerScript: string) {}

  async startZone(zoneId: ZoneId): Promise<void> {
    if (this.workers.has(zoneId)) {
      throw new Error(`Zone ${zoneId} already started`);
    }

    const worker = new ZoneWorker(zoneId, this.workerScript);
    
    worker.addHandler((response) => {
      if (response.type === "events" && response.events) {
        this.eventHandlers.forEach((handler) => handler(zoneId, response.events!));
      } else if (response.type === "transition_request") {
        this.handleTransitionRequest(zoneId, response);
      }
    });

    await worker.start();
    this.workers.set(zoneId, worker);
  }

  async stopZone(zoneId: ZoneId): Promise<void> {
    const worker = this.workers.get(zoneId);
    if (!worker) {
      throw new Error(`Zone ${zoneId} not found`);
    }

    await worker.stop();
    this.workers.delete(zoneId);
    
    // Remove all entities from this zone
    for (const [entityId, zone] of this.entityZoneMap.entries()) {
      if (zone === zoneId) {
        this.entityZoneMap.delete(entityId);
      }
    }
  }

  async stopAll(): Promise<void> {
    const stopPromises = Array.from(this.workers.keys()).map((zoneId) =>
      this.stopZone(zoneId)
    );
    await Promise.all(stopPromises);
  }

  registerEntity(entityId: EntityId, zoneId: ZoneId): void {
    if (!this.workers.has(zoneId)) {
      throw new Error(`Zone ${zoneId} not found`);
    }
    this.entityZoneMap.set(entityId, zoneId);
  }

  unregisterEntity(entityId: EntityId): void {
    this.entityZoneMap.delete(entityId);
  }

  getEntityZone(entityId: EntityId): ZoneId | undefined {
    return this.entityZoneMap.get(entityId);
  }

  sendCommand(entityId: EntityId, cmd: Command): void {
    const zoneId = this.entityZoneMap.get(entityId);
    if (!zoneId) {
      throw new Error(`Entity ${entityId} not registered in any zone`);
    }

    const worker = this.workers.get(zoneId);
    if (!worker) {
      throw new Error(`Zone ${zoneId} not found`);
    }

    worker.sendCommand(entityId, cmd);
  }

  tickAll(): void {
    for (const worker of this.workers.values()) {
      worker.tick();
    }
  }

  addEventHandler(handler: (zoneId: ZoneId, events: Event[]) => void): void {
    this.eventHandlers.push(handler);
  }

  removeEventHandler(handler: (zoneId: ZoneId, events: Event[]) => void): void {
    const index = this.eventHandlers.indexOf(handler);
    if (index !== -1) {
      this.eventHandlers.splice(index, 1);
    }
  }

  private handleTransitionRequest(
    fromZone: ZoneId,
    response: {
      entityId?: EntityId;
      targetZone?: ZoneId;
      position?: { x: number; y: number };
      worldState?: Partial<World>;
    }
  ): void {
    const { entityId, targetZone, position, worldState } = response;

    if (!entityId || !targetZone || !position || !worldState) {
      console.error("Invalid transition request");
      return;
    }

    const targetWorker = this.workers.get(targetZone);
    if (!targetWorker) {
      console.error(`Target zone ${targetZone} not found for transition`);
      return;
    }

    // Update entity zone mapping
    this.entityZoneMap.set(entityId, targetZone);

    // Transition entity to target zone
    targetWorker.transitionEntityIn(entityId, position, worldState);
  }

  getZoneCount(): number {
    return this.workers.size;
  }

  getEntityCount(): number {
    return this.entityZoneMap.size;
  }

  getZones(): ZoneId[] {
    return Array.from(this.workers.keys());
  }
}
