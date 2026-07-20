import type { Command } from "@game/shared";

/** Pure key code → move mapping: arrows, wasd, diagonals (yubn). Uses e.code for layout independence. */
export function keyToMove(code: string): Command | null {
  switch (code) {
    case "ArrowUp":
    case "KeyW":
      return { kind: "move", dx: 0, dy: -1 };
    case "ArrowDown":
    case "KeyS":
      return { kind: "move", dx: 0, dy: 1 };
    case "ArrowLeft":
    case "KeyA":
      return { kind: "move", dx: -1, dy: 0 };
    case "ArrowRight":
    case "KeyD":
      return { kind: "move", dx: 1, dy: 0 };
    case "KeyY":
      return { kind: "move", dx: -1, dy: -1 };
    case "KeyU":
      return { kind: "move", dx: 1, dy: -1 };
    case "KeyB":
      return { kind: "move", dx: -1, dy: 1 };
    case "KeyN":
      return { kind: "move", dx: 1, dy: 1 };
    default:
      return null;
  }
}
