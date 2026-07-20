import type { ClientMessage, ServerMessage } from "@game/shared";
import { encodeClientMessage, decodeServerMessage } from "@game/shared";

export interface SocketHandlers {
  onMessage(msg: ServerMessage): void;
  onOpen(): void;
  onClose(): void;
}

const RECONNECT_MS = 1000;

/** WebSocket wrapper: Binary protocol (MessagePack), auto-reconnect, no game logic. */
export class GameSocket {
  private ws: WebSocket | undefined;

  constructor(
    private readonly url: string,
    private readonly handlers: SocketHandlers,
  ) {}

  /** Open the socket unless one is already open or connecting. */
  connect(): void {
    if (
      this.ws !== undefined &&
      (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)
    ) {
      return;
    }
    const ws = new WebSocket(this.url);
    ws.binaryType = "arraybuffer";
    this.ws = ws;
    ws.onopen = () => this.handlers.onOpen();
    ws.onmessage = (ev: MessageEvent<ArrayBuffer>) => {
      const msg = decodeServerMessage(new Uint8Array(ev.data));
      if (msg) {
        this.handlers.onMessage(msg);
      }
    };
    ws.onclose = () => {
      this.handlers.onClose();
      setTimeout(() => this.connect(), RECONNECT_MS);
    };
  }

  isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(encodeClientMessage(msg));
    }
  }
}
