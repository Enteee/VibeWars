# Contributing

## Setup

```sh
devenv shell
```

This provides Node 24 and pnpm and installs dependencies automatically. If
`devenv` is not available to you, any Node 24+ with `pnpm@10` works — every
command below is a plain `pnpm` script underneath (see `package.json`).

## Everyday commands

```sh
pnpm run dev           # the client on :5173, reloading as you edit
pnpm run build         # build every package/app
pnpm run test          # the headless suite
pnpm run test:e2e      # browser tests (Playwright; needs a Chromium)
pnpm run ci:full       # ci + browser tests
pnpm run test:watch    # watch mode
pnpm run lint          # ESLint (type-aware), zero warnings allowed
pnpm run format        # Prettier, writes
pnpm run format:check  # Prettier, checks only (what CI runs)
pnpm run typecheck     # tsc --build across every project, plus tests/configs
pnpm run ci            # format:check + lint + typecheck + test + build, in order
pnpm run bench:ticks   # time MatchSimulation.step on a dense field: p50/p95/max (#542)
                       # BENCH_CROWD=followers: 32 minions walking back round its pillars (#1157)
                       # BENCH_CROWD=casters: 16 bodies using their bars; BENCH_SKILLS=id,... fills them (#1588)
pnpm run readme:shots  # retake the README's four screenshots in docs/media/ (#1347)
```

`devenv test` runs the same sequence as `pnpm run ci` via `enterTest` in
`devenv.nix` — see ADR-0007 for why both exist.

### How `pnpm run dev` is wired

`scripts/dev.mjs` first builds the packages once, so a fresh pull needs no
manual build, then runs two watchers: `tsc --build --watch` for the
packages, and Vite for the client. There is no server: the client plays
peer to peer (#15, ADR-0022). Two tabs of the dev client on one machine find each other over the public
Nostr relays, as two browsers anywhere do.

Players behind symmetric NAT or CGNAT need a TURN relay. To run one for
your friends from this devenv, see
[Running a TURN relay](docs/development/turn.md).

## Before opening a PR

A sprint (or a PR within one) is not done until its required checks are
green in CI, which runs `pnpm run ci` and the browser tests (#35). The
commands stay documented above for running them yourself. This is not a suggestion — see `docs/product/master-brief.md`
§37/§39 (Definition of Done): a feature without tests, without passing
typecheck/lint, or that only works "if you don't look too closely" is not
complete, regardless of how it behaves manually.

Concretely:

- New pure logic (domain math, protocol validation, config parsing) gets
  unit tests in `packages/*/src/*.test.ts` or `apps/*/src/*.test.ts`,
  colocated with the code.
- New session behaviour that touches the network gets an integration test in
  `packages/game-session`: a real `MatchHost` or `LobbyHost` and real
  clients over the in-memory `Transport` (see `match-host-room.test.ts`),
  which delivers asynchronously and can drop and partition peers. Not a mock
  of the host: the host is the code under test.
- New behaviour in the application shell (`apps/web/src/main.ts`) — how
  screens and connections are sequenced — gets a browser test in `e2e/`.
  Both bugs ADR-0011 describes lived there, were invisible to every
  headless test, and made the game unplayable through its main flow.
- A new skill goes in `packages/game-core/src/skills/catalog/<profession>.ts`,
  its status in `skills/statuses/<profession>.ts` and its icon rows in a
  file of the card's own, `scripts/assets/skill-icons/<profession>/<issue>-<slug>.mjs`
  (skill) and `scripts/assets/status-icons/<profession>/<issue>-<slug>.mjs`
  (status), and a new glyph in `scripts/assets/glyphs/<issue>-<slug>.mjs`, so
  two icon cards never edit the same file (#2021). It then re-runs
  `node scripts/assets/icons.mjs`; `apps/web/src/ui/icons.test.ts` fails
  until it does.
- Vendoring or bundling a third-party work whose licence asks for a notice
  adds its entry to `THIRD_PARTY_LICENCES` (Options → Third-party licences)
  in the same PR. That page is the only place the UI credits one: see ADR-0039.
- `any`, `as any`, and non-null assertions (`!`) are lint errors, not style
  preferences — see ADR-0008. If one is genuinely unavoidable, say why in a
  comment at the exact line, not in a blanket lint-rule override.
- No backwards-compatibility code: no migrations, no version windows, no
  "absent means old" defaults. A changed stored shape discards old data.
  See `CLAUDE.md` and ADR-0016.
- A new architecturally significant decision (new major dependency, new
  package, a changed data format) gets an ADR in `docs/adr/`, using
  `docs/adr/0000-template.md`. "Architecturally significant" means: would a
  new contributor need this explained to understand why the code looks the
  way it does? If yes, write it down once instead of explaining it in every
  future code review.

### Generated files

Generated files: `packages/game-protocol/src/wire-schema.json`, the roles
snapshot (`packages/game-core/src/skills/__snapshots__/roles.test.ts.snap`),
and the SVGs in `apps/web/public/icons/`. Never hand-merge them. The icon
rows and glyphs under `scripts/assets/` are hand-written, one file per card,
so they do not conflict.

`.gitattributes` makes git keep both sides of the roles snapshot
(`merge=union`). For any conflict left in a
generated file:

```sh
git checkout --theirs <file>   # your side in a rebase; --ours in a merge
pnpm run regen
git add <file>
```

The icon, snapshot and wire tests fail in CI on a stale result.

## Documentation

Two audiences, kept apart:

- `docs/player/` is for players. The in-game Help screen renders these
  pages, listed in `docs/player/index.md`. Write them in plain words,
  about what a player sees and does. No internals: no file names, issue
  numbers, constants or code. A PR that changes what a player sees or does
  updates the matching page, or says in its description why none applies.
- `docs/gameplay/`, `docs/adr/`, `docs/development/`, `docs/art/` and
  `docs/product/`, like everything else outside `docs/player/`, are for
  developers. They are never shown in Help.

## Commit style

Small, focused commits. A commit message explains _why_, not just _what_ —
the diff already shows what changed.

## Project structure

See [ARCHITECTURE.md](ARCHITECTURE.md) for the current shape of the system
and [docs/adr/](docs/adr/) for the reasoning behind it. The full product
brief and sprint roadmap are in
[docs/product/master-brief.md](docs/product/master-brief.md) — treat it as
the source of truth for scope; if a sprint's acceptance criteria seem to
conflict with something already built, that is worth a conversation (or an
ADR), not a silent reinterpretation in either direction.

## Issues and comments from outside the project

VibeWars is built by a company of AI agents, run by the operator
([@Enteee](https://github.com/Enteee)). What a host needs to run it:
[Host prerequisites for the agent company](docs/development/agent-company-host.md).

- An issue or PR you open is not seen by the agents until the operator
  triages it onto the board. It may wait, and it may be closed without a
  reply.
- Your comments are not shown to the agents at all. The operator reads
  them.
- Security reports: follow [`SECURITY.md`](SECURITY.md), never a public
  issue.
