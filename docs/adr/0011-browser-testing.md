# ADR-0011: Browser tests with Playwright against a system Chromium

- Status: Accepted
- Date: 2026-10-24

## Context

The brief requires a browser-test layer (§31): create lobby, join lobby,
create character, create team, start match, basic movement, skill
activation. Until now this layer did not exist, and — worse — two code
comments claimed it did ("its DOM rendering is covered by the browser
tests"). The headless suite was large and healthy, which made the gap
easy to overlook.

The gap was not theoretical. Everything below the UI was well covered:
the server simulation, the protocol, the storage layer, the skill engine.
What nothing covered was the _application shell_ — how screens and
connections are sequenced in `apps/web/src/main.ts`. That is exactly
where the game was broken.

Two problems also had to be settled:

1. **Which browser.** Playwright normally downloads and manages its own
   browser builds. This environment cannot fetch them (the same
   constraint ADR-0007 documents for devenv realization).
2. **How to assert on a WebGL canvas.** The arena has no DOM to inspect.

## Decision

Use **Playwright** with a **system Chromium**, pinned through
`devenv.nix` (`pkgs.chromium`, exposed as `VIBEWARS_CHROMIUM`). The
config resolves the browser from that variable, falling back to whatever
is on `PATH`.

Tests live in `e2e/*.spec.ts` and run against the **production entry
point** (`node apps/server/dist/main.js` serving the built client), not a
dev server, so they cannot pass against a code path players never run.

Assert on rendering by **comparing rendered frames**. A movement test
screenshots the canvas, holds a key, and screenshots again — with a
control that asserts the idle arena does _not_ animate, so a changed
frame means the player moved.

`devenv test` runs the browser suite last, after the headless suite and
the build. `pnpm run ci` deliberately does not: it stays fast and
browser-free, and `pnpm run ci:full` is the one that includes e2e.

## Consequences

### What this bought immediately

The suite found two bugs on its first run, both of which made the game
**unplayable through its main flow**, and neither of which any headless
test could have caught:

1. **Hosting a lobby threw.** `client.create()` resolves on the WebSocket
   handshake, but the first state patch is a later message — so
   `room.state.players` was genuinely `undefined` when the UI first read
   it, whatever the decoded-state type said. The server's own tests never
   saw this because their `waitFor` helper treats a throwing predicate as
   "not ready yet", which is precisely the behaviour a real UI does not
   have.

2. **Starting a match bounced you back to the lobby.** The lobby
   connection stays open during a match, so its "phase → in-match"
   broadcast fired `renderLobby()` just after the match view had shown
   the viewport — hiding it again, with the match running unseen
   underneath. A synchronous `enteringMatch` flag guards it, because
   `match` itself is only assigned after an `await` that the broadcast
   can land inside.

Both are integration faults between components that were individually
correct and individually well tested. That is the category this layer
exists to catch.

### Costs

- A browser must be available to run `devenv test`. Mitigated by pinning
  it in `devenv.nix` rather than relying on an ad-hoc install.
- Frame comparison is coarse: it proves _something_ moved, not that it
  moved to a specific coordinate. Precise movement is already covered
  exactly where precision belongs — `game-core`'s movement and collision
  unit tests, which assert positions to the unit.
- `--no-sandbox` is required, because this environment cannot nest
  Chromium's own sandbox. Acceptable here: the only page ever loaded is
  our own client.

### Rejected alternatives

- **A simulated DOM (jsdom/happy-dom) in Vitest.** Cheaper, but it has no
  WebGL and no real event loop, so it could not have found either bug —
  and ADR-0001 deliberately keeps a browser dependency out of the
  simulation's test environment.
- **A test-only hook on `window` exposing match state.** It would make
  assertions easy and precise, but the test would then verify a code path
  that only exists for tests, and it adds production surface for no
  player-facing benefit.
- **Playwright-managed browser downloads.** Not available here, and an
  unversioned binary fetched on first run sits badly next to a repository
  that pins everything else.
