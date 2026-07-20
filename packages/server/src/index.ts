import { WebSocketServer } from "ws";
import { encodeServerMessage } from "@game/shared";
import { GameServer } from "./sim/gameServer.js";
import { startHeartbeat } from "./gateway/heartbeat.js";
import { installShutdownSignals } from "./gateway/shutdown.js";
import type { Connection } from "./gateway/connection.js";

const HOST = process.env.HOST ?? "127.0.0.1";
const PORT = Number(process.env.PORT ?? 3000);
/** Dead connections are dropped after missing two pings (~2× this interval). */
const HEARTBEAT_MS = 15_000;
/**
 * Largest accepted frame. Legit messages are tiny (chat caps at 240 chars);
 * oversized frames get the connection closed with 1009 instead of making the
 * server parse megabytes of JSON (ws default maxPayload is 100 MiB).
 */
const MAX_PAYLOAD_BYTES = 16 * 1024;

const game = new GameServer();
game.start(100);

const wss = new WebSocketServer({
  host: HOST,
  port: PORT,
  path: "/ws",
  maxPayload: MAX_PAYLOAD_BYTES,
});
const stopHeartbeat = startHeartbeat(wss, HEARTBEAT_MS);

wss.on("connection", (socket) => {
  const conn: Connection = {
    send: (msg) => {
      if (socket.readyState === socket.OPEN) socket.send(encodeServerMessage(msg));
    },
    close: () => socket.close(),
  };
  game.handleConnection(conn);
  socket.on("message", (data: Buffer) => {
    try {
      game.handleMessage(conn, data.toString());
    } catch (err) {
      // A bad message must never take down the process.
      console.error("message handler error", err);
    }
  });
  socket.on("close", () => game.handleClose(conn));
  socket.on("error", () => game.handleClose(conn));
});

console.log(`game server listening on ws://${HOST}:${PORT}/ws`);

installShutdownSignals({
  stopHeartbeat,
  stopGame: () => game.stop(),
  closeServer: () => wss.close(),
  exit: (code) => process.exit(code),
});
