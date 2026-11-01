# Architecture

A short orientation to the current shape of the system. The authoritative
record of _why_ each decision was made lives in `docs/adr/`; read the ADRs
for rationale and trade-offs.

## Big picture

```text
  ┌───────────────────────────────┐        ┌─────────────────────────┐
  │  host's browser (apps/web)    │        │ a joiner's browser      │
  │                               │        │ (apps/web)              │
  │  MatchHost / LobbyHost        │        │                         │
  │  (game-session): ALL          │◄──────►│ connectMatch/joinLobby  │
  │  authoritative state, ticked  │ Trans- │ sends: ClientIntent     │
  │  by a Worker clock            │ port   │ receives: snapshots,    │
  │                               │(WebRTC │ combat, skill bar       │
  │  its own player: a local peer │ via    │                         │
  │  Phaser 4 viewport (renders   │ Trys-  │ Phaser 4 viewport       │
  │  only, no game rules)         │ tero)  │                         │
  └───────────────┬───────────────┘        └────────────┬────────────┘
                  │ uses                                 │ uses
                  └────────────────┬─────────────────────┘
                 ┌─────────────────▼────────┐
                 │      packages/*          │
                 │  game-core    domain     │
                 │  game-protocol wire      │
                 │  game-session P2P        │
                 │  game-maps    arenas     │
                 │  game-data    reference  │
                 └──────────────────────────┘
```

There is no game server ([ADR-0022](docs/adr/0022-peer-to-peer-networking.md)).
The page is a static site (GitHub Pages); one player's browser hosts the
lobby and its match, and public Nostr relays only introduce the peers:
by a lobby key, or, for Random Arena, by tickets every queued client
reads to work out the same match ([ADR-0032](docs/adr/0032-random-arena-queue.md)).

Dependencies point one way only (ADR-0001). `game-core` depends on nothing
else in the workspace and never touches a socket, a renderer or a clock.
That is what makes combat testable headlessly — and it is why the duel
runner can simulate a real fight with no network and no browser running.

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
  here as _data_, so the live host and the headless runner cannot drift
  into describing different games.
- `professions.ts`, `attributes.ts`, `character.ts` — 10 professions with
  4–5 attributes each, the attribute cost curve and point budget, and
  character validation.
- `build.ts` — a character plus their skill bar, and the validation the
  **host** applies when a peer claims one at join time. It lives here so
  the host, the build editor and the Training Ground run one copy of the
  rules; a second copy would be the obvious way to get them quietly
  disagreeing.
- `equipment/` — weapons, off-hands, armor, runes, insignias and weapon
  mods (ADR-0047) as static catalogs, plus resolving a build's equipment
  into the numbers a fight uses (ADR-0012). `weapons.ts` is the one table
  of weapon damage, speed, range and projectile speed.
- `skills/` — the composable skill system (see below).
- `match-rules.ts` — score target, clock, and victory evaluation.
- `match/` — the one copy of the per-tick pipeline (ADR-0017).
  `simulation.ts` is `MatchSimulation`: movement (clamped to the map
  bounds), collision, casting, weapon auto-attacks and their approach,
  projectiles in flight, effects, statuses, death, respawn and scoring,
  stepped by whoever owns the clock. `facing.ts` defines where a
  participant looks. `combat-log.ts` records each resolution with its
  source and time. `behaviour.ts` turns behaviours (data) into the same
  intents a player sends; `bot/play-build.ts` thinks by trying
  `bot/rules/index.ts`'s `BOT_RULES` in order, one file per rule. A new
  bot rule = `bot/rules/<name>.ts` + its test + one line in
  `bot/rules/index.ts`. `training-scenarios.ts` holds the Training
  Ground's scenarios as data (ADR-0020).
  Creatures, bodies that are not players, are participants with a
  `creature` record that never count for their team (ADR-0035).
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
status.ts        condition/hex/enchantment stacking rules
statuses/        the status definitions, one file per profession
tick.ts          per-tick status advancement (degen, regen, expiry)
catalog.ts       the implemented skills, gathered from catalog/
catalog/         the skills as data, one file per profession
coverage.ts      imported corpus vs implemented — the honest gap report
damage.ts        the damage pipeline: armor, penetration, every point of damage
targeting.ts     who a landed skill hits: the target, or everyone in its area
weapon-attack.ts what one weapon swing does when it lands (ADR-0026)
projectile.ts    a ranged shot in flight, led at where the target is going
describe.ts      skill descriptions, generated from the effect data
```

Adding a skill means adding an entry to `catalog/<profession>.ts`, and
its status, if it has one, to `statuses/<profession>.ts`. If it needs a
mechanic that does not exist yet, the correct move is to **not add it** —
see "Honest coverage" below.

### `packages/game-protocol` — the wire contract

The closed set of messages a client may send (`ClientIntent`), the
peer-to-peer messages host and peers exchange, one per `CHANNELS` entry,
with a validator each (`src/p2p.ts`), the lobby-code alphabet, and the
protocol version a host checks at join time.

The version is not written by hand (#303), and no hash is committed (#950).
`src/wire-schema.json` is a committed, generated description of everything
that crosses between peers: the channel names; every type this package
exports and game-core's `CombatEvent`, structurally; every literal constant
it exports (limits, refusal reasons); and the status table a snapshot
indexes into (#632). `PROTOCOL_VERSION` is computed when
`src/protocol-version.ts` loads: a 12-digit FNV-1a fingerprint of that
file's parsed JSON. A wire change changes the schema and so the version.
The schema is canonical, with sorted keys, unions and status ids, so two
wire changes conflict only where they touch the same lines.
`pnpm run wire:snapshot` regenerates the schema, with game-session's
`src/tools/wire-snapshot.ts`; its test fails a change that did not. A change
in meaning with no change in shape bumps `SEMANTICS_REVISION` in the
generator by hand.

### `packages/game-session` — peer-to-peer sessions

Epic #15 ([ADR-0022](docs/adr/0022-peer-to-peer-networking.md)): a lobby and
its match hosted in one player's browser. It holds
the `Transport` interface every peer-to-peer transport implements, and an
in-memory one for tests (`@vibewars/game-session/testing`); `MatchHost` and
`connectMatch` (#375); and `LobbyHost` and `joinLobby` (#379). The lobby's
host is its match's host, and seats only the peers the lobby put on a team.
`scopeTransport` gives each match its own handlers on the lobby's room, so
leaving the match does not leave the lobby. It compiles with
no DOM and no Node types, and may not import `node:*` or `trystero`. Its
messages, one per `CHANNELS` entry, and their validators are in
`game-protocol`'s `src/p2p.ts`. Every per-tick host message is packed by bytes
into frames of `MAX_MESSAGE_BYTES` (`packSnapshot`, #662; `packCombat`, #601),
and no message relies on Trystero's chunking.

It also holds what the Training Ground and a P2P host share (#375), so the
two cannot drift: `MatchConnection` and the snapshot
types the client draws, `MessageBudget` (a token bucket per client on
inbound messages, #43: over budget, a message is ignored rather than its
sender dropped), `sanitizeName`, `spawnPoint`, and `recharge.ts` (when a
player's recharges are re-sent: only when they drift from the client's
countdown by more than one 50 ms tick, #152). game-core holds the rest of
the shared match code: `applyIntent`, `resolveJoinLoadout` and the starter
builds (`starter-builds.ts`), and the fixed-step `drainAccumulator`.

### `packages/game-maps` — arenas

Declarative map documents (`maps/*/`), a zod schema, a loader/validator and
derived geometry (wall segments, spawn points by team). Four arenas ship:
`arena-alpha` (chokepoint), `arena-open`, `arena-split`, `arena-pillars`.
Map geometry is original (brief §41) — see ADR-0006 for the format.

### `packages/game-data` — reference data, not a runtime dependency

The GW1 skill-corpus ingestion pipeline (ADR-0004). It parses public
reference data, preserves provenance, and emits a normalized bundle that is
committed to the repository. **The game never calls this package at
runtime.** It also hosts the developer CLI, because the coverage report
needs both the corpus and `game-core`, and this is the only package where
both are legitimately in scope.

## The apps

### `apps/web`

- `main.ts` — the app-shell state machine (menu → builders → lobby → match).
- `match-view.ts` — owns a live match's lifetime, including full teardown.
- `net/` — the P2P side of the shell. `transport/` is the `Transport`:
  Trystero over WebRTC, with public Nostr relays to introduce peers, or a
  `BroadcastChannel` between tabs for the browser tests; `host-clock.ts`
  ticks a host from a Worker, so a hidden tab keeps time. `session.ts` runs
  game-session's lobby and match sessions over it: host or join by code, and
  a dropped peer rejoins inside `RECONNECT_WINDOW_SECONDS` (#515).
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

## Deploy target

**GitHub Pages** (`.github/workflows/pages.yml`, #103): the client alone, as
a static site, built with `VIBEWARS_BASE` (a sub-path). `/next/` follows
`main`, and the root follows the latest release. Online play is peer to peer
over Trystero (#15, #403): one player's browser hosts the lobby and its
match, and no server is involved. Each base path gets its own storage
namespace (`storage/namespace.ts`), so the two builds on one origin never
read each other's saves. Local play is `pnpm run dev`.

A deploy deletes the previous build's chunks, so a tab left open across it
would fail at its next lazy import. Each build carries its commit as an id
and serves it as `build.json` (#1268); a tab that sees another id says so,
and reloads itself once the player is back on the menu (`build-check.ts`).

## Two rules worth stating plainly

**The client sends intent, never outcomes** (brief §12, §32, §33). It may
say "I want to use skill 3 on that player". It may never say "I hit for 91
damage". Damage, health, position, cooldowns and energy are the host's.
The host is trusted for outcomes (ADR-0022), and every peer still validates
what the host sends.

**The Training Ground measures; it never decides** (ADR-0020). The
character editor runs the real `MatchSimulation` in the browser, against
dummies, so a player can see what a build does. Nothing it computes is sent
anywhere, and a networked match is decided only by its host. It is
trustworthy only because it is the identical code, so a game rule belongs in
`MatchSimulation`, never in `MatchHost`.

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

Headless tests in five layers, plus a browser suite:

- **Unit** (`packages/*/src/*.test.ts`) — pure functions, no I/O.
- **Integration** (`packages/game-session/src/*.test.ts`) — a host and its
  peers over the in-memory `Transport`, which delivers a microtask later and
  copies every message, so a handler that sends while handling is caught.
  Peers drop, rejoin and are partitioned on purpose (`match-reconnect`,
  `lobby-match`).
- **Fuzz** (`game-protocol/src/protocol-fuzz.test.ts`,
  `game-session/src/match-hostile.test.ts`, `lobby-hostile.test.ts`) —
  hostile and malformed peer messages plus a seeded corpus. The rule they
  enforce is brief §27: a host must never crash on a peer's input.
- **Benchmark** (`game-session/src/benchmark.test.ts`) — a host's tick at 1v1,
  4v4 and 8v8 under load, against its 50 ms budget
  ([benchmarks](docs/development/benchmarks.md)).
- **Headless simulation** (`tools/headless-match.test.ts`) — whole fights,
  deterministically, with no network.
- **Browser** (`e2e/*.spec.ts`, Playwright) — a real Chromium against the
  built client, its peers tabs of one browser over `BroadcastChannel`:
  open a tab's lobby, join it from a second tab, start a match, move,
  cast. Movement is asserted by comparing
  rendered frames rather than through a test-only hook, so the test
  cannot pass against a code path players never run. This layer found two
  bugs that made the lobby unplayable and that nothing headless could
  have caught — see ADR-0011.

Run everything with `pnpm run test`, or `pnpm run ci` / `devenv test` for
the full format → lint → typecheck → test → build sequence.
