import type { ServerMessage } from "@game/shared";

type ChatMessage = Extract<ServerMessage, { t: "chat" }>;

/** Ring buffer of recent chat per channel key, sent to clients on join. */
export class ChatHistory {
  private readonly buffers = new Map<string, ChatMessage[]>();

  constructor(private readonly capacity: number) {}

  push(key: string, msg: ChatMessage): void {
    const buf = this.buffers.get(key) ?? [];
    buf.push(msg);
    if (buf.length > this.capacity) buf.shift();
    this.buffers.set(key, buf);
  }

  recent(key: string): ChatMessage[] {
    return [...(this.buffers.get(key) ?? [])];
  }
}

export function globalChatKey(): string {
  return "global";
}

export function zoneChatKey(zoneId: string): string {
  return `zone:${zoneId}`;
}
