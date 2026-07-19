import { describe, expect, it } from "vitest";
import { parseClientMessage } from "../src/index.js";

describe("parseClientMessage", () => {
  it("accepts a valid hello", () => {
    expect(
      parseClientMessage(JSON.stringify({ t: "hello", handle: "Gary_1", protocolVersion: 1 })),
    ).toEqual({
      t: "hello",
      handle: "Gary_1",
      protocolVersion: 1,
    });
  });

  it("rejects invalid handles", () => {
    for (const handle of ["", "way too long handle name", "bad handle!", "<script>"]) {
      expect(
        parseClientMessage(JSON.stringify({ t: "hello", handle, protocolVersion: 1 })),
      ).toBeNull();
    }
  });

  it("rejects chat over the max length", () => {
    const text = "x".repeat(241);
    expect(parseClientMessage(JSON.stringify({ t: "chat", channel: "zone", text }))).toBeNull();
    expect(
      parseClientMessage(JSON.stringify({ t: "chat", channel: "zone", text: "x".repeat(240) })),
    ).not.toBeNull();
  });

  it("rejects garbage", () => {
    expect(parseClientMessage("not json")).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: "nope" }))).toBeNull();
    expect(parseClientMessage(JSON.stringify(null))).toBeNull();
  });
});
