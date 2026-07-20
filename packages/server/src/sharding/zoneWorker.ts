import { Worker } from "node:worker_threads";
import type { EntityId, ZoneId, World, Command, Event } from "@game/shared";

export interface ZoneWorkerMessage {
  type: "command" | "transition_in" | "transition_out" | "tick" | "state";
  entityId?: EntityId;
  cmd?: Command;
  targetZone?: ZoneId;
  position?: { x: number; y: number };
  events?: Event[];
  worldState?: Partial<World>;
}

export interface ZoneWorkerResponse {
  type: "events" | "transition_request" | "state_update" | "error";
  events?: Event[];
  targetZone?: ZoneId;
  entityId?: EntityId;
  position?: { x: number; y: number };
  worldState?: Partial<World>;
  error?: string;
}

/**
 * Manages a single zone in a dedicated worker thread.
 */
export class ZoneWorker {
  private worker: Worker | null = null;
  private messageHandlers: Array<(response: ZoneWorkerResponse) => void> = [];

  constructor(
    private readonly zoneId: ZoneId,
    private readonly workerScript: string
  ) {}

  async start(): Promise<void> {
    this.worker = new Worker(this.workerScript, {
      workerData: { zoneId: this.zoneId },
    });

    this.worker.on("message", (response: ZoneWorkerResponse) => {
      this.messageHandlers.forEach((handler) => handler(response));
    });

    this.worker.on("error", (error) => {
      console.error(`Zone worker ${this.zoneId} error:`, error);
    });

    this.worker.on("exit", (code) => {
      if (code !== 0) {
        console.error(`Zone worker ${this.zoneId} exited with code ${code}`);
      }
    });

    // Wait for worker to be ready
    await new Promise<void>((resolve) => {
      const handler = (response: ZoneWorkerResponse) => {
        if (response.type === "state_update") {
          this.removeHandler(handler);
          resolve();
        }
      };
      this.addHandler(handler);
    });
  }

  addHandler(handler: (response: ZoneWorkerResponse) => void): void {
    this.messageHandlers.push(handler);
  }

  removeHandler(handler: (response: ZoneWorkerResponse) => void): void {
    const index = this.messageHandlers.indexOf(handler);
    if (index !== -1) {
      this.messageHandlers.splice(index, 1);
    }
  }

  sendCommand(entityId: EntityId, cmd: Command): void {
    if (!this.worker) {
      throw new Error(`Zone worker ${this.zoneId} not started`);
    }

    const message: ZoneWorkerMessage = {
      type: "command",
      entityId,
      cmd,
    };

    this.worker.postMessage(message);
  }

  transitionEntityIn(
    entityId: EntityId,
    position: { x: number; y: number },
    worldState: Partial<World>
  ): void {
    if (!this.worker) {
      throw new Error(`Zone worker ${this.zoneId} not started`);
    }

    const message: ZoneWorkerMessage = {
      type: "transition_in",
      entityId,
      position,
      worldState,
    };

    this.worker.postMessage(message);
  }

  tick(): void {
    if (!this.worker) {
      throw new Error(`Zone worker ${this.zoneId} not started`);
    }

    const message: ZoneWorkerMessage = {
      type: "tick",
    };

    this.worker.postMessage(message);
  }

  async stop(): Promise<void> {
    if (!this.worker) return;

    await this.worker.terminate();
    this.worker = null;
  }
}
