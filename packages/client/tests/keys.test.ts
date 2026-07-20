import { describe, expect, it } from "vitest";
import { keyToMove } from "../src/input/keys.js";

describe("keyToMove", () => {
  it("maps arrow codes to cardinal moves", () => {
    expect(keyToMove("ArrowUp")).toEqual({ kind: "move", dx: 0, dy: -1 });
    expect(keyToMove("ArrowDown")).toEqual({ kind: "move", dx: 0, dy: 1 });
    expect(keyToMove("ArrowLeft")).toEqual({ kind: "move", dx: -1, dy: 0 });
    expect(keyToMove("ArrowRight")).toEqual({ kind: "move", dx: 1, dy: 0 });
  });

  it("maps wasd codes including diagonals", () => {
    expect(keyToMove("KeyA")).toEqual({ kind: "move", dx: -1, dy: 0 });
    expect(keyToMove("KeyS")).toEqual({ kind: "move", dx: 0, dy: 1 });
    expect(keyToMove("KeyW")).toEqual({ kind: "move", dx: 0, dy: -1 });
    expect(keyToMove("KeyD")).toEqual({ kind: "move", dx: 1, dy: 0 });
    expect(keyToMove("KeyY")).toEqual({ kind: "move", dx: -1, dy: -1 });
    expect(keyToMove("KeyU")).toEqual({ kind: "move", dx: 1, dy: -1 });
    expect(keyToMove("KeyB")).toEqual({ kind: "move", dx: -1, dy: 1 });
    expect(keyToMove("KeyN")).toEqual({ kind: "move", dx: 1, dy: 1 });
  });

  it("works regardless of shift or caps lock (e.code is layout-independent)", () => {
    // e.code for W is always "KeyW" regardless of Shift/CapsLock producing "W" vs "w" in e.key
    expect(keyToMove("KeyW")).toEqual({ kind: "move", dx: 0, dy: -1 });
    expect(keyToMove("KeyA")).toEqual({ kind: "move", dx: -1, dy: 0 });
  });

  it("ignores unrelated codes", () => {
    expect(keyToMove("KeyX")).toBeNull();
    expect(keyToMove("Enter")).toBeNull();
    expect(keyToMove("Space")).toBeNull();
  });
});
