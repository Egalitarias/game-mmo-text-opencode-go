# Issues

Findings from a full-project code review (walking-skeleton phase). Ordered by
severity within each group. Each entry: symptom, location, and suggested fix.

---

## High

### 1. Speed hack: every queued command applies each tick — **FIXED**

`packages/server/src/sim/gameServer.ts` (`onCmd`, `tick`)

> Fixed: the command queue is now a `Map<EntityId, Command>` (last-write-wins),
> with a regression test covering the flood case.

`onCmd` appends to `commandQueue` and `tick()` drains **all** queued commands.
Sending 10 move commands between ticks moves the player 10 tiles in one tick —
a scripted client outruns every keyboard player. This also contradicts
ARCHITECTURE.md §5.1 ("one queued command per entity per tick") and is an
unbounded-memory DoS vector (the queue grows without limit between ticks).

**Fix:** store commands as `Map<EntityId, Command>` (last-write-wins per entity
per tick) instead of an array. Optionally rate-limit `cmd` messages like chat.
Add a test asserting one command per entity per tick.

### 2. Reconnect soft-lock — **FIXED**

`packages/client/src/main.ts` (`onClose`, `reject` handling),
`packages/client/src/net/socket.ts`

> Fixed: `onClose` now resets session state (`youId`/`entities`/`roster`), so a
> rejected re-`hello` routes back to the join form (overlay is un-hidden)
> instead of being lost in the log. The handle lives in client state rather
> than being re-read from the DOM input. The lingering double-socket guard is
> tracked in #10; the server-side complement (heartbeat) is #3.

On auto-reconnect, `state.youId` is stale (never reset on close). If the server
rejects the re-`hello` — likely, since the old connection's close may not be
processed yet (see #3) so the handle is still taken — the reject goes to the
log because `youId !== undefined`, the overlay stays hidden, and the user is
stuck in a dead session until manual reload.

Adjacent: `onOpen` re-reads `handleInput.value` instead of state; nothing
clears `state.entities`/`roster` on disconnect.

**Fix:** in `onClose`, reset session state (`youId = undefined`) and surface a
"reconnecting" state; store the handle in state rather than re-reading the
input; treat a `hello` reject as fatal-to-session regardless of stale `youId`.

### 3. No dead-connection detection — **FIXED**

`packages/server/src/index.ts`, `packages/client/src/main.ts`

> Fixed: `packages/server/src/gateway/heartbeat.ts` pings every socket every
> 15s and terminates any that missed the previous ping; the resulting "close"
> frees the entity and handle through the normal path. Covered by a ws-level
> test (responsive client kept, `autoPong: false` peer dropped) and verified
> against the live server.

Neither side heartbeats. The protocol has `ping`/`pong` but the client never
sends `ping` and the server never pings nor terminates stale sockets. A laptop
closing keeps the entity — and its handle — in the world until TCP gives up,
which also feeds #2.

**Fix:** server-side `setInterval` ping + `terminate()` on stale pongs (the
classic `ws` `isAlive` recipe).

### 4. Pillar expression in mapgen is a precedence trap — **FIXED**

`packages/shared/src/mapgen/static.ts:13`

> Fixed: two pillars on the middle row, symmetric about the vertical midline,
> computed with `Math.floor(width / 4)` — no shift/equality mixing, and no
> hardcoded coordinate that vanishes on small maps. Grid test expectations
> updated; map renders verified.

---

## Medium

### 5. Playwright `test-results/` committed to git — **FIXED**

`packages/e2e/test-results/.last-run.json`,
`packages/e2e/test-results/smoke-connect-see-yourself-move-chat/error-context.md`

> Fixed: `test-results/` and `playwright-report/` added to `.gitignore`;
> previously tracked files removed from the index (kept on disk).

### 6. WebSocket edge hardening — **FIXED**

`packages/server/src/index.ts`

> Fixed: `maxPayload: 16 KiB` (oversized frames close the connection with 1009
> instead of making the server parse megabytes of JSON — verified live) and a
> try/catch around `game.handleMessage` so a bad message can never take down
> the process. Not addressed (noted as acceptable for v1): `hello` flood
> limiting and a connection cap.

### 7. ARCHITECTURE.md drift from the code — **FIXED**

> Fixed: §5.3 now blesses deliberate in-place world mutation (purity = no I/O,
> seeded RNG only); §5.1's "one queued command per entity per tick" became true
> with #1; §6.4's promised `no-unsanitized/property` rule is now configured
> (verified firing on an `innerHTML` probe, silent on the real code); §12.4's
> systemd unit now uses `tsx` like DEPLOY.md and points at DEPLOY.md §3 as the
> tested source of truth.

### 8. `Command`/`Event` live in the wrong module

`packages/shared/src/rules/movement.ts:5-11`

The canonical `Event` union includes `joined`/`left` (lifecycle, not movement),
and `Command` will attract every future verb. Move both unions to
`rules/types.ts` (or `protocol/`) before combat lands in phase 2.

### 9. Zod schema ↔ TS type drift risk

`packages/shared/src/protocol/messages.ts:20-24`

`commandSchema` is hand-written to mirror `Command`. Adding a command kind to
the type won't touch the schema; new commands silently parse-fail at runtime.

**Fix:** annotate `const commandSchema: z.ZodType<Command> = ...` (or derive
the type via `z.infer`) so drift is a compile error.

### 10. Client socket robustness — **FIXED**

`packages/client/src/net/socket.ts`

> Fixed: malformed frames are dropped via try/catch in `onmessage`;
> `connect()` no-ops while a socket is open/connecting; dead
> `close()`/`closedByUser` removed. To keep resubmits working after a rejected
> hello, the join form reuses an open sessionless socket (`socket.isOpen()` →
> `sendHello()`) instead of opening a duplicate — verified live against the
> server.

### 11. Dev proxy/host mismatch

`packages/client/vite.config.ts:6`

Proxy targets `ws://localhost:3000` while the server binds `127.0.0.1` by
default. Where `localhost` resolves to `::1` first (common on macOS), the dev
proxy fails intermittently. Align the two (`ws://127.0.0.1:3000`).

---

## Low / notes

- **`entityAt` is O(n) per lookup** (`packages/shared/src/model/world.ts:90`) —
  called per move and per spawn tile, so spawning is O(n·w·h). Fine for the
  skeleton; an occupancy index (`Map<"zone,x,y", EntityId>`) is the phase-2 fix.
- **Full snapshot broadcast every tick** — O(players²) bytes, documented as
  phase-1-only. Cheap win now: skip the broadcast when the tick produced zero
  events.
- **Keyboard nits** (`packages/client/src/input/keys.ts`,
  `packages/client/src/main.ts`): `e.key` is case/layout-sensitive (`"W"` with
  Shift/CapsLock doesn't move); consider `e.code`. The `yubn` diagonals will
  collide with future command letters — decide deliberately.
- **No SIGTERM handler** (`packages/server/src/index.ts:31`) — systemd restart
  sends SIGTERM; only SIGINT is handled. Harmless while the world is in-memory.
- **`onChat` consumes a rate-limit token before the `pos` lookup**
  (`gameServer.ts:173-185`) that can abort a zone send — negligible; reorder.
- **`allowBuilds` in `pnpm-workspace.yaml`** looks redundant next to
  `onlyBuiltDependencies` (the documented key). Harmless; verify.
- **`<pre id="grid">` glyph blob** isn't really screen-reader-friendly despite
  ARCHITECTURE.md's claim — needs an aria summary later.
- **Test gaps** (suite is otherwise strong): `ChatHistory` capacity trim,
  double-`hello` guard, world-full spawn.

---

## Suggested order

1. #1 — command queue map (gameplay integrity).
2. #2 + #3 — reconnect state reset + server heartbeat (they compound).
3. #5 — one-line gitignore fix.
4. #4, #6, #10 — small hardening pass.
5. #7–#9 — docs/module hygiene before phase 2 builds on them.
