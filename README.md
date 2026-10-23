# vibewars

A browser-based, minimalist, multiplayer PvP arena game mechanically inspired
by Guild Wars 1 PvP — original implementation, original geometric visuals, no
proprietary GW1 assets or code. Designed for LAN parties: one host runs the
server, friends join from a browser with a short lobby code, no accounts and
no database.

See `docs/product/master-brief.md` for the full product brief and sprint
roadmap, and `docs/adr/` for the architectural decisions behind this
repository (start with [ADR-0001](docs/adr/0001-architecture.md)).

## Status

Early, actively developed. Sprint 0/1 (foundation) is in place: a working
Colyseus server, a Phaser 4 browser shell, and the monorepo/tooling they run
in. Gameplay (professions, attributes, skills, combat) has not been built
yet — see `docs/product/master-brief.md` for the sprint-by-sprint plan.

## Quick start

```sh
devenv shell      # Node 24 + pnpm, installed automatically
pnpm run build    # builds every package and app
pnpm run test     # full test suite (unit + real Colyseus integration tests)
```

Then run the server:

```sh
node apps/server/dist/main.js
```

It listens on `0.0.0.0:2567` by default and automatically serves the built
web client if `apps/web/dist` exists next to it — no configuration needed for
the common case. Open `http://<host-machine-lan-ip>:2567` from any browser on
the LAN. See `docs/development/environment-variables.md` for the handful of
overrides available (`PORT`, `HOST`, `VIBEWARS_WEB_ROOT`, `VIBEWARS_DEV`).

If `devenv shell` is not available in your environment, every command above
also has a plain `pnpm` equivalent — see `package.json`'s `scripts`. (This
repository's own Sprint 0 work was verified that way; see
[ADR-0007](docs/adr/0007-development-environment.md) for why.)

## Repository layout

```text
apps/
  server/   Authoritative Colyseus game server
  web/      Browser client (HTML/CSS shell + Phaser 4 viewport)
packages/
  game-core/      Pure game-domain primitives (deterministic, headlessly testable)
  game-protocol/  The client/server wire contract
docs/
  product/master-brief.md   The full product brief and sprint roadmap
  adr/                       Architectural Decision Records
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for how these pieces fit together, and
[CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow.

## License

AGPL-3.0-or-later (see `package.json`). No proprietary Guild Wars assets,
code, or map geometry are included or depended on; the GW1 skill corpus used
for reference during development is treated as reference _data_, not a
runtime dependency — see
[ADR-0004](docs/adr/0004-skill-data.md).
