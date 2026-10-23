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
  (walls), circle-vs-circle (body blocking), and line of sight.
- `ruleset.ts` — the versioned ruleset (brief §11). Tick rate, movement
  speed, collision radius, attribute budget and the resource economy live
  here as _data_, so the live server and the headless runner cannot drift
  into describing different games.
- `professions.ts`, `attributes.ts`, `character.ts` — 10 professions with
  4–5 attributes each, the attribute cost curve and point budget, and
  character validation.
- `skills/` — the composable skill system (see below).
- `match-rules.ts` — score target, clock, and victory evaluation.
- `tools/headless-match.ts` — runs real combat with no I/O at all.

### `packages/game-core/src/skills` — the composable skill system

This is the part of the codebase most worth understanding, because it is
the one the brief is most specific about (§6, §41): skills are **data**
composed from a small set of reusable effects, never bespoke classes and
never a giant `switch`.

```text
types.ts      Skill, SkillEffect, Combatant, TargetRule
effects.ts    the effect interpreter: damage, heal, status, interrupt,
              energy/adrenaline — one handler per effect kind
scaling.ts    attribute rank -> magnitude (linear interpolation)
activation.ts can this skill be cast right now, and if not, *why not*
cast-state.ts activation/recharge timers for one combatant
status.ts     condition/hex/enchantment definitions and stacking rules
tick.ts       per-tick status advancement (degen, regen, expiry)
catalog.ts    the implemented skills, as data
coverage.ts   imported corpus vs implemented — the honest gap report
```

Adding a skill means adding an entry to `catalog.ts`. If it needs a
mechanic that does not exist yet, the correct move is to **not add it** —
see "Honest coverage" below.

### `packages/game-protocol` — the wire contract

The closed set of messages a client may send (`ClientIntent`), the
lobby-code alphabet and validation, and the protocol version both sides
check at join time. Shared by both apps so neither can drift.

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

- `server.ts` — builds (but does not start) the Colyseus server via
  `defineServer`/`defineRoom`, so tests can boot it on an ephemeral port
  (ADR-0002).
- `rooms/lobby-room.ts` — lobby codes, team assignment, ready state, map
  selection, and the handoff into a match.
- `rooms/match-room.ts` — the authoritative simulation: a fixed 20 Hz tick
  driving movement, collision, casting, effects, statuses, death, respawn
  and scoring.
- `testing/harness.ts` — boots a real server on a real port for integration
  tests.

Every client message is treated as hostile until validated. Reading a field
off an inbound message goes through a helper that tolerates `null` and
non-objects, because `(message as {team?: unknown}).team` throws on `null`
and _did_ crash the server during fuzzing.

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
- `ui/` — HUD, character builder, team builder, menu, lobby screen.
- `storage/` — versioned IndexedDB persistence with a migration registry
  (ADR-0005). Browser-local only: no accounts, no database, no cloud.

## Two rules worth stating plainly

**The client sends intent, never outcomes** (brief §12, §32, §33). It may
say "I want to use skill 3 on that player". It may never say "I hit for 91
damage". Damage, health, position, cooldowns and energy are server-owned.

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

560 headless tests in four layers, plus a browser suite:

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
