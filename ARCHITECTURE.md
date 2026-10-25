# Architecture

A short orientation to the current shape of the system. The authoritative
record of _why_ each decision was made lives in `docs/adr/`; read the ADRs
for rationale and trade-offs.

## Big picture

```text
                 ┌──────────────────────────┐
                 │        apps/web          │
                 │  HTML/CSS shell + Phaser │
                 │  4 viewport (rendering   │
                 │  only — no game rules)   │
                 └────────────┬─────────────┘
                              │ Colyseus client (@colyseus/sdk)
                              │ sends: ClientIntent (move/stop/target/use-skill)
                              │ receives: authoritative room state
                 ┌────────────▼─────────────┐
                 │       apps/server        │
                 │  Colyseus 0.18 rooms.    │
                 │  Owns ALL authoritative  │
                 │  state. Never trusts a   │
                 │  client-sent outcome.    │
                 └────────────┬─────────────┘
                              │ uses
                 ┌────────────▼─────────────┐
                 │      packages/*          │
                 │  game-core    domain     │
                 │  game-protocol wire      │
                 │  game-maps    arenas     │
                 │  game-data    reference  │
                 └──────────────────────────┘
```

Dependencies point one way only (ADR-0001). `game-core` depends on nothing
else in the workspace and never touches a socket, a renderer or a clock.
That is what makes combat testable headlessly — and it is why the duel
runner can simulate a real fight with no server and no browser running.

## The packages

### `packages/game-core` — the domain

Everything that decides what happens in a fight.

- `rng.ts` — a deterministic, seedable PRNG. Every simulation random draw
  goes through `SimulationRng`; `Math.random()` is banned in simulation
  code (ADR-0003), because a bug you cannot reproduce from a seed is a bug
  you cannot fix.
- `vec2.ts`, `movement.ts`, `geometry.ts` — vector math, speed-capped
  movement integration, and the shared geometric queries: circle-vs-segment
  (walls), circle-vs-circle (body blocking), segment distance, and line of
  sight.
- `distances.ts` — the game's shared distances (melee, ranges), in world
  units.
- `pathing.ts` — a visibility graph over wall corners and an A* search on
  it. The weapon attack's approach uses it to walk round walls (ADR-0026).
  Built once per match from the walls and the map bounds.
- `ruleset.ts` — the versioned ruleset (brief §11). Tick rate, movement
  speed, collision radius, attribute budget and the resource economy live
  here as _data_, so the live server and the headless runner cannot drift
  into describing different games.
- `professions.ts`, `attributes.ts`, `character.ts` — 10 professions with
  4–5 attributes each, the attribute cost curve and point budget, and
  character validation.
- `build.ts` — a character plus their skill bar, and the validation the
  **server** applies when a client claims one at join time. It lives here
  rather than in the web client precisely because the server is the thing
  that must enforce it; a second copy of the rules in the client would be
  the obvious way to get the two quietly disagreeing.
- `equipment/` — weapons, off-hands, armor, runes and insignias as static
  catalogs, plus resolving a build's equipment into the numbers a fight
  uses (ADR-0012). `weapons.ts` is the one table of weapon damage, speed,
  range and projectile speed.
- `skills/` — the composable skill system (see below).
- `match-rules.ts` — score target, clock, and victory evaluation.
- `match/` — the one copy of the per-tick pipeline (ADR-0017).
  `simulation.ts` is `MatchSimulation`: movement (clamped to the map
  bounds), collision, casting, weapon auto-attacks and their approach,
  projectiles in flight, effects, statuses, death, respawn and scoring,
  stepped by whoever owns the clock. `facing.ts` defines where a
  participant looks. `combat-log.ts` records each resolution with its
  source and time. `behaviour.ts` turns behaviours (data) into the same
  intents a player sends. `training-scenarios.ts` holds the Training
  Ground's scenarios as data (ADR-0020).
- `tools/headless-match.ts` — runs real combat with no I/O at all, on
  `MatchSimulation`.

### `packages/game-core/src/skills` — the composable skill system

This is the part of the codebase most worth understanding, because it is
the one the brief is most specific about (§6, §41): skills are **data**
composed from a small set of reusable effects, never bespoke classes and
never a giant `switch`.

```text
types.ts         Skill, SkillEffect, Combatant, TargetRule
effects.ts       the effect interpreter: damage, heal, status, interrupt,
                 energy/adrenaline — one handler per effect kind
scaling.ts       attribute rank -> magnitude (linear interpolation)
activation.ts    can this skill be cast right now, and if not, *why not*
cast-state.ts    activation/recharge timers for one combatant
status.ts        condition/hex/enchantment definitions and stacking rules
tick.ts          per-tick status advancement (degen, regen, expiry)
catalog.ts       the implemented skills, as data
coverage.ts      imported corpus vs implemented — the honest gap report
damage.ts        the damage pipeline: armor, penetration, every point of damage
targeting.ts     who a landed skill hits: the target, or everyone in its area
weapon-attack.ts what one weapon swing does when it lands (ADR-0026)
projectile.ts    a ranged shot in flight, led at where the target is going
describe.ts      skill descriptions, generated from the effect data
```

Adding a skill means adding an entry to `catalog.ts`. If it needs a
mechanic that does not exist yet, the correct move is to **not add it** —
see "Honest coverage" below.

### `packages/game-protocol` — the wire contract

The closed set of messages a client may send (`ClientIntent`), the
lobby-code alphabet and validation, and the protocol version both sides
check at join time. Shared by both apps so neither can drift.

The version is not written by hand (#303). `wire-schema.json` is a committed,
generated description of everything that crosses the socket: the Colyseus
state classes, fields in their encoded order; every type this package exports
and game-core's `CombatEvent`, structurally; and each message name the rooms
use, mapped to its payload. `PROTOCOL_VERSION` is the first 12 hex digits of
its sha256, generated into `src/protocol-version.ts`. A wire change changes the
snapshot and so the version, and two wire changes always conflict on that one
line. `pnpm run wire:snapshot` regenerates both files; a test in the server
suite fails a change that did not. A change in meaning with no change in shape
bumps `SEMANTICS_REVISION` in the generator by hand.

### `packages/game-maps` — arenas

Declarative map documents (`maps/*/`), a zod schema, a loader/validator and
derived geometry (wall segments, spawn points by team). Four arenas ship:
`arena-alpha` (chokepoint), `arena-open`, `arena-split`, `arena-pillars`.
Map geometry is original (brief §41) — see ADR-0006 for the format.

### `packages/game-data` — reference data, not a runtime dependency

The GW1 skill-corpus ingestion pipeline (ADR-0004). It parses public
reference data, preserves provenance, and emits a normalized bundle that is
committed to the repository. **The game server never calls this package at
runtime.** It also hosts the developer CLI, because the coverage report
needs both the corpus and `game-core`, and this is the only package where
both are legitimately in scope.

## The apps

### `apps/server`

- `main.ts` — the process entry point. One process serves both the static
  client and the game WebSocket, so a LAN host runs one container behind one
  URL (ADR-0009).
- `config.ts` — `loadConfig()`: every `VIBEWARS_*` setting, resolved once
  from the environment, each with a LAN-friendly default (brief §27).
- `server.ts` — builds (but does not start) the Colyseus server via
  `defineServer`/`defineRoom`, so tests can boot it on an ephemeral port
  (ADR-0002).
- `http-gate.ts` — runs before Colyseus sees an HTTP request. It deletes the
  forwarding headers, since we run behind no proxy and a client could forge
  them, and rate-limits, per address, the matchmaking calls that reserve a
  seat (#265).
- `rooms/lobby-room.ts` — lobby codes, team assignment, ready state, map
  selection, and the handoff into a match.
- `rooms/match-room.ts` — the authoritative match: a fixed 20 Hz tick that
  steps game-core's `MatchSimulation`, feeds it the players' intents, and
  syncs the result to the schema and the `combat` broadcast.
- `rooms/room-budget.ts` — at most `VIBEWARS_MAX_ROOMS` rooms per server,
  match and lobby rooms together (#114).
- `rooms/client-budget.ts` — the server-wide seat cap and the per-address
  seat cap (#265): the same counter as the room budget, counting seats
  instead of rooms.
- `rooms/message-budget.ts` — a token bucket per client on inbound messages
  (#43). Over budget, a message is ignored rather than its sender dropped: a
  burst is what an honest client sends after a network stall, and dropping it
  left the player connected but deaf for the whole reconnection window.
- `rooms/options.ts` — `field()`, which reads one field off a client message
  safely, and the protocol-version check on join.

  Every client message is treated as hostile until validated. Reading a field
  off an inbound message goes through `field()`, which tolerates `null` and
  non-objects, because `(message as {team?: unknown}).team` throws on `null`
  and _did_ crash the server during fuzzing.

- `rooms/recharge.ts` — when the server re-sends a player's recharges: only
  when they drift from the client's countdown by more than the 50 ms
  tolerance, one tick (#152).
- `log-safe.ts` — `quote()`, the only way a value a client chose reaches a
  log line, so it cannot end the line or forge another. `log-safe.test.ts`
  enforces it (#115).
- `testing/harness.ts` — boots a real server on a real port for integration
  tests.
- `tools/benchmark.ts` — load benchmarks at realistic team sizes, against a
  real server over real WebSockets (brief §26). It reports numbers; it tunes
  nothing.
- `tools/wire-snapshot.ts` — generates game-protocol's `wire-schema.json` and
  `protocol-version.ts` (#303), walking the message table in
  `tools/wire-messages.ts`. Run by `pnpm run wire:snapshot`.

The room and seat budgets are made per server by `createGameServer`, never as
module globals, because the tests run several servers in one process. The
caps' values and the threat they answer are in [SECURITY.md](SECURITY.md#known-open-gaps),
gap 6.

### `apps/web`

- `main.ts` — the app-shell state machine (menu → builders → lobby → match).
- `match-view.ts` — owns a live match's lifetime, including full teardown.
- `net/` — Colyseus clients for the lobby and match rooms, with automatic
  reconnection.
- `render/arena-snapshot.ts` — plain data: actors, walls, target. Phaser-free
  **on purpose**, so it is testable in Node; importing Phaser into a test
  crashes it.
- `render/arena-scene.ts` — the Phaser scene that draws a snapshot. It knows
  nothing about networks or rules (ADR-0010).
- `render/arena-viewport.ts` — the Phaser host for one `ArenaScene`, shared by
  the match view (`resize`) and the Training Ground (`fit`). Loads Phaser on
  first use, so the modules that import it stay importable in node.
- `training/` — the Training Ground's local match (ADR-0020):
  `local-connection.ts` is a `MatchConnection` over a `MatchSimulation` in the
  tab, pumped by Phaser's frame clock. `scenario-setup.ts` turns a
  `game-core` scenario and the character being edited into that simulation.
  `maps.ts` holds the training arenas.
- `ui/` — HUD, character builder, team builder, menu, lobby screen. The
  build editor's left column is `training-panel.ts`: created once per editor
  visit and moved into every re-render, never recreated. Its pure logic is in
  `training-state.ts` and `combat-readouts.ts`.
- `storage/` — IndexedDB persistence (ADR-0005). A stored record in any
  shape but the current one is discarded and the player told, never
  migrated (ADR-0016). Browser-local only: no accounts, no database, no
  cloud.

## Deploy targets

- **The container** (`containers.prod`, ADR-0009): one process serves the
  built client and the game server. This is how online play is hosted.
- **GitHub Pages** (`.github/workflows/pages.yml`, #103): the client alone,
  as a static site, built with `VIBEWARS_BASE` (a sub-path) and
  `VITE_VIBEWARS_ONLINE=off`. `/next/` follows `main`, and the root follows
  the latest release. With no server behind it, online play is disabled.
  Each base path gets its own storage namespace (`storage/namespace.ts`), so
  the two builds on one origin never read each other's saves.

ADR-0009 is not superseded by this; #15 does that once online play itself
becomes static.

## Two rules worth stating plainly

**The client sends intent, never outcomes** (brief §12, §32, §33). It may
say "I want to use skill 3 on that player". It may never say "I hit for 91
damage". Damage, health, position, cooldowns and energy are server-owned.

**The Training Ground measures; it never decides** (ADR-0020). The
character editor runs the real `MatchSimulation` in the browser, against
dummies, so a player can see what a build does. Nothing it computes is sent
anywhere, and a networked match is decided only on the server. It is
trustworthy only because it is the identical code, so a game rule belongs in
`MatchSimulation`, never in `MatchRoom`.

**Honest coverage** (brief §9). The catalog holds 12 skills: 9 of the 16
in the imported reference corpus, plus 3 of this project's own design. The
other 7 corpus skills need mechanics that do not exist yet — area-of-effect,
knockdown, skill-copying, condition transfer — so they are **absent from
the catalog** rather than present as watered-down approximations.
`coverage.ts` reports that gap as machine-readable data, including why each
missing skill is missing, and a test asserts the gap never grows silently.
A skill list that quietly mapped unsupported skills onto generic effects
would look better and be a lie.

## Testing shape

583 headless tests in four layers, plus a browser suite:

- **Unit** (`packages/*/src/*.test.ts`) — pure functions, no I/O.
- **Integration** (`apps/server/src/*.test.ts`) — a real Colyseus server on
  a real ephemeral port, joined by real `@colyseus/sdk` clients over real
  WebSockets. Deliberately not mocked: a mocked transport would not have
  caught the dependency-resolution bug in ADR-0002, and `reconnect.test.ts`
  only means something over a socket that can actually drop.
- **Fuzz** (`apps/server/src/fuzz.test.ts`) — hostile and malformed inbound
  messages plus a seeded corpus. The rule it enforces is brief §27: the
  server must never crash on client input. It has already caught one real
  crash.
- **Headless simulation** (`tools/headless-match.test.ts`) — whole fights,
  deterministically, with no server.
- **Browser** (`e2e/*.spec.ts`, Playwright) — a real Chromium against the
  real production server: host a lobby, join it from a second browser
  context, start a match, move, cast. Movement is asserted by comparing
  rendered frames rather than through a test-only hook, so the test
  cannot pass against a code path players never run. This layer found two
  bugs that made the lobby unplayable and that nothing headless could
  have caught — see ADR-0011.

Run everything with `pnpm run test`, or `pnpm run ci` / `devenv test` for
the full format → lint → typecheck → test → build sequence.
