# ADR-0020: The Training Ground runs the match simulation in the browser

## Status

Accepted (2026-10-24). Builds on [ADR-0017](0017-shared-match-simulation.md).
Keeps [ADR-0003](0003-simulation.md) intact: only the pump is new.

## Context

A player tuning a build cannot learn what it does from the editor alone.
The tooltip reports unmitigated numbers for a single cast. Armor,
degeneration, interrupts and energy only show up in a fight. Until now the
only fight was a match on the server: you saved, queued, walked into
range, and still could not read off one number, because nothing kept
score of what you dealt.

The Training Ground (#2) puts a live arena beside the editor. Editing the
build changes the fight in place. It needs the real rules running against
dummies, with no network round trip and no room on the server.

This is the first time an authoritative-shaped simulation runs in the
client. Read carelessly, that contradicts the project's first rule: the
client sends intent, never outcomes. Without this record, it would look
like the client is growing authority.

## Decision

**The local simulation is never a source of truth for a networked match.
It is a measurement instrument, and the only thing that makes it
trustworthy is that it is the identical code.**

- The arena runs `MatchSimulation` from `game-core`, the same class
  `MatchRoom` adapts (ADR-0017), with no copy and no web-side rules.
  Nothing it computes is sent anywhere, and the server never asks for it.
  A networked match is still decided only on the server.
- **One seam: `MatchConnection`.** `training/local-connection.ts`
  implements the interface the renderer and input are written against,
  backed by the simulation in the tab. The arena scene, `toArenaSnapshot`,
  `actorAtPoint`, the keyboard handler and the floating combat text are
  reused unchanged. It adds `advance`, `onStep` (the full combat log,
  status ticks included) and `rearm`.
- **The pump is Phaser's `STEP`, never a bare `requestAnimationFrame`.**
  A fixed-step accumulator lives in `apps/web` and runs whole ticks at the
  ruleset's rate. `MAX_CATCHUP_SECONDS = 0.25`, so a tab coming back from
  the background runs a handful of ticks, not thousands. The simulation
  stays clock-free (ADR-0003). Only the pump differs from the server's
  `setFixedTimestep`, and one clock that stops when the game is destroyed
  cannot leave an orphan loop.
- **Scenarios and behaviours are data** in `game-core`
  (`training-scenarios.ts`, `behaviour.ts`). `mapId` is a string, and
  `apps/web` resolves it against the training maps. `game-core` never
  imports `game-maps`.
- **The arena reads real map geometry**, through `game-maps`'
  browser-safe subpaths (`./schema`, `./geometry`, `./training/*`,
  added in #8), with `loader.ts` behind `"."`. This is the client
  consumer of the parsed map that ADR-0006 always named, and the
  `apps/web → game-maps` arrow ADR-0001's diagram already shows. The
  one-way rule (`packages ← apps`) is unchanged.
- **One Phaser game per editor visit.** The panel is created once,
  synchronously, and moved into each re-render (`attach`). Switching
  scenarios swaps the simulation and resizes the game. Editing the build
  re-arms the player in place, keeping their health fraction. Nothing
  recreates the game. `disposeBuildEditor()` is the only teardown, and
  every way out of the editor goes through it.
- **The keyboard belongs to the stage, never to `window`.** The arena is a
  focusable `role="application"` element. Typing in the name field or the
  library search can never reach it.
- **An illegal build is parked, not replaced.** The server gives an
  illegal build the house loadout, so as not to drop a player at the door.
  Here that would quietly test a build the player never wrote. The player
  stands still behind an overlay naming the first problem instead.
- Phaser is loaded by `createArenaViewport` on first use rather than at
  import. The build editor now imports the viewport through the panel, and
  the editor's pure functions are tested in node, where Phaser cannot be
  imported.

## Consequences

- Balance read off the Training Ground is the balance of a real match, as
  long as ADR-0017 holds. A rule added to `MatchRoom` instead of
  `MatchSimulation` would make the two disagree silently. That is now the
  rule that keeps the instrument honest.
- The web bundle carries the simulation, the skill catalogue and `zod`
  (for map validation). The match view already needed most of it.
- Nothing covers the cost of a 20 Hz simulation beside a DOM-heavy editor
  in one tab. `benchmark.test.ts` covers server tick time only.
  Scenarios are capped at 8 participants, and this cap is stated rather
  than claimed to be fine.
- Without WebGL the editor stays the two-column screen it was, with no
  error.
- The editor's lifecycle is now load-bearing. Any new way out of the
  editor that skips `showMenu()` leaks a Phaser game.
  `e2e/training.spec.ts` (8) is the guard.

## Alternatives Considered

- **A training room on the server.** It costs a room per player editing a
  build, and a round trip per attribute click. It also needs a protocol
  for "re-arm in place". It would measure the same code, only slower.
- **A web-side simplified simulation.** It would be cheaper to embed and
  a lie the day it drifts. That drift is exactly what ADR-0017 removed.
- **Reusing `createHud`/`updateHud` for the panel.** `updateHud` needs a
  score, a clock, a phase and a winner. A playground has none, and faking
  them is the kind of lie this codebase refuses. The panel reuses the
  `SkillSlot` shape and the 1–8 mapping, under its own `.training-skill`
  selector.
- **Recreating the arena on every editor render.** The editor re-renders
  on every `+` click. That would throw away the WebGL context each time,
  and it is the most leak-prone thing the feature could do.
