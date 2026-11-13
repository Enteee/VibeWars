# Tutorial canyon study (#3237, part of #3187)

Study: `3187-tutorial-canyon-plan.png` (the whole map) and one frame per station site,
`3187-canyon-<n>-<slug>.png` (n = 4…14), each the size of the default camera
(1100 units tall, 16:9 = 1956×1100) with the pair in it, bodies as `render/body-painter.ts`
draws them (self: blue with pale rim; tutor: blue) and the goal mark (#3221) where the
station puts one. Regenerate with `node scripts/assets/tutorial-canyon-study.mjs docs/art`
(needs inkscape and magick; the SVGs are not committed). The PNGs are a guide, not coordinates.

## Rules the study holds

- **One biome, a new row.** Ember Pits (#3225) has not merged, so this proposes the
  `visual-style.md` §1 row **Volcanic**: ground `#74655a`, rock `#2a2220`, lip `#85766b`,
  cliff face `#2f2623`, ash `#6d6058`, crust `#2a2220`, mire `#3f4a33`. All desaturated warm
  grey-brown. Orange (`#ff8a3d`, `#ffd23d`) appears only in lava, which is scenery and danger.
  If #3225 lands first, take its row and re-check the tones.
- **Lava is never a pit.** Four streams run through the rock between the trail's rows (scenery,
  warm glow, radius ≈ 420, flicker 0.35, still under reduced motion). Station 7's strip is a
  `molten` zone that hurts, the way round is visible beside it.
- **Mist** is low, pale, soft ellipses (`#cfc6c0`, ≤ 0.30) drawn under bodies, rings and bars,
  so it never hides one (§signals). Mist drifts at 0.14 at most.
- **Light:** the dusk row (`#7f86a8` ambient 0.35, sun 25° `#ffb87a` 0.5) from the north-west,
  so shadows fall south-east (blocks, wall, boulders); lava is the warm light.
  A faint dusk vignette closes the frame edge.
- **Signals stay for the fight:** blue and red appear only on bodies; the gold mark is the
  `altar` gold, not the target-ring yellow.
- **Original look, no GW1 names;** the canyon has no player-facing name here.

## The plan

One trail, four legs: west to east (arrival pad → 4 → 5 → 6), north (7), east to west
(8 → 9 → 10), north, then west to east (11 → 12 → 13 → 14). Corridor 600 wide, rock between
the rows at least 800 thick (impassable, dark top, so a camera never sees the next row).
Site coordinates below are trail coordinates; add 500 for map x (500 of rock on each side, so the
unclamped camera, half a view 978×550, never sees past the map edge).
**Map 8400×4100 units.** Sites are 1400–1600 apart along a row and ≥ 1200 vertically at the
turns, so standing at a site the next is out of the default view (half 978 × 550) and never
glimpsed. The only way on is the trail; station 5's wall shuts the full width until it falls.

| #   | Site (centre)                                                                  | Reuses                          | New art needed                               |
| --- | ------------------------------------------------------------------------------ | ------------------------------- | -------------------------------------------- |
| 4   | boulder run (1700, 3500): three landings, 340 apart                            | `rockfall` zone and look        | boulders resting at the north rim (props)    |
| 5   | cracked wall (3100, 3500), full width, 160 frame                               | breakable wall (#3031)          | the cracked wall skin                        |
| 6   | clearing (4700, 3500): 1120×660 bay                                            | open ground, one `rockfall`     | none                                         |
| 7   | bad ground (6300, 2800): mire centre, molten strip west, clear way east        | `mire`, `molten`                | none                                         |
| 8   | rat pocket (4700, 2100): bay for 3 rats                                        | open ground                     | none                                         |
| 9   | ledge L1 (3100, 2100): 620×180 on the north wall                               | static height structure (#3067) | none                                         |
| 10  | ramp to deck L2 (1500, 2100): five treads, deck in the north wall              | ramp / terrace                  | none                                         |
| 11  | tunnel (1900, 700): 720 long, mouths at 1580 and 2300, guard on top            | tunnel layer (#3070 cave)       | **sleeping guard prop** (grey body, "zz")    |
| 12  | open patch (3700, 700): two rats                                               | open ground                     | none                                         |
| 13  | Y-junction (5300, 700): trail on east, dead-end arm south-east to (5900, 1400) | map data                        | **parasol and deck chair** prop for the joke |
| 14  | canyon mouth (6800, 700), exit at x = 7100                                     | edge / exit                     | mist gate (below)                            |

**Render budget.** 8400×4100 is about seven times Ember Pits. If `render bench` refuses, cut
between 7 and 8 (the east turn): map one is stations 4–7, map two stations 8–14, crossed by
the same mist gate as station 14.

## Station 14's exit

A **mist gate**: the walls part, the trail runs into a tall, bright, soft column of mist
(two blurs, `#e9e2dc` then `#fff`), and through it a dark rank of foe silhouettes (the
background fight, desaturated). The pair walks in and the screen fades; the build card
decides whether that is a teleporter or a map swap.

## Edge cases the plan shows

- **Walking back west:** the trail behind is open ground, nothing re-arms; the wall stays down.
- **The tutor** walks the same trail: every site is at least a body wide at the pinch (wall:
  600, dead end: 340, tunnel: 500 inside the mouths).
- **Station 9:** the ground under the ledge is the floor of the trail, reachable by Alt+click
  from the ledge (dashed ring under the solid ring, ADR-0051 bands).

## Reduced motion

Stops: lava shimmer, mist drift, the gate's swirl, the goal mark's pulse (steady at its
middle). Stays: all shapes, rings, bars, glow and shadows.
