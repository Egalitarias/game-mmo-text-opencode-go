import { once } from "node:events";
import { describe, expect, it } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import { startHeartbeat } from "../src/gateway/heartbeat.js";

async function serve(
  intervalMs: number,
): Promise<{ wss: WebSocketServer; stop: () => void; url: string }> {
  const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await once(wss, "listening");
  const stop = startHeartbeat(wss, intervalMs);
  const addr = wss.address();
  if (typeof addr !== "object" || addr === null) throw new Error("server has no address");
  return { wss, stop, url: `ws://127.0.0.1:${addr.port}` };
}

describe("startHeartbeat", () => {
  it("keeps responsive clients and terminates ones that never pong", async () => {
    const { wss, stop, url } = await serve(25);
    try {
      const healthy = new WebSocket(url);
      const dead = new WebSocket(url, { autoPong: false }); // silently dead peer

      await Promise.all([once(healthy, "open"), once(dead, "open")]);
      await once(dead, "close"); // dropped after missing two pings

      expect(healthy.readyState).toBe(WebSocket.OPEN);
      healthy.close();
    } finally {
      stop();
      wss.close();
    }
  }, 10_000);
});
