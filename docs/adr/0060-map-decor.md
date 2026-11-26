# ADR-0060: Map decor is renderer-only data on the map

## Status

Accepted (2026-11-25). Issue #4013, epic #3976, following the populate study (`docs/art/populate-survey.md`, #4004). Builds on ADR-0006 (map format), ADR-0051 (discrete layers), ADR-0052 (map lighting) and ADR-0054 (static map art stays live).

## Context

The populate survey found large stretches of empty floor on most maps: walls, floor and lights, and nothing between them. A map needs props (braziers, crates, trees, ferns) that make a place read as a place. They must change nothing in play: the simulation is server-authoritative and deterministic, and a prop that a body could bump into, hide behind or path around is a balance change on every map it lands on.

## Decision

**Decor is a required `decor` array on every map document**, beside `gates`. An entry is `id`, `kind`, `at`, `layer`, `rotation` in degrees, `scale` in [0.75, 1.5] and `variant` in [0, 3]. The kinds are `brazier`, `crates`, `tree`, `fern`, `cinders`, a still ash drift lying flat on volcanic ground (#4018), and `reed`, a swaying reed clump that may stand in shallow water, never deep (#4019). Nothing that reads as solid or as harmful is decor: a column must block and a spike must hurt (operator, Q185), so each is a wall look or a hazard under its own card, never walk-through scenery. A map without the field fails validation, so saved and custom maps from before it are discarded (CLAUDE.md, ADR-0016).

**Nothing but the renderer reads it.** `game-core`, the sim, the nav graphs and the bots never see `decor`. A test holds that the nav graph and the sim's wall set are identical with and without it. Decor is part of the map, so the map's content hash changes with it.

**Cover is a wall with a look, never decor.** A boulder that blocks is a wall. The first card that places cover adds a `look` to walls with its art. Decor never blocks, so it never needs a "passable" flag.

**Drawn as vector shapes, not sprites.** `apps/web/src/render/decor-art.ts` draws one function per kind: a contact shadow toward +x +y, a lit flank toward the north-west light, a shaded flank, a lit top. The colours come from the biome palette, so one kind reads right in a hall or a jungle. Static props are painted into the map's static layer once per `drawMap`, sorted with the existing depth rule. No textures: ADR-0054 and #3506 measured their cost.

**Animated kinds are capped and cheap.** A brazier's flame changes every 66 ms, a tree sways over 5 s and a fern over 3 s, at most 2 px each way. They draw in a small per-frame layer, culled to the view, and hold at their mean under reduced motion. The tall kind (`tree`) fades off a body with the overhang fade (`OVERHANG_FADE_SECONDS`, `OVERHANG_FADED_ALPHA`), not a copy of it.

**The caps.** At most `MAX_DECOR` = 120 props on a map, and `MAX_ANIMATED_DECOR` = 16 of the animated kinds. The schema's refinements reject, each with a path to the entry: a duplicate id; a prop off its layer's floor (outside the bounds or over a pit), inside a wall of its layer, in deep water of its layer, or within 300 u of a spawn point; and a brazier without a light whose id starts `brazier-` within 40 u on its layer. A brazier's glow is a map light (ADR-0052), never self-lit.

**Placed with a seeded tool.** `pnpm decor:scatter <map> <kind> <polygon|rect> <count> --seed <n>` writes entries with fresh ids into `map.json`, and skips every spot the refinements would reject. The same seed gives the same output. Hand edits stay valid.

## Considered

- **Decor as walls with a "passable" flag.** One kind of map object, one renderer. Rejected: every wall consumer in the sim, the nav build and the bots would have to learn to skip the flag, and one that forgets turns scenery into cover. Keeping decor in its own field makes the separation a type, not a convention.
- **Textured sprites.** Richer art per prop. Rejected for now: #3506 and ADR-0054 measured textured area as the cost on a software renderer, and vector props reuse the lighting and depth rules the map already has.
- **An optional field with a default of `[]`.** Rejected: it exists only to accept maps from before the field (CLAUDE.md, ADR-0016).

## Consequences

- Every map document carries `"decor"`, empty on all but `ashen-courtyard` until each map's own populate card (study §7).
- Decor is cosmetic and need not be symmetric between the teams.
- Adding a kind is a schema change and a drawing function. Making a prop block is not a decor change; it is a wall.
