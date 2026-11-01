# Architecture Decision Records

Numbered, append-only decision log. Superseding a decision means adding a new
ADR that says so and updating the old one's `Status` line — never silently
rewriting history.

| ADR                                           | Title                                                           |
| --------------------------------------------- | --------------------------------------------------------------- |
| [0001](0001-architecture.md)                  | Overall architecture; amended by 0022                           |
| [0002](0002-networking.md)                    | Networking (Colyseus); superseded by 0022                       |
| [0003](0003-simulation.md)                    | Simulation (fixed tick, determinism)                            |
| [0004](0004-skill-data.md)                    | Skill data representation and acquisition; amended by 0038      |
| [0005](0005-persistence.md)                   | Browser persistence                                             |
| [0006](0006-map-format.md)                    | Map representation                                              |
| [0007](0007-development-environment.md)       | Development environment (devenv)                                |
| [0008](0008-monorepo-and-typescript.md)       | Monorepo tooling and TypeScript configuration                   |
| [0009](0009-production-deployment.md)         | Production deployment; superseded by 0022                       |
| [0010](0010-rendering.md)                     | Rendering (Phaser 4 / WebGL)                                    |
| [0011](0011-browser-testing.md)               | Browser testing (Playwright)                                    |
| [0012](0012-equipment.md)                     | Equipment (weapons, armor, runes)                               |
| [0013](0013-schema-migration-registry.md)     | The schema migration registry                                   |
| [0014](0014-agent-coordination.md)            | Multi-agent coordination over Telegram                          |
| [0015](0015-agent-company.md)                 | The agent company's GitHub boundary                             |
| [0016](0016-no-backwards-compatibility.md)    | No backwards compatibility before 1.0                           |
| [0017](0017-shared-match-simulation.md)       | One steppable match simulation in `game-core`                   |
| [0018](0018-area-of-effect.md)                | Area of effect as an `area` modifier on the skill               |
| [0019](0019-status-modifiers.md)              | Crippled, dazed and blind reach the match                       |
| [0020](0020-training-playground.md)           | The Training Ground runs the simulation in the browser          |
| [0021](0021-ci-in-devenv.md)                  | CI in the devenv shell, every git hook                          |
| [0022](0022-peer-to-peer-networking.md)       | Peer-to-peer networking, host as authority; amended by 0032     |
| [0023](0023-one-telegram-bot.md)              | One Telegram bot for the whole company                          |
| [0024](0024-telegram-topics.md)               | Four Telegram topics: General, Bots, Manager, Operator          |
| [0025](0025-support-jail.md)                  | Support's jail holds no secret and can write nothing shared     |
| [0026](0026-weapon-auto-attack.md)            | Weapon auto-attack                                              |
| [0027](0027-one-turn-per-process.md)          | Agents run one turn per process                                 |
| [0028](0028-strudel-music-host.md)            | Strudel music engine in a sandboxed host                        |
| [0029](0029-attack-skills-ride-the-weapon.md) | Attack skills ride the weapon                                   |
| [0030](0030-screens-mount-once.md)            | Screens mount once and update in place                          |
| [0031](0031-company-credentials.md)           | The company authenticates as itself                             |
| [0032](0032-random-arena-queue.md)            | Strangers meet in unranked play through a ticket queue on Nostr |
| [0033](0033-company-commit-lock.md)           | A host-only lock pins the commit the company runs; superseded   |
| [0034](0034-operator-approves-reboots.md)     | The operator approves every reboot                              |
| [0035](0035-non-player-combatants.md)         | A creature is a participant with a creature record              |
| [0036](0036-weapon-sets.md)                   | Weapon sets are resolved at join and swapped by index           |
| [0037](0037-per-piece-armor.md)               | Insignia armor is per piece, and each hit rolls its piece       |
| [0038](0038-skill-corpus.md)                  | gw-skilldata is the skill corpus, vendored at a pinned commit   |
| [0039](0039-third-party-licences-page.md)     | Third-party credits and licences live on one Options page       |
| [0040](0040-team-lobby.md)                    | Team Lobby: the host runs a vote and claims before the match    |
| [0041](0041-always-in-a-lobby.md)             | Every player is always in a lobby, and the lobby is the party   |
| [0042](0042-team-matchmaking.md)              | Team modes queue whole teams; each side's host plans its seats  |
| [0043](0043-secret-lobby-key.md)              | The lobby key is a secret; relays see only a slow derivation    |
| [0044](0044-lock-decides-what-runs.md)        | The lock decides what runs; the checkout is the operator's      |
| [0045](0045-company-ci-runners.md)            | Company-hosted CI runners: one job per jail, allowlisted egress |
| [0046](0046-qa-merges-workflow-prs.md)        | qa-tester merges workflow PRs that cicd-engineer pushed         |
| [0047](0047-weapon-upgrades-without-items.md) | Weapon mods are ids on an equipped item, always perfect         |
