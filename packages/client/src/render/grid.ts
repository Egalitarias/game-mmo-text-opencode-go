import { tileAt } from "@game/shared";
import type { EntityId, EntityView, Zone } from "@game/shared";

export interface FrameView {
  zone: Zone;
  entities: EntityView[];
  youId: EntityId | undefined;
}

const TILE_GLYPH: Record<string, string> = { floor: ".", wall: "#" };

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
  constructor(private readonly el: HTMLElement) {}

  render(view: FrameView): void {
    this.el.textContent = buildRows(view).join("\n");
  }
}
