# Tutorial canyon study (#3237, part of #3187; one map and a two-arm junction, #3792)

Study: `3187-tutorial-canyon-plan.png` (the whole map) and one frame per station site,
`3187-canyon-<n>-<slug>.png` (n = 4…9 and 11…14, no 10; the parasol bay is `13b`), each the size of the default camera
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
  warm glow, radius ≈ 420, still under reduced motion). Only every third glow flickers (0.35): a
  flickering light is redrawn as it flickers, and all of them put the map over the render bench's
  cap. Station 7's strip is a `molten` zone that hurts, the way round is visible beside it.
- **Mist** is low, pale, soft flat ellipses in the plain fog grey (`FOG_COLOUR`, ≤ 0.30), a few
  wide puffs scaled to the bank (#3885), drawn under bodies, rings and bars,
  so it never hides one (§signals). Mist drifts at 0.14 at most.
- **Light:** the dusk row (`#7f86a8` ambient 0.5, sun 25° `#ffb87a` 0.5) from the north-west,
  so shadows fall south-east (blocks, wall, boulders); lava is the warm light.
  A faint dusk vignette closes the frame edge.
- **Signals stay for the fight:** blue and red appear only on bodies; the gold mark is the
  `altar` gold, not the target-ring yellow.
- **Original look, no GW1 names;** the canyon has no player-facing name here.

## The plan

**One map, `tutorial-canyon`:** the pair enters once (the teleporter after station 3) and leaves once
(the mist gate). One trail, four legs: west to east (arrival pad → 4 → 5 → 6), north (7), east to
west (8 → 9), north, then west to east (11 → 12 → 13 → 14). There is no station 10 and no high
ground: the second row ends in the turn north at x = 1000 (trail coordinates). Corridor 600 wide, rock between
the rows 800 thick (impassable, dark top; the station 13 arm digs 300 into the band and a camera there still sees no other row).
Site coordinates below are trail coordinates; add 500 for map x (500 of rock on each side, so the
unclamped camera, half a view 978×550, never sees past the map edge).
**Map 8400×4100 units** (the same rectangle as the two-map plan: the rows are set by the stations that remain, so the saving is the ramp, treads and deck and the second map's load, not area). Sites are 1400–1600 apart along a row and ≥ 1200 vertically at the
turns, so standing at a site the next is out of the default view (half 978 × 550) and never
glimpsed. The only way on is the trail; station 5's wall shuts the full width until it falls.

| #   | Site (centre)                                                                                       | Reuses                          | New art needed                               |
| --- | --------------------------------------------------------------------------------------------------- | ------------------------------- | -------------------------------------------- |
| 4   | boulder run (1700, 3500): three landings, 340 apart                                                 | `rockfall` zone and look        | boulders resting at the north rim (props)    |
| 5   | cracked wall (3100, 3500), full width, 160 frame                                                    | breakable wall (#3031)          | the cracked wall skin                        |
| 6   | clearing (4700, 3500): 1120×660 bay                                                                 | open ground, one `rockfall`     | none                                         |
| 7   | bad ground (6300, 2800): mire centre, molten strip west, clear way east                             | `mire`, `molten`                | none                                         |
| 8   | rat pocket (4700, 2100): bay for 3 rats                                                             | open ground                     | none                                         |
| 9   | ledge L1 (3100, 2100): 620×180 on the north wall                                                    | static height structure (#3067) | none                                         |
| 11  | tunnel (1900, 700): 720 long, mouths at 1580 and 2300, guard on top                                 | tunnel layer (#3070 cave)       | **sleeping guard prop** (foe disc, "zz")     |
| 12  | open patch (3300, 700): two rats                                                                    | open ground                     | none                                         |
| 13  | two-arm junction (4400, 700): a rock island splits the trail, arms rejoin at `site-13r` (5650, 700) | map data                        | **parasol and deck chair** prop for the joke |
| 14  | canyon mouth (6800, 700), exit at x = 7100                                                          | edge / exit                     | mist gate (below)                            |

**Render budget.** The canyon was split in two once for fear of the render bench. With station 10
gone it is one map. The developer benches `tutorial-canyon` (`pnpm bench:render`); if it misses
what the other maps meet, report the numbers on the card, do not split it again.

## Station 13: the junction

At 13 (4400, 700) the corridor opens into **two arms round a rock island** (4600…5300 wide, 240
thick at y = 580…820). Both are carved like the rest of the canyon (lip, face, floor), each a short
detour into the rock band, and they rejoin before the island's east end.

| Arm   | Centre line (trail coordinates)                        | Width at the pinch | Outer wall |
| ----- | ------------------------------------------------------ | ------------------ | ---------- |
| north | (4450,700) (4700,420) (4950,405) (5200,420) (5450,700) | 350                | y = 230    |
| south | (4450,700) (4700,980) (4950,995) (5200,980) (5450,700) | 350                | y = 1170   |

- **Nothing is a dead end.** The tutor (a body about 100 wide) fits through each, over the 340 the
  study asks for. Marks: `site-13n` at (4950, 405) and `site-13s` at (4950, 995) on the arms,
  `site-13r` at (5650, 700) the rejoin. 13 is done on reaching `site-13r`, by either arm.
- **Rock between rows.** The arms dig into the band: north 170 into the 400 above row 1 (the map
  edge is still 230 away), south to 1170, leaving 630 above row 2 (1800). The ≥ 800 rule is
  waived for the arms, as the old arm was, because standing in either the camera (half 550) sees
  no other row: from y = 1170 it sees to 1720.
- **The parasol bay** (`13b`): an ellipse off the south arm, centre (5050, 1170), 460×200, floor to
  y = 1270 (the camera there sees to 1820: the rim of row 2's rock only). Parasol (5080, 1140) and
  deck chair (5130, 1170) are scenery, and the tutor's line on passing is "Nice view."
- **Sight.** Standing at 12 (3300, 700) 13 is 1100 away (out of the 978 half view); standing at
  `site-13r` 14 is 1150 away. 12 moved west (was 3700) for this.

## Station 14's exit

A **mist gate**: the walls flare open and the trail runs into a tall, bright, soft column of mist
(two blurs, `#e9e2dc` then `#fff`), and through it staggered, body-sized, desaturated foe silhouettes (the
background fight, desaturated). The pair walks in and the screen fades; the build card
decides whether that is a teleporter or a map swap.

## Edge cases the plan shows

- **Walking back west:** the trail behind is open ground, nothing re-arms; the wall stays down.
- **The tutor takes the pinged arm** and no other; it never cuts through the island.
- **The tutor** walks the same trail: every site is at least a body wide at the pinch (wall:
  600, each arm: 350, tunnel: 500 inside the mouths).
- **Station 9:** the ground under the ledge is the floor of the trail, reachable by Alt+click
  from the ledge (dashed ring under the solid ring, ADR-0051 bands).

## Reduced motion

Stops: lava shimmer, mist drift, the gate's swirl, the goal mark's pulse (steady at its
middle). Stays: all shapes, rings, bars, glow and shadows.
