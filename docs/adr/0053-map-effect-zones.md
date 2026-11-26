# ADR-0053: Map effect zones name a kind; game-core holds what it does

## Status

Accepted (2026-11-10). Issue #3024, epic #3022. Builds on ADR-0006 (map format), ADR-0051 (discrete layers) and ADR-0052 (map lighting).

## Context

The world elements epic (#3022) puts hazards on the ground: burning ground first, more kinds card by card. A zone has to change the fight, so the simulation must read it, deterministically. Maps are data that designers edit; balance is code that one place owns.

## Decision

**A map names a zone's kind, never its numbers.** `zones` on a map is optional, at most 32 (`MAX_ZONES`): each one an `id`, a `kind`, a `layer` and an `area`, a rectangle or a polygon as water's. The schema takes the kinds from game-core's `ZONE_KINDS`, so a map cannot name one the simulation has no rule for.

**game-core owns the rule for each kind**, in `ZONE_RULES` (`packages/game-core/src/match/zones.ts`): the status a body in it bears, and how long that lingers once it steps out. `scorched` is Burning for 3 s. game-core still never imports game-maps; `matchZones` in game-maps turns each area into a polygon, and the host, its tests and Training pass the result to `MatchSimulation` as they pass layers.

**One rule a tick, after a body moves and before its statuses run.** Each living body that is not a spirit, inside a zone on its own layer, has the kind's status applied again for the linger. Zones are taken in the map's order, for each body in the simulation's order, so the tick is deterministic. A status is one per id, so two overlapping zones of one kind refresh one Burning; two kinds stack. `applyStatus` already refuses a condition to the invulnerable.

**The environment is the source.** The status carries `zone:<id>`, which is no participant: no foe team is recorded, so nobody is credited with a kill, morale or damage, as with Beacon Lightning.

**The renderer draws a zone as a tinted area with a hard edge**, from the map file, as it draws water. The look is per kind, in `ZONE_LOOK` (`apps/web/src/render/zone-look.ts`), and the fill breathes unless the player asks for less motion. A zone draws over its layer's water and lighting, which never darken it (ADR-0052: what matters to the fight stays readable), and under its torches and whoever stands in it. Nothing goes over the wire: clients read zones from their own map file.

## Considered

- **Numbers in the map JSON** (`status`, `seconds`, `damage` per zone). Every map would carry its own balance, a patch would mean editing each map, and two maps could disagree about what scorched ground does. Rejected: maps name a kind.
- **A physics or particle simulation** (fire that spreads, smoke that drifts and blocks). Not deterministic for free, costly every tick, and far from GW1, where hazards are fixed ground. Rejected: a zone is static data plus one scripted rule.
- **A zone as a creature or a ground effect.** Ground effects are cast, owned and timed; a zone is part of the map, owned by nobody, and lasts the match.

## Consequences

Each later kind (#3022's children) adds a member to `ZONE_KINDS`, its rule to `ZONE_RULES` and its look to `ZONE_LOOK`; the type system holds the three together. Bots do not yet avoid zones (a separate card). A kind whose rule is more than one status, such as healing ground or a slow, needs `ZoneRule` to grow, in this ADR's spirit: still one rule, still in game-core.
