export interface ShutdownDeps {
  stopHeartbeat: () => void;
  stopGame: () => void;
  closeServer: () => void;
  exit: (code: number) => void;
}

export function makeShutdownHandler(deps: ShutdownDeps): () => void {
  let shuttingDown = false;
  return () => {
    if (shuttingDown) return;
    shuttingDown = true;
    deps.stopHeartbeat();
    deps.stopGame();
    deps.closeServer();
    deps.exit(0);
  };
}

export function installShutdownSignals(deps: ShutdownDeps): () => void {
  const handler = makeShutdownHandler(deps);
  process.on("SIGINT", handler);
  process.on("SIGTERM", handler);
  return () => {
    process.removeListener("SIGINT", handler);
    process.removeListener("SIGTERM", handler);
  };
}
