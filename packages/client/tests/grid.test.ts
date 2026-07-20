// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { generateZone } from "@game/shared";
import { buildAriaSummary, buildRows, DomGridRenderer } from "../src/render/grid.js";

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

  it("sets role=img and aria-live=polite on construction", () => {
    const el = document.createElement("pre");
    new DomGridRenderer(el);
    expect(el.getAttribute("role")).toBe("img");
    expect(el.getAttribute("aria-live")).toBe("polite");
  });

  it("sets aria-label with a summary on render", () => {
    const el = document.createElement("pre");
    const renderer = new DomGridRenderer(el);
    renderer.render({
      zone,
      entities: [{ id: 1, glyph: "@", pos: { x: 3, y: 2, zone: "cave" }, handle: "Alice" }],
      youId: 1,
    });
    expect(el.getAttribute("aria-label")).toContain("Alice");
    expect(el.getAttribute("aria-label")).toContain("3, 2");
  });
});

describe("buildAriaSummary", () => {
  it("returns waiting message when no player", () => {
    const summary = buildAriaSummary({ zone, entities: [], youId: undefined });
    expect(summary).toBe("Waiting to join game");
  });

  it("includes handle, position, and zone", () => {
    const summary = buildAriaSummary({
      zone,
      entities: [{ id: 1, glyph: "@", pos: { x: 5, y: 3, zone: "cave" }, handle: "Bob" }],
      youId: 1,
    });
    expect(summary).toContain("Bob");
    expect(summary).toContain("5, 3");
    expect(summary).toContain("cave");
  });

  it("counts other players correctly", () => {
    const summary = buildAriaSummary({
      zone,
      entities: [
        { id: 1, glyph: "@", pos: { x: 1, y: 1, zone: "cave" }, handle: "You" },
        { id: 2, glyph: "@", pos: { x: 2, y: 2, zone: "cave" }, handle: "Other" },
      ],
      youId: 1,
    });
    expect(summary).toContain("1 other player");
  });

  it("uses plural for multiple other players", () => {
    const summary = buildAriaSummary({
      zone,
      entities: [
        { id: 1, glyph: "@", pos: { x: 1, y: 1, zone: "cave" }, handle: "You" },
        { id: 2, glyph: "@", pos: { x: 2, y: 2, zone: "cave" }, handle: "A" },
        { id: 3, glyph: "@", pos: { x: 3, y: 3, zone: "cave" }, handle: "B" },
      ],
      youId: 1,
    });
    expect(summary).toContain("2 other players");
  });

  it("says 0 other players when alone", () => {
    const summary = buildAriaSummary({
      zone,
      entities: [{ id: 1, glyph: "@", pos: { x: 1, y: 1, zone: "cave" }, handle: "Solo" }],
      youId: 1,
    });
    expect(summary).toContain("0 other players");
  });
});
