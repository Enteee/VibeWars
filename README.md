# vibewars

A browser-based, minimalist, multiplayer PvP arena game mechanically
inspired by Guild Wars 1 PvP — original implementation, original
geometric visuals, no proprietary GW1 assets or code. Built for LAN
parties: one host runs the server, friends open a URL and type a short
lobby code. No accounts, no database, no cloud.

See [`docs/product/master-brief.md`](docs/product/master-brief.md) for
the full product brief and sprint roadmap, and [`docs/adr/`](docs/adr/)
for the decisions behind this repository (start with
[ADR-0001](docs/adr/0001-architecture.md)).

## Play it

```sh
devenv shell          # Node 24 + pnpm, dependencies installed for you
pnpm run build
node apps/server/dist/main.js
```

The server listens on `0.0.0.0:2567` and serves the built client
automatically — no configuration needed. Everyone on the LAN opens
`http://<host-ip>:2567`, one person hosts a lobby, the rest type the
code.

| Key             | Action                              |
| --------------- | ----------------------------------- |
| `W` `A` `S` `D` | Move                                |
| Left click      | Target (click empty space to clear) |
| `1`–`9`, `0`    | Use the matching skill-bar slot     |
| `Esc`           | Leave the match                     |

To try the character editor and the roster without hosting anything,
open the static build on GitHub Pages:
[the latest release](https://enteee.github.io/VibeWars/) or
[the latest `main`](https://enteee.github.io/VibeWars/next/). Online play
is disabled there, because it needs the server above (or `pnpm run dev`)
until peer-to-peer play lands (#15). The two keep separate saved
characters.

If `devenv` is unavailable, any Node 24 with `pnpm@10` works — every
command is a plain `pnpm` script (see `package.json`). This repository's
own development was verified that way; see
[ADR-0007](docs/adr/0007-development-environment.md) for why.

## What works today

- **Real-time authoritative combat** on a fixed 20 Hz server tick:
  movement, collision, body blocking, line of sight, targeting, casting
  with cast and recharge times, energy and adrenaline economies.
- **Mechanics**: 8 conditions, hexes, enchantments, interrupts, health
  degeneration and regeneration, death and respawn.
- **12 implemented skills**: 9 of the 16 in a reference corpus imported
  from public GW1 data, plus 3 of our own design. The other 7 need
  mechanics that do not exist yet and are reported as a machine-readable
  gap, with a reason each (`node packages/game-data/dist/run-cli.js coverage`).
- **Four original arenas**: a chokepoint, an open field, split paths and
  a pillar hall, selectable by the lobby host.
- **Lobby** with shareable codes, team assignment, ready state and
  repeatable matches.
- **Character builder** with profession/attribute rules and versioned
  browser-local persistence. Pick a character on the menu and you take
  that build into the match — the server validates it and falls back to a
  default loadout if it is illegal, so a build is a request, never a
  claim.
- **Team builder** for planning a roster: create, rename, add, remove,
  reorder, duplicate and delete, at any team size. A team is a local
  planning tool — see the limits below.
- **Match rules**: score, clock, victory conditions.
- **Robustness**: a dropped player keeps their slot for 30 seconds and
  reconnects to the same character; hostile input cannot crash the
  server (fuzz-tested).

Honest limits:

- Area-of-effect, projectile travel time, weapon auto-attacks, knockdowns
  and spirits/wards/traps are **not** implemented. Skills needing them
  are deliberately absent from the catalog rather than present with
  watered-down effects (brief §9).
- A **saved team is not yet taken into a match**. You can build and
  organise a roster, and each player picks their own character from it,
  but the lobby does not assign a team's slots to the players in it.
  Teams are first-class objects in storage (brief §4) and a planning tool
  in practice.
- Kills score for a **team**, not a player. Per-player credit needs
  damage-source tracking that does not exist, and inventing an
  attribution would put a plausible lie on the scoreboard.

## Repository layout

```text
apps/
  server/   Authoritative Colyseus game server
  web/      Browser client (HTML/CSS shell + Phaser 4 viewport)
packages/
  game-core/      Pure domain logic: combat, skills, geometry, rules
  game-protocol/  The client/server wire contract
  game-maps/      Declarative arenas + loader/validator
  game-data/      GW1 reference-skill import pipeline + dev CLI
docs/
  product/master-brief.md   Product brief and sprint roadmap
  adr/                      Architectural Decision Records
```

`game-core` depends on nothing else in the workspace and never touches a
socket, a renderer or a clock — which is what makes combat testable
headlessly. See [ARCHITECTURE.md](ARCHITECTURE.md).

## Development

```sh
pnpm run dev      # the whole game, reloading as you edit
```

Opens the client on <http://localhost:5173> with the game server on 2567.
Editing the client reloads the page; editing the server or any package
rebuilds and restarts it. Ctrl-C stops all three watchers.

Use `pnpm run build && node apps/server/dist/main.js` instead when you
want the real single-port setup — that is what LAN guests connect to, and
it is what the browser tests run against.

```sh
pnpm run ci       # format + lint + typecheck + test + build
pnpm run test     # 583 tests: unit, integration, fuzz, headless simulation
pnpm run test:e2e # 19 browser tests in a real Chromium (needs one installed)
pnpm run ci:full  # both of the above
```

`devenv test` runs the same sequence. See
[CONTRIBUTING.md](CONTRIBUTING.md).

### Dev tools

```sh
pnpm --filter @vibewars/game-data run build
node packages/game-data/dist/run-cli.js skills      # inspect skills
node packages/game-data/dist/run-cli.js statuses    # conditions/hexes/enchantments
node packages/game-data/dist/run-cli.js coverage    # imported vs implemented
node packages/game-data/dist/run-cli.js duel elementalist.fireball ranger.troll-unguent
```

The duel runner simulates real combat headlessly and deterministically
from a seed — useful for balance questions and for reproducing bugs.

### Agent swarm

```sh
claude-bot architect   # a sandboxed Claude agent, in a role, on Telegram
```

Each role runs in its own bubblewrap jail on its own `git worktree`, and
coordinates with the others through a Telegram supergroup — one topic per
role — which doubles as a log and a remote control you can read on a
phone. Inside the jail, `tg send`/`tg inbox`/`tg wait`/`tg roster` are the
agent's only way out; the bot token stays outside it.

Needs one manager-bot token in `devenv.local.nix`. Setup, the two taps
each new role costs, and why it is built this way:
[ADR-0014](docs/adr/0014-agent-coordination.md).

## License

AGPL-3.0-or-later; the full text is in [`LICENSE`](LICENSE). No proprietary Guild Wars assets, code or map
geometry are included or depended on; the GW1 skill corpus used for
reference is treated as reference _data_ with recorded provenance, never
a runtime dependency — see [ADR-0004](docs/adr/0004-skill-data.md).
