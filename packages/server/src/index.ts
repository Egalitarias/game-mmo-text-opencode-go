import { WebSocketServer } from "ws";
import { encodeServerMessage } from "@game/shared";
import { GameServer } from "./sim/gameServer.js";
import type { Connection } from "./gateway/connection.js";

const HOST = process.env.HOST ?? "127.0.0.1";
const PORT = Number(process.env.PORT ?? 3000);

const game = new GameServer();
game.start(100);

const wss = new WebSocketServer({ host: HOST, port: PORT, path: "/ws" });

wss.on("connection", (socket) => {
  const conn: Connection = {
    send: (msg) => {
      if (socket.readyState === socket.OPEN) socket.send(encodeServerMessage(msg));
    },
    close: () => socket.close(),
  };
  game.handleConnection(conn);
  socket.on("message", (data: Buffer) => {
    game.handleMessage(conn, data.toString());
  });
  socket.on("close", () => game.handleClose(conn));
  socket.on("error", () => game.handleClose(conn));
});

console.log(`game server listening on ws://${HOST}:${PORT}/ws`);

process.on("SIGINT", () => {
  game.stop();
  wss.close();
  process.exit(0);
});
