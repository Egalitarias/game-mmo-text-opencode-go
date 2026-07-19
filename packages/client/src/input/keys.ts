import type { Command } from "@game/shared";

/** Pure key → move mapping: arrows, vi-keys (hjkl), diagonals (yubn). */
export function keyToMove(key: string): Command | null {
  switch (key) {
    case "ArrowUp":
    case "k":
      return { kind: "move", dx: 0, dy: -1 };
    case "ArrowDown":
    case "j":
      return { kind: "move", dx: 0, dy: 1 };
    case "ArrowLeft":
    case "h":
      return { kind: "move", dx: -1, dy: 0 };
    case "ArrowRight":
    case "l":
      return { kind: "move", dx: 1, dy: 0 };
    case "y":
      return { kind: "move", dx: -1, dy: -1 };
    case "u":
      return { kind: "move", dx: 1, dy: -1 };
    case "b":
      return { kind: "move", dx: -1, dy: 1 };
    case "n":
      return { kind: "move", dx: 1, dy: 1 };
    default:
      return null;
  }
}
