import type { ServerMessage } from "@game/shared";

/**
 * One client connection, transport-agnostic. The real adapter wraps a `ws`
 * socket; tests use an in-memory fake. This seam keeps integration tests free
 * of ports and flakiness.
 */
export interface Connection {
  send(msg: ServerMessage): void;
  close(): void;
}
