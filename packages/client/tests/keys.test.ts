import { describe, expect, it } from "vitest";
import { keyToMove } from "../src/input/keys.js";

describe("keyToMove", () => {
  it("maps arrows to cardinal moves", () => {
    expect(keyToMove("ArrowUp")).toEqual({ kind: "move", dx: 0, dy: -1 });
    expect(keyToMove("ArrowDown")).toEqual({ kind: "move", dx: 0, dy: 1 });
    expect(keyToMove("ArrowLeft")).toEqual({ kind: "move", dx: -1, dy: 0 });
    expect(keyToMove("ArrowRight")).toEqual({ kind: "move", dx: 1, dy: 0 });
  });

  it("maps vi-keys including diagonals", () => {
    expect(keyToMove("h")).toEqual({ kind: "move", dx: -1, dy: 0 });
    expect(keyToMove("j")).toEqual({ kind: "move", dx: 0, dy: 1 });
    expect(keyToMove("k")).toEqual({ kind: "move", dx: 0, dy: -1 });
    expect(keyToMove("l")).toEqual({ kind: "move", dx: 1, dy: 0 });
    expect(keyToMove("y")).toEqual({ kind: "move", dx: -1, dy: -1 });
    expect(keyToMove("u")).toEqual({ kind: "move", dx: 1, dy: -1 });
    expect(keyToMove("b")).toEqual({ kind: "move", dx: -1, dy: 1 });
    expect(keyToMove("n")).toEqual({ kind: "move", dx: 1, dy: 1 });
  });

  it("ignores unrelated keys", () => {
    expect(keyToMove("x")).toBeNull();
    expect(keyToMove("Enter")).toBeNull();
    expect(keyToMove(" ")).toBeNull();
  });
});
