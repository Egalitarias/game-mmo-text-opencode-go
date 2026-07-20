import { z } from "zod";
import type { EntityId, Position } from "../model/world.js";
import type { Command, Event } from "../rules/types.js";

export const PROTOCOL_VERSION = 1;

export type ChatChannel = "zone" | "global";

export const CHAT_MAX_LENGTH = 240;
export const HANDLE_PATTERN = /^[a-zA-Z0-9_-]{1,16}$/;

// ── client → server ──────────────────────────────────────────────────────────

export type ClientMessage =
  | { t: "hello"; handle: string; protocolVersion: number }
  | { t: "cmd"; seq: number; cmd: Command }
  | { t: "chat"; channel: ChatChannel; text: string }
  | { t: "ping"; clientTime: number };

const commandSchema = z.object({
  kind: z.literal("move"),
  dx: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
  dy: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
});

/**
 * Drift guard: the wire schema and the Command type must be mutually
 * assignable (identical). Without this, adding a command kind to Command but
 * not to the schema would compile fine and silently parse-fail at runtime.
 * (z.ZodType<Command> alone only checks one direction.)
 */
type CommandSchemaDriftGuard = [z.infer<typeof commandSchema>, Command] extends [
  Command,
  z.infer<typeof commandSchema>,
]
  ? true
  : "Command and commandSchema have drifted apart";
const _commandDriftGuard: CommandSchemaDriftGuard = true;

const clientMessageSchema = z.discriminatedUnion("t", [
  z.object({
    t: z.literal("hello"),
    handle: z.string().regex(HANDLE_PATTERN),
    protocolVersion: z.number().int().positive(),
  }),
  z.object({ t: z.literal("cmd"), seq: z.number().int().nonnegative(), cmd: commandSchema }),
  z.object({
    t: z.literal("chat"),
    channel: z.union([z.literal("zone"), z.literal("global")]),
    text: z.string().min(1).max(CHAT_MAX_LENGTH),
  }),
  z.object({ t: z.literal("ping"), clientTime: z.number() }),
]);

/** Parse untrusted wire data into a typed ClientMessage, or null if invalid. */
export function parseClientMessage(data: unknown): ClientMessage | null {
  if (typeof data !== "string") return null;
  let json: unknown;
  try {
    json = JSON.parse(data);
  } catch {
    return null;
  }
  const result = clientMessageSchema.safeParse(json);
  return result.success ? result.data : null;
}

// ── server → client ──────────────────────────────────────────────────────────

export interface EntityView {
  id: EntityId;
  glyph: string;
  pos: Position;
  /** Present for player-controlled entities. */
  handle?: string;
}

export type ServerMessage =
  | {
      t: "welcome";
      entityId: EntityId;
      zoneId: string;
      zoneSeed: number;
      zoneWidth: number;
      zoneHeight: number;
      tick: number;
      roster: string[];
    }
  | { t: "snapshot"; tick: number; entities: EntityView[] }
  | { t: "delta"; tick: number; changed: EntityView[]; removed: EntityId[] }
  | { t: "events"; tick: number; events: Event[] }
  | { t: "chat"; from: string; channel: ChatChannel; text: string; tick: number }
  | { t: "reject"; seq: number; reason: string }
  | { t: "pong"; clientTime: number; serverTime: number };

export function encodeServerMessage(msg: ServerMessage): string {
  return JSON.stringify(msg);
}
