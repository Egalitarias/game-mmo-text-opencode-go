import type { Command } from "@game/shared";

/** Pure key → move mapping: arrows, wasd, diagonals (yubn). */
export function keyToMove(key: string): Command | null {
  switch (key) {
    case "ArrowUp":
    case "w":
      return { kind: "move", dx: 0, dy: -1 };
    case "ArrowDown":
    case "s":
      return { kind: "move", dx: 0, dy: 1 };
    case "ArrowLeft":
    case "a":
      return { kind: "move", dx: -1, dy: 0 };
    case "ArrowRight":
    case "d":
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
