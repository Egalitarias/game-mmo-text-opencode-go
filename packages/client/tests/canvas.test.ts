// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { CanvasGridRenderer } from "../src/render/canvas.js";
import type { FrameView } from "../src/render/grid.js";
import type { Zone } from "@game/shared";

describe("CanvasGridRenderer", () => {
  let canvas: HTMLCanvasElement;
  let renderer: CanvasGridRenderer;
  let mockCtx: any;

  beforeEach(() => {
    // Mock canvas context
    mockCtx = {
      fillStyle: "",
      fillRect: vi.fn(),
      font: "",
      textAlign: "",
      textBaseline: "",
      fillText: vi.fn(),
    };

    canvas = document.createElement("canvas");
    canvas.getContext = vi.fn().mockReturnValue(mockCtx);
    document.body.appendChild(canvas);
    renderer = new CanvasGridRenderer(canvas, 20);
  });

  it("should initialize with correct accessibility attributes", () => {
    expect(canvas.getAttribute("role")).toBe("img");
    expect(canvas.getAttribute("aria-live")).toBe("polite");
  });

  it("should resize canvas to match zone dimensions", () => {
    const zone: Zone = {
      id: "test",
      width: 10,
      height: 8,
      tiles: new Array(80).fill("floor"),
    };

    const view: FrameView = {
      zone,
      entities: [],
      youId: undefined,
    };

    renderer.render(view);

    expect(canvas.width).toBe(200); // 10 * 20
    expect(canvas.height).toBe(160); // 8 * 20
  });

  it("should render tiles correctly", () => {
    const zone: Zone = {
      id: "test",
      width: 3,
      height: 3,
      tiles: [
        "wall", "wall", "wall",
        "wall", "floor", "wall",
        "wall", "wall", "wall",
      ],
    };

    const view: FrameView = {
      zone,
      entities: [],
      youId: undefined,
    };

    renderer.render(view);

    // Canvas should be sized correctly
    expect(canvas.width).toBe(60);
    expect(canvas.height).toBe(60);
  });

  it("should render entities on top of tiles", () => {
    const zone: Zone = {
      id: "test",
      width: 3,
      height: 3,
      tiles: new Array(9).fill("floor"),
    };

    const view: FrameView = {
      zone,
      entities: [
        { id: 1, glyph: "@", pos: { x: 1, y: 1, zone: "test" } },
      ],
      youId: 1,
    };

    renderer.render(view);

    // Should not throw and should render successfully
    expect(canvas.width).toBe(60);
    expect(canvas.height).toBe(60);
  });

  it("should highlight player entity", () => {
    const zone: Zone = {
      id: "test",
      width: 3,
      height: 3,
      tiles: new Array(9).fill("floor"),
    };

    const view: FrameView = {
      zone,
      entities: [
        { id: 1, glyph: "@", pos: { x: 1, y: 1, zone: "test" }, handle: "player1" },
      ],
      youId: 1,
    };

    renderer.render(view);

    // Should update aria-label with player info
    const ariaLabel = canvas.getAttribute("aria-label");
    expect(ariaLabel).toContain("player1");
    expect(ariaLabel).toContain("1, 1");
  });

  it("should update aria-label with accessibility summary", () => {
    const zone: Zone = {
      id: "test",
      width: 3,
      height: 3,
      tiles: new Array(9).fill("floor"),
    };

    const view: FrameView = {
      zone,
      entities: [
        { id: 1, glyph: "@", pos: { x: 1, y: 1, zone: "test" }, handle: "alice" },
        { id: 2, glyph: "g", pos: { x: 2, y: 2, zone: "test" } },
      ],
      youId: 1,
    };

    renderer.render(view);

    const ariaLabel = canvas.getAttribute("aria-label");
    expect(ariaLabel).toContain("alice");
    expect(ariaLabel).toContain("1 other player");
  });

  it("should handle entities in different zones", () => {
    const zone: Zone = {
      id: "test",
      width: 3,
      height: 3,
      tiles: new Array(9).fill("floor"),
    };

    const view: FrameView = {
      zone,
      entities: [
        { id: 1, glyph: "@", pos: { x: 1, y: 1, zone: "test" } },
        { id: 2, glyph: "g", pos: { x: 2, y: 2, zone: "other" } },
      ],
      youId: 1,
    };

    renderer.render(view);

    // Should render without errors
    expect(canvas.width).toBe(60);
    expect(canvas.height).toBe(60);
  });

  it("should throw error if canvas context is unavailable", () => {
    const badCanvas = document.createElement("canvas");
    // Mock getContext to return null
    badCanvas.getContext = () => null;

    expect(() => new CanvasGridRenderer(badCanvas)).toThrow("Failed to get 2D context");
  });
});
