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

### 8. `Command`/`Event` live in the wrong module — **FIXED**

`packages/shared/src/rules/movement.ts:5-11`

> Fixed: both unions moved to `packages/shared/src/rules/types.ts`;
> `movement.ts`, `step.ts`, and `protocol/messages.ts` import from there. The
> `@game/shared` barrel re-exports it, so the public API is unchanged (server
> and client typecheck untouched).

### 9. Zod schema ↔ TS type drift risk — **FIXED**

`packages/shared/src/protocol/messages.ts:20-24`

> Fixed: a compile-time `CommandSchemaDriftGuard` requires the schema output
> and `Command` to be mutually assignable (identical) — one-directional
> `z.ZodType<Command>` would have allowed the schema to accept only a subset.
> Verified: adding a variant to `Command` without touching the schema fails
> typecheck with a readable message.

### 10. Client socket robustness — **FIXED**

`packages/client/src/net/socket.ts`

> Fixed: malformed frames are dropped via try/catch in `onmessage`;
> `connect()` no-ops while a socket is open/connecting; dead
> `close()`/`closedByUser` removed. To keep resubmits working after a rejected
> hello, the join form reuses an open sessionless socket (`socket.isOpen()` →
> `sendHello()`) instead of opening a duplicate — verified live against the
> server.

### 11. Dev proxy/host mismatch — **FIXED**

`packages/client/vite.config.ts:6`

> Fixed: proxy target is now `ws://127.0.0.1:3000`, matching the server's
> default bind. Verified empirically that `vite preview` inherits
> `server.proxy` (ws client welcomed through the preview port), so no separate
> preview config is needed.

---

## Low / notes

- **`entityAt` is O(n) per lookup** (`packages/shared/src/model/world.ts:90`) —
  **FIXED:** added occupancy index (`Map<"zone,x,y", EntityId>`) to World, making
  `entityAt` O(1). Index is maintained by `spawnPlayer`, `removeEntity`, and
  `tryMove`. Covered by 5 new tests verifying index operations.
- **Full snapshot broadcast every tick** — O(players²) bytes, documented as
  phase-1-only. **FIXED:** snapshot is now skipped when the tick produced zero
  events (regression test added).
- **Keyboard nits** (`packages/client/src/input/keys.ts`,
  `packages/client/src/main.ts`): **FIXED:** switched from `e.key` to `e.code`
  for layout independence — Shift/CapsLock no longer break movement. The `yubn`
  diagonals follow roguelike tradition (from vi/vim) and are deliberately reserved
  for movement; future text commands should use different keys or require modifiers
  (e.g., Ctrl+Y for yell) to avoid collision. Documented in code and tests.
- **No SIGTERM handler** (`packages/server/src/index.ts:31`) — **FIXED:**
  extracted `gateway/shutdown.ts` with idempotent handler registered for both
  SIGINT and SIGTERM; covered by 5 unit tests.
- **`onChat` consumes a rate-limit token before the `pos` lookup**
  (`gameServer.ts:173-185`) that can abort a zone send — **FIXED:** `pos` lookup
  now happens before `tryTake()` for zone chat; early return on missing position
  no longer wastes a token.
- **`allowBuilds` in `pnpm-workspace.yaml`** — **VERIFIED:** `allowBuilds` is the
  pnpm v11 mechanism for approving postinstall scripts; `onlyBuiltDependencies`
  was redundant and has been removed. Only `allowBuilds: esbuild: true` remains.
- **`<pre id="grid">` glyph blob** — **FIXED:** added `role="img"`, `aria-live="polite"`,
  and dynamic `aria-label` summarizing player position, zone, and nearby player count.
  Covered by 7 tests for `buildAriaSummary` and DOM attribute behavior.
- **Test gaps** (suite is otherwise strong): **FIXED:** added tests for
  `ChatHistory` capacity trim, double-`hello` guard (silently ignored), and
  world-full spawn (reject with "world is full").

---

## Suggested order

1. #1 — command queue map (gameplay integrity).
2. #2 + #3 — reconnect state reset + server heartbeat (they compound).
3. #5 — one-line gitignore fix.
4. #4, #6, #10 — small hardening pass.
5. #7–#9 — docs/module hygiene before phase 2 builds on them.
