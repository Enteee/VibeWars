# ADR-0003: Simulation

## Status

Accepted (2026-10-23); tick rate to be re-benchmarked in Sprint 26 (brief §26).

Amended by [ADR-0017](0017-shared-match-simulation.md): the tick now lives
in `game-core` as the steppable `MatchSimulation`. The server drives it from
`setFixedTimestep`, and the stage order within a tick is written down there.

## Context

The brief requires a fixed-tick authoritative simulation, independent of
render FPS, with injectable determinism (no direct `Math.random()`) so
matches are reproducible from `(seed, initialState, inputs)` for future replay
(§13, §35, §36). Colyseus 0.18 ships a first-class
`Room.setFixedTimestep(step, tickRate, opts)` API (confirmed by reading the
installed `@colyseus/core` type declarations — see ADR-0002) which is the
natural home for this.

## Decision

- The simulation advances on a **fixed server tick**, driven by
  `Room.setFixedTimestep`, decoupled from client frame rate and from the
  wall-clock render loop. The initial tick rate is **20 Hz** (50 ms/tick) —
  a deliberately conservative starting point for an up-to-16-player arena
  game; it is a measured, not guessed, choice to revisit once Sprint 26's
  profiling exists, per brief §26 ("do not optimize prematurely").
- `TICK_RATE_HZ` / `TICK_INTERVAL_MS` are defined once, server-side
  (`apps/server/src/rooms/lobby-room.ts`), and communicated to the client via
  `ServerHello.tickIntervalMs` at join time (`packages/game-protocol`), rather
  than hardcoded independently on both sides.
- All simulation randomness goes through an injectable `SimulationRng`
  (`packages/game-core/src/rng.ts`), seeded via `seedFromString` (stable
  FNV-1a hash) or `createRng(seed)` (Mulberry32, full 2^32 period, pure
  integer math — identical output on every JS engine). `Math.random()` is
  never called from simulation code; this is enforced by code review today
  and should become an ESLint `no-restricted-globals` rule once the
  simulation package exists in Sprint 4+.
- The simulation pipeline follows the brief's stage order (§13): input
  collection → movement → targeting → skill processing → effects →
  conditions → death/state transitions → network state update. Each stage is
  implemented as it is needed (Sprint 4 for movement, Sprint 10+ for skills),
  not stubbed out in advance.

## Consequences

- Determinism is testable today: `rng.test.ts` proves that two RNGs seeded
  identically produce identical draw sequences, which is the property replay
  and deterministic combat tests will depend on from Sprint 11 onward.
- A fixed tick means client movement feels "steppy" without interpolation;
  brief §13 explicitly defers client-side interpolation/prediction to a later
  sprint, so this is accepted for now and revisited in Sprint 4.
- Choosing 20 Hz now is a placeholder informed by genre norms, not a
  benchmark against this project's actual entity/skill load — treating it as
  fixed forever would violate the brief's "no premature optimization"
  guidance in the other direction. Revisiting it is tracked explicitly against
  Sprint 26, not left implicit.

## Alternatives Considered

- **Variable-tick / `requestAnimationFrame`-driven simulation.** Rejected:
  ties combat outcomes to client or server load/jitter, breaking determinism
  and replay.
- **Hand-rolled accumulator loop instead of `setFixedTimestep`.** Rejected:
  Colyseus 0.18 already provides this, including the per-step context object
  consumed by future client-prediction work; reimplementing it would be the
  "giant speculative abstraction" the brief warns against (§30).
