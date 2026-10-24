# ADR-0017: One steppable match simulation in `game-core`

## Status

Accepted (2026-10-24). Amends [ADR-0003](0003-simulation.md).

## Context

The per-tick pipeline existed twice. The authoritative copy was
`MatchRoom.tick`, with `advanceMovement`, `resolveCast` and `respawn`, in
`apps/server`. The second was a partial copy in `runHeadlessMatch`. Both
regenerated energy and handled a degeneration death, and they had already
drifted. The headless runner resolved one cast and began the next in the
same tick; the server never did, because a player's next intent arrives
between ticks. The training arena (#2) needs the same loop in the
browser. A third copy would be the one a player reads balance conclusions
off, so it is the copy that most needs to be the real one.

## Decision

The tick lives in exactly one place, `MatchSimulation` in
`packages/game-core/src/match/simulation.ts`, a class with no transport,
clock or I/O. It is driven by `step(dt)` and by the intents a player
sends: `setInputDirection`, `setTarget` and `requestSkill`.

- **`MatchRoom` is an adapter.** It keeps the schema, join, leave and
  reconnection, message parsing, `syncPlayer`, the `combat` and
  `match-ended` broadcasts, and `tickMetrics`. It owns no game rule and no
  per-player simulation state.
- **`runHeadlessMatch` runs on the same class.** It has no walls and no
  match rules, and every fighter has a `cast-loop` behaviour. Its own skill
  chooser is gone.
- **Behaviours are data and only ask.** `decide` returns an intent, and
  the simulation applies it through the same `setTarget` and
  `requestSkill` a player's messages reach, so `canActivate`, `payCost` and
  `beginCast` apply to a dummy exactly as to a player.
- **The intra-tick order is a rule, written down.** For each participant
  in the order they were added: the respawn countdown (if dead), movement,
  energy regeneration, statuses (and a degeneration death), cast
  resolution, and then the participant's behaviour, if it has one.
  Behaviours therefore act _after_ their own cast resolves, in the same
  tick. That was the headless runner's order. Players are unaffected:
  their intents arrive between steps.
- **No match rules means no end and no respawn.** Training and the
  headless runner pass none: the match never finishes, and the dead stay
  dead until something resets them.
- **The combat log formalises the wire envelope.** Each resolution is a
  `CombatLogEntry` with its tick, time, cause (`skill` or `degeneration`)
  and source. `CombatEvent` does not change. A degeneration entry names its
  source only when exactly one participant applied the statuses behind it.
  Otherwise the source is `undefined` and is tallied as unattributed
  damage, never guessed.

## Consequences

- One loop to change, and every consumer changes with it. A rule fixed for
  the server is fixed for the headless runner and the training arena.
- Determinism is now asserted at match level: two simulations with the
  same seed and the same scripted inputs write an identical log. ADR-0003
  asked for this, but it had only been asserted for the RNG.
- **Three branches of the tick had no test at all when it moved:** respawn
  after death, a degeneration death, and body blocking. Every server test
  passed with any one of them broken. They are covered now, by pure tests
  in `simulation.test.ts`. Coverage of the rest of the tick still comes
  from the socket-level server tests, unchanged by this move. That those
  tests passed unmodified is the evidence the port is faithful.
- On the wire nothing changed. A status tick's `combat` message still
  names its bearer as `casterSessionId`. Who applied the statuses is
  information for the combat log, not for the protocol.
- `match-ended` is broadcast after the tick's `combat` messages instead of
  in the middle of them. It is still sent exactly once, on the
  active-to-finished edge.

## Alternatives Considered

- **Keep the copies and test them against each other.** Rejected: it
  makes the drift visible but does not stop it, and the browser would
  still add a third copy.
- **Split `advanceStatuses` per status so each damage event has one
  source.** Rejected: it would change the clamping and death semantics of
  live combat to improve a readout.
- **Widen `CombatEvent` with an attacker and a time.** Rejected: they are
  facts about the simulation, not the effect, and adding them would break
  the exact-match assertions across the effect tests for no gain.
