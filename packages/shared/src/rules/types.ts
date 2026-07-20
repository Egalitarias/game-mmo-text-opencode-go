import type { EntityId, Item, Position } from "../model/world.js";

/** Everything a client can ask the sim to do. One variant per verb. */
export type Command =
  | { kind: "move"; dx: -1 | 0 | 1; dy: -1 | 0 | 1 }
  | { kind: "pickup" }
  | { kind: "drop"; slot: number };

/** Something that happened in the world; drives client logs and deltas. */
export type Event =
  | { kind: "moved"; entityId: EntityId; to: Position }
  | { kind: "bumped"; entityId: EntityId }
  | { kind: "joined"; entityId: EntityId; handle: string }
  | { kind: "left"; entityId: EntityId; handle: string }
  | { kind: "attacked"; attackerId: EntityId; targetId: EntityId; damage: number }
  | { kind: "died"; entityId: EntityId }
  | { kind: "respawned"; entityId: EntityId; at: Position }
  | { kind: "pickedUp"; entityId: EntityId; item: Item }
  | { kind: "dropped"; entityId: EntityId; item: Item; at: Position };
