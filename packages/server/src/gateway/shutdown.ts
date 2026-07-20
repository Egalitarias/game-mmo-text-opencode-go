export interface ShutdownDeps {
  stopHeartbeat: () => void;
  stopGame: () => void | Promise<void>;
  closeServer: () => void;
  exit: (code: number) => void;
}

export function makeShutdownHandler(deps: ShutdownDeps): () => Promise<void> {
  let shuttingDown = false;
  return async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    deps.stopHeartbeat();
    await deps.stopGame();
    deps.closeServer();
    deps.exit(0);
  };
}

export function installShutdownSignals(deps: ShutdownDeps): () => void {
  const handler = makeShutdownHandler(deps);
  const syncHandler = () => {
    handler().catch((error) => {
      console.error("Shutdown error:", error);
      process.exit(1);
    });
  };
  process.on("SIGINT", syncHandler);
  process.on("SIGTERM", syncHandler);
  return () => {
    process.removeListener("SIGINT", syncHandler);
    process.removeListener("SIGTERM", syncHandler);
  };
}
