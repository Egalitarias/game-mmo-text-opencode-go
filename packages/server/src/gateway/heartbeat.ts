import type { WebSocket, WebSocketServer } from "ws";

/**
 * WS-protocol-level liveness check. Every interval, ping each socket and drop
 * any that failed to pong the previous ping. Browsers answer pings
 * automatically, so only genuinely dead peers (closed laptop, dropped network)
 * are terminated — freeing their entities and handles via the normal "close"
 * path. A side benefit: regular frames keep proxies from killing idle sockets.
 *
 * Lives in the transport adapter, not the sim: ping/pong is a property of the
 * wire, not the game. This is distinct from the app-level "ping" message,
 * which exists for client latency measurement.
 */
export function startHeartbeat(wss: WebSocketServer, intervalMs: number): () => void {
  const alive = new WeakSet<WebSocket>();

  wss.on("connection", (socket) => {
    alive.add(socket);
    socket.on("pong", () => alive.add(socket));
  });

  const timer = setInterval(() => {
    for (const socket of wss.clients) {
      if (alive.has(socket)) {
        alive.delete(socket);
        socket.ping();
      } else {
        socket.terminate();
      }
    }
  }, intervalMs);

  return () => clearInterval(timer);
}
