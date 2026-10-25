# ADR-0001: Overall Architecture

## Status

Accepted (2026-10-23)

## Context

vibewars is a browser-based, GW1-PvP-inspired competitive arena game. It must
run as an authoritative client/server game, be deployable as a single LAN
container, support a headless (non-browser) simulation for testing, and avoid
locking game rules into a rendering framework. See
`docs/product/master-brief.md` §12–§15, §41.

## Decision

The codebase is a pnpm workspace monorepo:

```text
apps/
  server/           Colyseus authoritative game server (Node, TypeScript)
  web/              Browser client: HTML/CSS shell + Phaser 4 viewport

packages/
  game-core/        Pure game-domain primitives (Vec2, seeded RNG, later:
                     attributes, skills, combat math). Zero I/O, zero
                     rendering, zero network dependency. Fully unit-testable
                     without a browser or a socket.
  game-protocol/    The wire contract shared by client and server: message
                     shapes, lobby-code rules, protocol version. No game
                     rules, no transport-library dependency.
  game-maps/        (Sprint 6+) Declarative map data + geometry helpers.
  game-data/        (Sprint 9+) Normalized GW1 skill corpus + the importer
                     pipeline that produces it.
  game-session/     Peer-to-peer match sessions over an injected Transport
                     (ADR-0022, Proposed). No DOM, no Node, no transport
                     library.
```

The dependency direction is one-way:

```text
game-core  <--  game-protocol  <--  apps/server
    ^                           <--  apps/web
    |
    +--  game-maps  <--  apps/server
    |               <--  apps/web   (schema, geometry and map JSON only)
    |
    +--  game-session  (also on game-protocol; nothing uses it yet, #15)
```

`game-core` depends on nothing else in the workspace, and `game-maps` on
`game-core` only. `apps/server` and `apps/web` depend on these packages but
never on each other. The browser reaches `game-maps` only through its fs-free
subpaths (`./schema`, `./geometry`, `./maps/*`, `./training/*`); `loader.ts`
reads the disk and stays behind `"."`.

The simulation (inside `game-core`, driven by `apps/server`) is the
authoritative source of truth. Phaser is a _renderer_: it reads a snapshot and
draws it, and is never consulted to decide an outcome (see `ArenaScene` in
`apps/web/src/render/arena-scene.ts`, which takes a plain `ArenaSnapshot` data
object and has no reference to game rules).

## Consequences

- Game logic can be (and is, from Sprint 0 onward) tested with Vitest in plain
  Node, with no browser, no DOM shim, and no running server — see
  `packages/game-core/src/*.test.ts`.
- Swapping the renderer (e.g. a future spectator view, or a different engine)
  touches only `apps/web`.
- Every new package must justify which side of the one-way dependency graph
  it sits on before code is written, which is a small but real tax on
  velocity in exchange for not re-litigating this later at scale.

## Alternatives Considered

- **Single app, no workspace split.** Rejected: it is exactly the shape that
  lets game rules leak into Phaser scene code by accident, which the brief
  explicitly forbids (§41).
- **Full plugin/ECS engine framework.** Rejected for v1: the brief explicitly
  warns against speculative abstraction (§30, §44). A plain data+functions
  domain layer is revisited only if a concrete pain point demands an ECS.
