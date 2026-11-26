# ADR-0052: Maps are lit per layer, by the renderer alone

## Status

Accepted (2026-11-09). Issue #2986, epic #2976, operator request. Builds on ADR-0010 (rendering), ADR-0006 (map format) and ADR-0051 (discrete layers).

## Context

The 2.5D arenas are flat-lit. The operator wants sun, torches, fire, shadows and dark corners. Light must not change who can see or hit whom: the simulation is deterministic and knows nothing of rendering, and a fight has to stay readable in the darkest corner of a map.

## Decision

**Lighting is map data that only the renderer reads.** `lighting` on a map is optional, and a map without it is lit flat. The simulation never reads it: no stealth, no vision, no gameplay effect of any kind. The maths lives in `apps/web/src/render/lighting-model.ts`, outside `game-core`, so it cannot be reached from there.

**The model is a half-resolution light map per layer, multiplied over that layer's surfaces.** Each map starts from the ambient, indoor or outdoor, and adds a radial quadratic falloff per light, clipped by shadow polygons. The sun adds outdoors only, scaled by the sine of its elevation. On WebGL through Phaser 4 (ADR-0010).

**Static geometry is drawn once.** A layer's light map is rebuilt only when flicker needs it, and only the lights that flicker are redrawn.

**The budget is 2 ms per frame** for the lighting pass at the reference `perf-sec-qa` measures on, with no per-frame allocation in the hot path. `lightAt` fills a caller's sample for that reason. Over budget, it degrades in this order: flicker off, shadows off, flat.

**Nothing that matters to the fight is darkened.** A body's tint comes from `lightAt` at its feet and is clamped to at least 0.7 (`BODY_LIGHT_FLOOR`). A surface never falls below 0.45 (`SURFACE_LIGHT_FLOOR`). UI, ground effects, telegraphs and hidden outlines are drawn after lighting, unlit. Shadows darken surfaces only, so `lightAt` ignores them, and a body behind a wall keeps its colour.

**A light lights its own layer.** Under a deck, layer 0 gets the deck's sun shadow. The sun reaches every layer; `indoor` shapes apply on every layer too.

**Flicker is a pure function of a light's `id` and the time**, so it has no state, needs no random stream and repeats exactly.

**At most 32 lights per map** (`MAX_LIGHTS`), which is what the budget is sized for.

**Torch sprites slot in later without a format change.** A light's `position` is the anchor a sprite stands on, and its `id` is the key for per-object art lookup.

## Considered

- **Phaser's built-in light pipeline.** Per-pixel normal-map lighting with a fixed light count per object, and no shadows or per-layer separation. It would have to be fought for every layer, and sprites do not exist to light yet.
- **Per-vertex tint on the map's graphics.** Cheap, but it needs fine tessellation for round light pools and cannot show a hard shadow edge.
- **Full-resolution light maps.** A soft falloff gains nothing from them, and they cost four times the fill.
- **Lighting in `game-core`.** It would let gameplay read light by accident. Light has no gameplay effect, so the renderer owns it.

## Consequences

Later cards draw the light map (#2987, #2988) and author lights on maps (#2989) against this model. A gameplay use of light, such as stealth, would need a new ADR and a deterministic copy of the maths in the simulation.
