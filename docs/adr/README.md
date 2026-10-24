# Architecture Decision Records

Numbered, append-only decision log. Superseding a decision means adding a new
ADR that says so and updating the old one's `Status` line — never silently
rewriting history.

| ADR                                              | Title                                                  |
| ------------------------------------------------ | ------------------------------------------------------ |
| [0001](0001-architecture.md)                     | Overall architecture                                   |
| [0002](0002-networking.md)                       | Networking (Colyseus)                                  |
| [0003](0003-simulation.md)                       | Simulation (fixed tick, determinism)                   |
| [0004](0004-skill-data.md)                       | Skill data representation and acquisition              |
| [0005](0005-persistence.md)                      | Browser persistence                                    |
| [0006](0006-map-format.md)                       | Map representation                                     |
| [0007](0007-development-environment.md)          | Development environment (devenv)                       |
| [0008](0008-monorepo-and-typescript.md)          | Monorepo tooling and TypeScript configuration          |
| [0009](0009-production-deployment.md)            | Production deployment                                  |
| [0010](0010-rendering.md)                        | Rendering (Phaser 4 / WebGL)                           |
| [0011](0011-browser-testing.md)                  | Browser testing (Playwright)                           |
| [0012](0012-equipment.md)                        | Equipment (weapons, armor, runes)                      |
| [0013](0013-schema-migration-registry.md)        | The schema migration registry                          |
| [0014](0014-agent-coordination.md)               | Multi-agent coordination over Telegram                 |
| [0015](0015-agent-company.md)                    | The agent company's GitHub boundary                    |
| [0016](0016-no-backwards-compatibility.md)       | No backwards compatibility before 1.0                  |
| [0017](0017-shared-match-simulation.md)          | One steppable match simulation in `game-core`          |
| [0021](0021-ci-in-devenv.md)                     | CI in the devenv shell, every git hook                 |
| [0023](0023-one-telegram-bot.md)                 | One Telegram bot for the whole company                 |
| [0024](0024-telegram-topics.md)                  | Four Telegram topics: General, Bots, Manager, Operator |
| [0025](0025-an-agent-that-talks-to-strangers.md) | An agent that talks to strangers                       |
