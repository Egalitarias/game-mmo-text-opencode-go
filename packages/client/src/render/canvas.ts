import { tileAt } from "@game/shared";
import type { EntityId, EntityView, Zone } from "@game/shared";
import { buildAriaSummary, type FrameView } from "./grid.js";

const TILE_COLORS: Record<string, string> = {
  floor: "#2a2a2a",
  wall: "#4a4a4a",
  stairs_up: "#3a5a3a",
  stairs_down: "#5a3a3a",
};

const GLYPH_COLORS: Record<string, string> = {
  "@": "#00ff00", // player
  g: "#ff0000", // goblin
  o: "#ff8800", // orc
  s: "#888888", // skeleton
  $: "#ffff00", // gold
  "!": "#00ffff", // potion
  "?": "#ff00ff", // scroll
  default: "#ffffff",
};

/** Canvas2D renderer for better performance with large grids. */
export class CanvasGridRenderer {
  private ctx: CanvasRenderingContext2D;
  private cellSize: number;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    cellSize: number = 20,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to get 2D context");
    this.ctx = ctx;
    this.cellSize = cellSize;

    // Set up accessibility
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-live", "polite");
  }

  render(view: FrameView): void {
    const { zone, entities } = view;

    // Resize canvas if needed
    const width = zone.width * this.cellSize;
    const height = zone.height * this.cellSize;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    // Clear canvas
    this.ctx.fillStyle = "#000000";
    this.ctx.fillRect(0, 0, width, height);

    // Draw tiles
    for (let y = 0; y < zone.height; y++) {
      for (let x = 0; x < zone.width; x++) {
        const tile = tileAt(zone, x, y) ?? "wall";
        this.ctx.fillStyle = TILE_COLORS[tile] ?? "#4a4a4a";
        this.ctx.fillRect(x * this.cellSize, y * this.cellSize, this.cellSize, this.cellSize);
      }
    }

    // Draw entities
    this.ctx.font = `${this.cellSize * 0.8}px monospace`;
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";

    for (const entity of entities) {
      if (entity.pos.zone !== zone.id) continue;

      const x = entity.pos.x * this.cellSize + this.cellSize / 2;
      const y = entity.pos.y * this.cellSize + this.cellSize / 2;

      // Highlight player
      if (entity.id === view.youId) {
        this.ctx.fillStyle = "#003300";
        this.ctx.fillRect(
          entity.pos.x * this.cellSize,
          entity.pos.y * this.cellSize,
          this.cellSize,
          this.cellSize,
        );
      }

      // Draw glyph
      this.ctx.fillStyle = GLYPH_COLORS[entity.glyph] ?? GLYPH_COLORS.default;
      this.ctx.fillText(entity.glyph, x, y);
    }

    // Update accessibility
    this.canvas.setAttribute("aria-label", buildAriaSummary(view));
  }
}
