# Organic edges study (#4251)

Design only. `scripts/assets/organic-edges-study.mjs` reads the real maps (`blackwater-ford`, `ember-pits`, `moss-vale`) and draws `organic-edges-study.png`; this page is written by the same run. Gameplay shapes follow the organic outline (operator Q212): collision, slowdown, zone damage and bot navigation use the polygon the renderer draws. Point-symmetric maps are **not** mirrored: each element has its own seed.

## The roughening (one algorithm for the sim and the renderer)

Input: a closed polygon (a rect is its four corners), the map id, the element id and its kind. Output: a closed polygon. Deterministic, integer coordinates, no `Math.random`.

1. **Subdivide.** Cut every edge into `ceil(length / L)` equal segments. Original corners stay as points.
2. **Displace.** Move every point along its normal (the perpendicular of its two neighbours' chord) by `A * field(x, y)`, with `field` in [-1, 1]: 2D value noise, three octaves, weights 0.57 / 0.29 / 0.14 (§4), wavelengths `F`, `F/2`, `F/4`. A lattice value is the FNV-1a hash of the seed and the cell. The first octave is seeded by `mapId:kind`, so a shallow inside its deep water drifts with it; the two finer ones by `mapId:elementId`.
3. **Keep out.** The displacement is multiplied by `clamp((d - 60) / 60, 0, 1)`, `d` the distance to the nearest spawn or objective: nothing moves within 60 units, full strength by 120.
4. **Pin and validate.** A point on another element's authored edge (a waterfall's foot on its pool) does not move. The result must be a simple polygon, must cross no other element of the same kind and layer that the authored shape did not cross, and a shallow that lay inside a deep water stays inside its roughened outline. If not, halve `A` and retry, up to three times; then the element stays as authored (reported below).

| Element       | L (u) | A (u) | F (u) | Notes                                                         |
| ------------- | ----- | ----- | ----- | ------------------------------------------------------------- |
| Deep water    | 36    | 56    | 190   | coves and points                                              |
| Shallow water | 36    | 56    | 190   | shares the deep water's coarse octave and must stay inside it |
| Zone          | 40    | 24    | 200   | hard edge follows the shape                                   |
| Map edge      | 30    | 40    | 260   | rim chunks are render-only, not shapes                        |
| Paving        | 20    | 9     | 100   | stones over the ragged edge are render-only                   |

Render-only parts (rim chunks, paving stones, the feather) are drawn from the same seed and never move a hit shape.

## Point budget

Points per map, authored → organic (all elements of the kind):

| Map             | Water    | Harmful zones | All zones | Map edge | Paving     | Largest water body |
| --------------- | -------- | ------------- | --------- | -------- | ---------- | ------------------ |
| blackwater-ford | 32 → 327 | 0 → 0         | 36 → 76   | 20 → 428 | 24 → 414   | 95                 |
| ember-pits      | 0 → 0    | 60 → 266      | 60 → 266  | 21 → 309 | 13 → 114   | 0                  |
| moss-vale       | 48 → 400 | 0 → 0         | 40 → 96   | 22 → 435 | 130 → 2281 | 66                 |

- **Water.** The schema allows 64 points a body. At these settings the largest body needs 95, so the cap goes to **144** (50 % headroom for longer shores).
- **Harmful zones.** `MAX_HARMFUL_ZONE_POINTS` is 64 in total because their corners feed the bots' visibility graph (`pathing.ts:484`). Ember Pits' harmful zones go 60 → 266. A total cap of **416** covers it. A visibility graph built on every roughened corner grows quadratically: the architect should decide between raising the cap as is and building the graph from a simplified copy of the polygon (Douglas-Peucker, 12 u tolerance) while collision and damage use the full one. The study shows the full shape only.
- **Map edge and paving.** Not capped by the schema today; the outline goes to the point counts above.

### What the algorithm could not do

- blackwater-ford: every element roughened.
- ember-pits: every element roughened.
- moss-vale: stayed authored: race-north; amplitude halved or more: race-under-mill, pool-current, race-current-north, race-current-south, rill-east.

## Edge treatments

Every treatment keeps §4: the 2 px edge is hard and never softer than its fill.

- **A, hard edge only.** The honest shape, nothing else. Harsh next to the floor: the whole zone reads as a cut-out.
- **B, hard edge plus a feather outside.** A blurred ring of the zone's own fill, outside the edge: 9 u at 40 % for harmful zones, 22 u at 30 % for mire and springs. The floor appears to take the colour; the edge itself stays crisp. **Proposed.**
- **C, hard edge plus an inner crust.** A ragged dashed line 4 to 10 u inside the edge. Reads as cracked ground. Busy at zoom 1; fine for scorched ground, noisy on liquids.

Readability (§6): a harmful zone's feather is warm like the zone and thin, so a player still judges where it hurts by the hard edge. The feather is drawn under bodies and projectiles, as the fill is. In the grey pass the edge and the fill still part from the floor.

## What changes where

- **Water.** `water-shape.ts` `waterShapeOf`: the outline is the roughened polygon (the map data carries it; see the follow-up). The deep water's lip and the shallow's shore line follow it.
- **Zones.** `zone-painter.ts` `drawnOutline` draws the polygon as given; the feather is one extra blurred stroke under it.
- **Map edge.** `outside-land.ts` `paintOutsideEdge`: replace the offset bands with the crevice line, the broken rim and tumbled chunks, seeded from the map id.
- **Paving.** `paving-painter.ts`: the same, a bed on the ragged polygon and stones over its edge.

## Cost

Roughening runs once at map load (a few thousand noise samples: well under a millisecond). Drawing is polygon fills, as today, with up to 4 times the points; the rim chunks are static. They are baked with the outside's sprite (a map's outside already costs a sprite, `outside-land.ts`), so the frame cost is unchanged. The feather is one blurred stroke per zone, baked in the zone's own texture.
