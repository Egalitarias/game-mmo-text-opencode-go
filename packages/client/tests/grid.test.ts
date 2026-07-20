// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { generateZone } from "@game/shared";
import { buildRows, DomGridRenderer } from "../src/render/grid.js";

const zone = generateZone("cave", 10, 5, 1);

// generateZone puts pillars at (width/4, height/2) and mirrored: (2,2) and (7,2) here.

describe("buildRows", () => {
  it("renders walls and floors", () => {
    const rows = buildRows({ zone, entities: [], youId: undefined });
    expect(rows[0]).toBe("##########");
    expect(rows[1]).toBe("#........#");
    expect(rows[2]).toBe("#.#....#.#");
    expect(rows).toHaveLength(5);
  });

  it("draws entities over terrain", () => {
    const rows = buildRows({
      zone,
      entities: [{ id: 1, glyph: "@", pos: { x: 3, y: 2, zone: "cave" }, handle: "A" }],
      youId: 1,
    });
    expect(rows[2]).toBe("#.#@...#.#");
  });

  it("skips entities in other zones", () => {
    const rows = buildRows({
      zone,
      entities: [{ id: 2, glyph: "@", pos: { x: 3, y: 2, zone: "elsewhere" } }],
      youId: undefined,
    });
    expect(rows[2]).toBe("#.#....#.#");
  });
});

describe("DomGridRenderer", () => {
  it("writes rows into the element as text", () => {
    const el = document.createElement("pre");
    new DomGridRenderer(el).render({ zone, entities: [], youId: undefined });
    expect(el.textContent).toContain("##########");
  });
});
