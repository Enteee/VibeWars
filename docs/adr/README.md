# Architecture Decision Records

Numbered, append-only decision log. Superseding a decision means adding a new
ADR that says so and updating the old one's `Status` line — never silently
rewriting history.

| ADR                                     | Title                                         |
| --------------------------------------- | --------------------------------------------- |
| [0001](0001-architecture.md)            | Overall architecture                          |
| [0002](0002-networking.md)              | Networking (Colyseus)                         |
| [0003](0003-simulation.md)              | Simulation (fixed tick, determinism)          |
| [0004](0004-skill-data.md)              | Skill data representation and acquisition     |
| [0005](0005-persistence.md)             | Browser persistence                           |
| [0006](0006-map-format.md)              | Map representation                            |
| [0007](0007-development-environment.md) | Development environment (devenv)              |
| [0008](0008-monorepo-and-typescript.md) | Monorepo tooling and TypeScript configuration |
| [0009](0009-production-deployment.md)   | Production deployment                         |
| [0010](0010-rendering.md)               | Rendering (Phaser 4 / WebGL)                  |
| [0011](0011-browser-testing.md)         | Browser testing (Playwright)                  |
