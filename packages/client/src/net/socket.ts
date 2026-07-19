import type { ClientMessage, ServerMessage } from "@game/shared";

export interface SocketHandlers {
  onMessage(msg: ServerMessage): void;
  onOpen(): void;
  onClose(): void;
}

const RECONNECT_MS = 1000;

/** WebSocket wrapper: JSON protocol, auto-reconnect, no game logic. */
export class GameSocket {
  private ws: WebSocket | undefined;
  private closedByUser = false;

  constructor(
    private readonly url: string,
    private readonly handlers: SocketHandlers,
  ) {}

  connect(): void {
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => this.handlers.onOpen();
    ws.onmessage = (ev: MessageEvent<string>) => {
      this.handlers.onMessage(JSON.parse(ev.data) as ServerMessage);
    };
    ws.onclose = () => {
      this.handlers.onClose();
      if (!this.closedByUser) setTimeout(() => this.connect(), RECONNECT_MS);
    };
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  close(): void {
    this.closedByUser = true;
    this.ws?.close();
  }
}
