import { describe, expect, it, vi } from "vitest";
import { installShutdownSignals, makeShutdownHandler } from "../src/gateway/shutdown.js";

function makeDeps() {
  return {
    stopHeartbeat: vi.fn(),
    stopGame: vi.fn(),
    closeServer: vi.fn(),
    exit: vi.fn(),
  };
}

describe("makeShutdownHandler", () => {
  it("calls all cleanup functions and exits with code 0", async () => {
    const deps = makeDeps();
    const handler = makeShutdownHandler(deps);

    await handler();

    expect(deps.stopHeartbeat).toHaveBeenCalledOnce();
    expect(deps.stopGame).toHaveBeenCalledOnce();
    expect(deps.closeServer).toHaveBeenCalledOnce();
    expect(deps.exit).toHaveBeenCalledOnce();
    expect(deps.exit).toHaveBeenCalledWith(0);
  });

  it("is idempotent — second call is a no-op", async () => {
    const deps = makeDeps();
    const handler = makeShutdownHandler(deps);

    await handler();
    await handler();
    await handler();

    expect(deps.stopHeartbeat).toHaveBeenCalledOnce();
    expect(deps.stopGame).toHaveBeenCalledOnce();
    expect(deps.closeServer).toHaveBeenCalledOnce();
    expect(deps.exit).toHaveBeenCalledOnce();
  });

  it("calls cleanup in order: heartbeat, game, server, exit", async () => {
    const order: string[] = [];
    const deps = {
      stopHeartbeat: () => { order.push("heartbeat"); },
      stopGame: () => { order.push("game"); },
      closeServer: () => { order.push("server"); },
      exit: () => { order.push("exit"); },
    };
    const handler = makeShutdownHandler(deps);

    await handler();

    expect(order).toEqual(["heartbeat", "game", "server", "exit"]);
  });
});

describe("installShutdownSignals", () => {
  it("registers handlers for both SIGINT and SIGTERM", () => {
    const onSpy = vi.spyOn(process, "on");
    const deps = makeDeps();

    const uninstall = installShutdownSignals(deps);

    const signals = onSpy.mock.calls.map((c) => c[0]);
    expect(signals).toContain("SIGINT");
    expect(signals).toContain("SIGTERM");

    uninstall();
    onSpy.mockRestore();
  });

  it("returns an uninstall function that removes both listeners", () => {
    const removeSpy = vi.spyOn(process, "removeListener");
    const deps = makeDeps();

    const uninstall = installShutdownSignals(deps);
    uninstall();

    const removed = removeSpy.mock.calls.map((c) => c[0]);
    expect(removed).toContain("SIGINT");
    expect(removed).toContain("SIGTERM");

    removeSpy.mockRestore();
  });
});
