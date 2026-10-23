# Architecture

This is a short orientation. The authoritative record of _why_ each decision
was made lives in `docs/adr/`; read the ADRs for rationale and trade-offs.
This file describes the current shape of the system.

## Big picture

```text
                 ┌─────────────────────────┐
                 │        apps/web          │
                 │  HTML/CSS shell + Phaser │
                 │  4 viewport (rendering   │
                 │  only — no game rules)   │
                 └────────────┬─────────────┘
                              │ Colyseus client (@colyseus/sdk)
                              │ sends: ClientIntent (move/stop/...)
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
                 │  game-core: pure domain  │
                 │  game-protocol: wire     │
                 │  contract (both sides)   │
                 └───────────────────────────┘
```

`game-core` has no dependency on Phaser, Colyseus, or any browser/Node I/O —
see ADR-0001. That is what makes it possible to unit-test combat math,
collision, and RNG headlessly, with no server and no browser running.

## Where things live today (Sprint 0/1)

- `packages/game-core/src/vec2.ts`, `rng.ts` — 2D vector math and a
  deterministic, seedable PRNG. Every future simulation random draw (damage
  variance, etc.) goes through `SimulationRng`, never `Math.random()`
  directly (ADR-0003).
- `packages/game-protocol/src/protocol.ts` — the closed set of messages a
  client may send (`ClientIntent`), the lobby-code alphabet/validation, and
  the protocol version both sides check at join time.
- `apps/server/src/server.ts` — builds (but does not start) the Colyseus
  server via `defineServer`/`defineRoom`, so tests can boot it on an
  ephemeral port (ADR-0002).
- `apps/server/src/rooms/lobby-room.ts` — the one room that exists so far: a
  feasibility room proving join/leave/state-sync, with no game logic yet.
- `apps/server/src/config.ts` — environment-variable configuration; see
  `docs/development/environment-variables.md`.
- `apps/web/src/render/arena-scene.ts` — a Phaser `Scene` that draws a plain
  `ArenaSnapshot` data object (actors, walls, current target). It has no
  reference to network or simulation code; whatever eventually produces an
  `ArenaSnapshot` (Sprint 4+) is the only thing that needs to know both
  "renderer" and "simulation" exist.

## What does not exist yet

Professions, attributes, the skill engine, combat, conditions/hexes/
enchantments, maps, the character/team builders, and the lobby UI are all
still ahead — see `docs/product/master-brief.md`'s sprint list for the
order they arrive in, and `docs/adr/` for the ADRs that will accompany each
(skill data format, map format, persistence schema).

## Testing shape

- **Unit tests** (`packages/*/src/*.test.ts`): pure functions, no I/O.
- **Integration tests** (`apps/server/src/server.test.ts`): a real Colyseus
  server on a real ephemeral port, joined by a real `@colyseus/sdk` client
  over a real WebSocket — deliberately not mocked, because a mocked Colyseus
  would not have caught the dependency-resolution bug documented in
  ADR-0002.
- Browser/UI tests (Playwright) and headless combat-simulation tests arrive
  once there is UI and combat to test (brief §31).

Run everything with `pnpm run test` (or `devenv test`, which runs the full
format/lint/typecheck/test/build sequence — see `devenv.nix`'s `enterTest`).
