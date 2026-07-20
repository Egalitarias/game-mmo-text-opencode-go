# Roadmap

Development phases for the text-based MMO roguelike, derived from ARCHITECTURE.md.

---

## Phase 1: Walking Skeleton ✓

**Status:** Complete

- 8-directional movement with bump-on-collision
- Static room map generation (2 pillars)
- Player entities only
- Real-time tick-based simulation
- WebSocket networking with JSON protocol
- Zone and global chat
- Auto-reconnect with session state reset
- Server heartbeat for dead connection detection
- In-memory world state

All ISSUES.md items resolved.

---

## Phase 2: Roguelike Core ✓

**Status:** Complete

### Procedural Map Generation
- ✓ Replace static room with BSP or cellular automata caves
- ✓ Hand-authored vaults spliced into generated maps
- ✓ Seeded per zone for reproducibility
- ✓ Snapshot tests per seed to track algorithm changes

### Field of View (FOV)
- ✓ Per-entity FOV computation (`computeFov(world, entity) -> Set<TileId>`)
- ✓ Symmetric FOV (if A sees B, B sees A)
- ✓ Interest management: clients only receive entities in their FOV + margin
- Anti-cheat: hide entities outside player's view

### Monsters with AI
- ✓ Monster entities with `Ai` component (`aggressive | wander | flee`)
- ✓ Energy system for speed modeling (fast monsters act more often)
- ✓ Energy-threshold system: entities act when energy ≥ 100, then energy -= 100
- ✓ Monster spawning on zone creation
- ✓ AI decision-making integrated with game loop

### Melee Combat
- ✓ Attack resolution on bump into entities (`resolveAttack`)
- ✓ Stats component: `hp`, `maxHp`, `attack`, `defense`
- ✓ Damage calculation and death handling
- Combat events in message log ("You hit the goblin!")

### Death and Respawn
- ✓ Entity death when HP reaches 0
- ✓ Respawn mechanics for players (immediate respawn at safe location with full HP)
- ✓ Monsters are removed from world when killed
- ✓ Players stay connected and can continue playing after death
- Loot drops (if items exist)

---

## Phase 3: Depth ✓

**Status:** Complete

### Items and Inventory
- ✓ Item entities in the world (potions, swords, shields, gold)
- ✓ Pickup/drop commands (`pickup`, `drop`)
- ✓ Use command to consume items (`use`)
- ✓ Inventory system with max size (10 slots)
- ✓ Item spawning at specific positions
- ✓ Pickup, drop, and use events for client rendering
- ✓ Item effects: potions heal HP, swords boost attack, shields boost defense
- Inventory UI and management (`i`nventory)

### Multiple Zones
- ✓ Stairs between zones (up/down)
- ✓ Zone transition mechanics
- ✓ Remove hardcoded `ZONE_ID = "cave"`
- ✓ Zone-specific themes and difficulty
- ✓ Three interconnected zones: cave, dungeon, forest
- ✓ Bidirectional stairs with connection mapping
- ✓ Automatic zone transition on movement
- Zone change events for client rendering

### Energy/Speed System
- ✓ Energy component: `current`, `speed`
- ✓ Roguelike turn ordering based on energy accumulation
- ✓ Fast monsters act more frequently than slow ones
- ✓ Implemented as part of monster AI system

---

## Phase 4: Persistence & Scaling

**Status:** In progress

### Persistent WorldStore
- ✓ Implement `WorldStore` interface seam
- ✓ File-based persistence with JSON serialization
- ✓ World serialization/deserialization
- ✓ Graceful shutdown with world save
- ✓ Automatic world load on startup
- Redis or Postgres backing
- Account-bound handles (currently ephemeral per connection)
- Chat history persistence

### Zone Sharding
- ✓ ZoneWorker class for managing individual zone workers
- ✓ ZoneShardManager for coordinating multiple zones
- ✓ Zone worker script for running zone simulation
- ✓ Entity zone mapping and command routing
- ✓ Zone transition coordination between workers
- ✓ Event handling and broadcasting
- Each zone runs in its own worker/process
- Gateway routes by player zone
- Zone hand-off via WorldStore
- Single-threaded sim per zone (already designed for this)

### Edge Gateways
- ✓ EdgeGateway class for accepting client connections
- ✓ Stateless design for horizontal scaling
- ✓ Message routing to zone workers
- ✓ Session management and tracking
- ✓ Zone transition coordination
- ✓ Error handling and graceful degradation
- ✓ Connection timeout and failure handling
- ✓ 18 comprehensive tests for gateway behavior
- Stateless gateways behind load balancer
- Sticky sessions per zone
- Scales to tens of thousands of players

### DDoS Mitigation
- Cloudflare proxy/tunnel
- Game servers attract attacks; protection needed before public launch

### Graceful Deploys
- Drain connections before restart
- Save world state
- Clients auto-reconnect to new instance

---

## Phase 5: Polish

**Status:** In progress

### Delta-Based Network Updates
- ✓ Replace full snapshot broadcasts with deltas
- ✓ `delta` message: `changed: EntityView[]; removed: EntityId[]`
- ✓ Bandwidth optimization (currently O(players²) per tick)
- ✓ Client delta handler (currently a no-op stub)
- ✓ 15 comprehensive tests for delta system

### Interpolation Smoothing
- ✓ Render 1-2 ticks behind for smooth motion
- ✓ `requestAnimationFrame` render loop decoupled from network ticks
- ✓ 10 ticks/sec looks smooth with interpolation buffer
- ✓ Linear interpolation between entity positions
- ✓ Automatic entity tracking and cleanup

### Binary Protocol
- Replace JSON with MessagePack
- Protocol versioning allows swap without breaking clients
- Bandwidth reduction for production scale

### Canvas2D Renderer
- Replace DOM grid with Canvas2D behind same `Renderer` interface
- Only if profiling demands it
- Better performance for large zones or many entities

### Spectator Mode
- Watch games without participating
- Separate rendering path for spectators

### Reconnect UX
- Polished reconnect flow (foundation exists from Phase 1 fixes)
- "Reconnecting..." state visible to user
- Session recovery where possible

---

## Testing Gaps

**Status:** Partially addressed

### Property-Based Tests
- Add `fast-check` to devDependencies
- Invariants: "no entity ever occupies a wall tile"
- FOV symmetry: "if A sees B, B sees A"
- Movement bounds: "position always within zone bounds"

### Determinism/Replay Tests
- Same seed + same command log => identical world hash
- Record command sequences, replay and verify final state
- Critical for debugging and regression testing

### Map Generation Snapshot Tests
- One snapshot per seed per algorithm
- Algorithm changes require deliberate diff review
- Prevents accidental mapgen regressions

---

## Recommended Next Steps

1. **Procedural map generation** — Foundation for FOV and combat (enemies need interesting terrain)
2. **Field of View** — Required for interest management and anti-cheat
3. **Monsters with AI** — Core roguelike gameplay loop
4. **Melee combat** — Makes bumping into things meaningful
5. **Items and inventory** — Adds depth and progression

Start with map generation or FOV since combat and monsters depend on them.

---

## References

- **ARCHITECTURE.md** — Detailed design for all phases
- **ISSUES.md** — Phase 1 code review findings (all resolved)
- **DEPLOY.md** — Production deployment guide
- **SWAP.md** — Infrastructure swap procedures
