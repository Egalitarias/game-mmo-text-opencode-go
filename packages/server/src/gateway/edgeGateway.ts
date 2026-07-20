import { WebSocketServer, WebSocket } from "ws";
import type { EntityId, ZoneId } from "@game/shared";

export interface GatewayConfig {
  port: number;
  host?: string;
  zoneWorkers: Map<ZoneId, string>; // zoneId -> worker URL
  stickySessionSecret?: string;
}

export interface ClientSession {
  clientId: string;
  entityId?: EntityId;
  currentZone?: ZoneId;
  socket: WebSocket;
  connectedAt: number;
}

interface ClientMessage {
  t: string;
  clientId?: string;
  entityId?: EntityId | undefined;
  initialZone?: ZoneId;
  handle?: string;
  seq?: number;
  cmd?: unknown;
  newZone?: ZoneId;
  data?: unknown;
  [key: string]: unknown;
}

interface ZoneMessage {
  t: string;
  clientId?: string;
  entityId?: EntityId;
  newZone?: ZoneId;
  data?: unknown;
  [key: string]: unknown;
}

/**
 * Edge gateway that accepts client connections and routes messages to zone workers.
 * Stateless - can be scaled horizontally behind a load balancer.
 */
export class EdgeGateway {
  private wss: WebSocketServer | null = null;
  private sessions: Map<string, ClientSession> = new Map();
  private zoneConnections: Map<ZoneId, WebSocket> = new Map();
  private config: GatewayConfig;

  constructor(config: GatewayConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    this.wss = new WebSocketServer({
      port: this.config.port,
      host: this.config.host,
    });

    this.wss.on("connection", (socket) => {
      this.handleClientConnection(socket);
    });

    // Connect to zone workers (non-blocking, failures are logged but don't prevent startup)
    const connectionPromises = Array.from(this.config.zoneWorkers.entries()).map(
      async ([zoneId, workerUrl]) => {
        try {
          await this.connectToZoneWorker(zoneId, workerUrl);
        } catch (error) {
          console.error(`Failed to connect to zone worker ${zoneId}:`, error);
        }
      }
    );

    // Wait for connection attempts (with timeout)
    await Promise.allSettled(connectionPromises);

    console.log(`Edge gateway started on ${this.config.host || "0.0.0.0"}:${this.config.port}`);
  }

  async stop(): Promise<void> {
    // Close all client connections
    for (const session of this.sessions.values()) {
      session.socket.close();
    }
    this.sessions.clear();

    // Close zone worker connections
    for (const connection of this.zoneConnections.values()) {
      connection.close();
    }
    this.zoneConnections.clear();

    // Close the server
    if (this.wss) {
      await new Promise<void>((resolve) => {
        this.wss!.close(() => resolve());
      });
      this.wss = null;
    }

    console.log("Edge gateway stopped");
  }

  private handleClientConnection(socket: WebSocket): void {
    const clientId = this.generateClientId();
    const session: ClientSession = {
      clientId,
      socket,
      connectedAt: Date.now(),
    };

    this.sessions.set(clientId, session);

    socket.on("message", (data: Buffer) => {
      this.handleClientMessage(session, data.toString());
    });

    socket.on("close", () => {
      this.handleClientDisconnection(session);
    });

    socket.on("error", (error) => {
      console.error(`Client ${clientId} error:`, error);
      this.handleClientDisconnection(session);
    });
  }

  private handleClientMessage(session: ClientSession, message: string): void {
    try {
      const parsed = JSON.parse(message) as ClientMessage;

      // Handle hello message to establish session
      if (parsed.t === "hello") {
        this.handleHelloMessage(session, parsed);
        return;
      }

      // Route message to appropriate zone worker
      if (session.currentZone) {
        this.routeToZone(session.currentZone, {
          ...parsed,
          clientId: session.clientId,
          entityId: session.entityId,
        });
      } else {
        // No zone assigned yet, reject
        session.socket.send(JSON.stringify({
          t: "error",
          message: "Not connected to a zone",
        }));
      }
    } catch (error) {
      console.error(`Failed to parse message from ${session.clientId}:`, error);
      session.socket.send(JSON.stringify({
        t: "error",
        message: "Invalid message format",
      }));
    }
  }

  private handleHelloMessage(session: ClientSession, message: ClientMessage): void {
    // Assign client to initial zone (default to "cave" for now)
    const initialZone: ZoneId = message.initialZone || "cave";
    session.currentZone = initialZone;

    // Forward hello to zone worker
    this.routeToZone(initialZone, {
      ...message,
      clientId: session.clientId,
    });
  }

  private handleClientDisconnection(session: ClientSession): void {
    // Notify zone worker about disconnection
    if (session.currentZone && session.entityId) {
      this.routeToZone(session.currentZone, {
        t: "disconnect",
        clientId: session.clientId,
        entityId: session.entityId,
      });
    }

    this.sessions.delete(session.clientId);
  }

  private async connectToZoneWorker(zoneId: ZoneId, workerUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(workerUrl);
      const timeout = setTimeout(() => {
        socket.close();
        reject(new Error(`Connection timeout for zone ${zoneId}`));
      }, 2000); // 2 second timeout

      socket.on("open", () => {
        clearTimeout(timeout);
        console.log(`Connected to zone worker ${zoneId} at ${workerUrl}`);
        this.zoneConnections.set(zoneId, socket);

        socket.on("message", (data: Buffer) => {
          this.handleZoneMessage(zoneId, data.toString());
        });

        socket.on("close", () => {
          console.log(`Disconnected from zone worker ${zoneId}`);
          this.zoneConnections.delete(zoneId);
        });

        socket.on("error", (error) => {
          console.error(`Zone worker ${zoneId} error:`, error);
        });

        resolve();
      });

      socket.on("error", (error) => {
        clearTimeout(timeout);
        console.error(`Failed to connect to zone worker ${zoneId}:`, error);
        reject(error);
      });
    });
  }

  private handleZoneMessage(zoneId: ZoneId, message: string): void {
    try {
      const parsed = JSON.parse(message) as ZoneMessage;

      // Route message to appropriate client
      if (parsed.clientId) {
        const session = this.sessions.get(parsed.clientId);
        if (session) {
          // Update session state if needed
          if (parsed.t === "welcome" && parsed.entityId) {
            session.entityId = parsed.entityId;
          }

          if (parsed.t === "zone_changed" && parsed.newZone) {
            session.currentZone = parsed.newZone;
          }

          // Forward message to client
          session.socket.send(JSON.stringify(parsed));
        }
      } else if (parsed.t === "broadcast") {
        // Broadcast to all clients in this zone
        for (const session of this.sessions.values()) {
          if (session.currentZone === zoneId) {
            session.socket.send(JSON.stringify(parsed.data));
          }
        }
      }
    } catch (error) {
      console.error(`Failed to parse message from zone ${zoneId}:`, error);
    }
  }

  private routeToZone(zoneId: ZoneId, message: ClientMessage): void {
    const connection = this.zoneConnections.get(zoneId);
    if (connection && connection.readyState === WebSocket.OPEN) {
      connection.send(JSON.stringify(message));
    } else {
      console.error(`No connection to zone worker ${zoneId}`);
    }
  }

  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Public methods for testing and monitoring
  getSessionCount(): number {
    return this.sessions.size;
  }

  getSession(clientId: string): ClientSession | undefined {
    return this.sessions.get(clientId);
  }

  getZoneConnectionCount(): number {
    return this.zoneConnections.size;
  }

  isConnectedToZone(zoneId: ZoneId): boolean {
    const connection = this.zoneConnections.get(zoneId);
    return connection !== undefined && connection.readyState === WebSocket.OPEN;
  }
}
