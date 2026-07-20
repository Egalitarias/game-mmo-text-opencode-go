import { tileAt } from "@game/shared";
import type { EntityId, EntityView, Zone } from "@game/shared";

export interface FrameView {
  zone: Zone;
  entities: EntityView[];
  youId: EntityId | undefined;
}

const TILE_GLYPH: Record<string, string> = { 
  floor: ".", 
  wall: "#",
  stairs_up: "<",
  stairs_down: ">"
};

/** Build a screen-reader-friendly summary of the game state. */
export function buildAriaSummary(view: FrameView): string {
  const you = view.entities.find((e) => e.id === view.youId);
  if (!you) return "Waiting to join game";

  const pos = you.pos;
  const others = view.entities.filter((e) => e.id !== view.youId).length;
  const handle = you.handle ?? "you";

  return `${handle} at position ${pos.x}, ${pos.y} in ${pos.zone}. ${others} other player${others === 1 ? "" : "s"} nearby.`;
}

/** Pure: build the glyph rows for a frame. Trivially testable, no DOM. */
export function buildRows(view: FrameView): string[] {
  const rows: string[][] = [];
  for (let y = 0; y < view.zone.height; y++) {
    const row: string[] = [];
    for (let x = 0; x < view.zone.width; x++) {
      row.push(TILE_GLYPH[tileAt(view.zone, x, y) ?? "wall"] ?? "?");
    }
    rows.push(row);
  }
  for (const e of view.entities) {
    if (e.pos.zone !== view.zone.id) continue;
    const row = rows[e.pos.y];
    if (row && e.pos.x >= 0 && e.pos.x < row.length) row[e.pos.x] = e.glyph;
  }
  return rows.map((r) => r.join(""));
}

/** Thin DOM shell around buildRows. */
export class DomGridRenderer {
  constructor(private readonly el: HTMLElement) {
    this.el.setAttribute("role", "img");
    this.el.setAttribute("aria-live", "polite");
  }

  render(view: FrameView): void {
    this.el.textContent = buildRows(view).join("\n");
    this.el.setAttribute("aria-label", buildAriaSummary(view));
  }
}
