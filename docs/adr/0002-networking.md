# ADR-0002: Networking

## Status

Accepted (2026-10-23)

## Context

The brief mandates an authoritative server, a closed set of client _intents_
(never outcomes), a lobby with a short shareable code, and specifically asks
to evaluate Colyseus against its _current_ documentation rather than old
tutorials (§12, §45). Colyseus 0.18.10 was the latest release as of this ADR
(`npm view colyseus dist-tags`, checked 2026-10-23); 0.18 is explicitly framed
by the Colyseus project as the last 0.x release before 1.0.

## Decision

Use **Colyseus 0.18** (`colyseus`, `@colyseus/schema` 5.x, `@colyseus/sdk` for
the browser client), via its current `defineServer()` / `defineRoom()` API —
not the older `new Server()` + `server.define()` idiom that still appears in
most third-party tutorials. Both remain supported, but `defineServer` is the
API the maintainers are investing in going forward, and gives us a
typed `rooms` map which later lets `@colyseus/sdk`'s `Client` type-check room
names and payloads against the server's actual registrations.

Schema 5's **builder syntax** (`schema({...}, "Name")` + `t.string()`,
`t.map(...)`) is used instead of the legacy `@type()` decorator syntax. This
is not a style preference: our `tsconfig.base.json` sets
`erasableSyntaxOnly: true` so that every source file stays directly runnable
by `node --strip-types`/esbuild without a decorator transform, and
TypeScript's native (non-legacy) decorators do not support the property
decorators Schema's old API needs in the shape it needs them.

The client sends only closed-union _intents_ (`ClientIntent` in
`packages/game-protocol/src/protocol.ts` — currently `MoveIntent | StopIntent`,
growing in later sprints). It never sends position, damage, or any other
authoritative value. The server is the only writer of `Room.state`.

One Colyseus room type, `VibewarsLobbyRoom`, exists as of Sprint 0 — a
feasibility room with no game logic, proving the full join/sync/leave
lifecycle against our exact dependency versions. The match-simulation room
arrives in Sprint 3/4.

## Consequences

- `@colyseus/schema`'s builder syntax means schema definitions are plain
  values, not classes with decorated fields — this reads less like "the GW1
  data model" and more like a wire-format DSL, which is appropriate since
  `Room.state` is wire format, not domain model. The actual character/skill
  domain model lives in `game-core`, independent of how it is synced.
- **Hard dependency-resolution pitfall, found and fixed during Sprint 0** (see
  the Sprint 0 report / commit history): `@colyseus/core` has a _circular
  optional peer dependency_ with `@colyseus/auth`
  (`@colyseus/core` peers on `@colyseus/auth` optionally; `@colyseus/auth`
  peers back on `@colyseus/core`). Under pnpm's strict, per-consumer peer
  resolution this created **two physically separate copies** of
  `@colyseus/core` in `node_modules/.pnpm`, each with its own
  module-level room registry. A seat reserved via the HTTP matchmake copy was
  invisible to the WebSocket-upgrade copy, so every join failed with
  `MatchMakeError: seat reservation expired.` (ErrorCode 524 /
  `MATCHMAKE_EXPIRED`), even immediately after a successful reservation.
  **Fixed** by hoisting all `@colyseus/*` packages to a single top-level copy
  via `.npmrc`'s `public-hoist-pattern[]=@colyseus/*`. This is a documented,
  reproducible gotcha for any pnpm + Colyseus 0.18 project and is worth
  re-checking if a future Colyseus upgrade changes its peer-dependency graph.
- A second, more routine finding: `client.joinOrCreate()` resolves on the
  WebSocket handshake, _before_ the first state patch is decoded. Code that
  reads `room.state.<field>` immediately after a successful join may see
  `undefined` for a few milliseconds. Production client code (from Sprint 3
  onward) must gate on `room.onStateChange` (or a schema default that is
  guaranteed present at handshake time) rather than assuming synchronous
  availability; test helpers must treat a throwing poll predicate as "not yet
  true" rather than a hard failure (see `apps/server/src/testing/harness.ts`).
- Lobby codes exclude visually-ambiguous characters (`0/O`, `1/I/L`, `2/Z`,
  `5/S`, `8/B`, `U/V`) because they are read aloud across a room at a LAN
  party — see `LOBBY_CODE_ALPHABET` in `packages/game-protocol/src/protocol.ts`.

## Alternatives Considered

- **Raw `ws` + hand-rolled protocol.** Rejected: reinvents room lifecycle,
  reconnection, and state diffing that Colyseus already provides and that the
  brief explicitly calls out as supported (§12).
- **Socket.IO.** Rejected: no authoritative room/state-sync model; would
  require building exactly what Colyseus already is.
- **Decorator-based `@colyseus/schema` syntax.** Rejected for the reason
  above (`erasableSyntaxOnly`).
