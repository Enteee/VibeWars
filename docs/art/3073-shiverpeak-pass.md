# Shiverpeak Pass study (#3392, part of #3073)

Study: `3073-shiverpeak-pass-plan.png` (outline, layers, routes, world elements, 3400×2300),
`-layer-0/1/2.png` (one layer's footprints each), `-spawn-team1.png` / `-spawn-team2.png`
(the default camera, 1100 tall, 16:9, with the team of four). Regenerate with
`node scripts/assets/3073-shiverpeak-pass-study.mjs docs/art` (needs inkscape; the SVGs are not
committed). The PNGs are a guide, not coordinates. The layout is new: today's map is thrown away,
the place (a snowy mountain pass: cliff ledges, a rope bridge over a chasm, a cave through a ridge,
drop-offs, wind and snow) is kept.

## Rules the study holds

- **Bounds** 3400×2300 = 7.82 M u² (1.55× Canyon, 4v4, above the 1.5× minimum of ~7.6 M). The ground
  outline fills 63 % of it, ragged, with `rock` (`OUTSIDE_KINDS`) outside: dark boulders and
  scree, drawn in the plan and both spawn frames.
- **Biome `snow`** (#3286, visual-style §1): ground `#7d8a8e`, rock `#4d4a4a`, slush `#6a6a58`, decks `#9ea4ab`
  (peak ledges `#b4b9be`). No new row. Decks stay mid-grey, so the friend blue keeps its contrast. Blue and red
  appear only on bodies and team marks.
- **Layers (3):** L0 the pass floor, the chasm and the cave; L1 a cliff ledge on each side of the chasm
  (a `deck`, 70 up) and the rope bridge between them; L2 a peak ledge above each cliff ledge (`decks`, 140 up).
- **Structures (≥ 4):** two L1 cliff ledges; four `transitions` (a stair up to each ledge, one up to
  each peak); two L2 peak ledges; the rope bridge; one cliff overhang over the south lane.
- **Tunnel:** the **cave** through the ridge under the chasm, 110 wide, mouths at (1150,1330) and
  (2250,1330), one on each side's floor. Cover shows the seam and grating slots (#3236), shaded
  exactly as wide as the walkable floor (#3179).
- **Drop-offs (4):** both cliff ledges' south edges to the floor, and both peak ledges down to their cliff
  ledge. The **chasm** itself is a drop too: the unwalkable band, drawn as a dark void
  with a lit lip, open at its south end (y 1250..1560).
- **Elements:** two brass **levers**, one on each cliff ledge ((1380,860) and (2080,840)), work the
  **rope bridge** (L1 height, 420 long, 80 wide). The bridge is lever-driven, so when it is down there
  is still the **cave** (8.2 / 8.3 s) and the **south pass** round the chasm's end (11.0 / 10.9 s): nobody
  is cut off, the same rule as Moss Vale's drawbridge. A **breakable ice wall** stands across the
  south pass at x 1688, y 1700..1920, shutting the straight walk until it is broken. Zones: `mire`
  (a deep drift, west, (900,1680)) and `rockfall` (loose scree, east, (2560,1720)), both south of the
  routes, ≥ 200 u from a spawn. Atmosphere (existing, #3032): low wind drifts and snow. If the wind is meant to
  push or slow, that is a mechanic: not designed here.
- **Light:** the **Day** row (visual-style §2): sun from the NW, 50°, `#fff1d6` 0.55, ambient
  `#b0bcd4` 0.45; snow bounces the light. Torches `#ffb060`, radius 140–200: at both cave mouths,
  both ledge stairs, both peak stairs, both levers, and a larger brazier ring at each spawn. Nothing is dim but the cave, and it
  carries its mouth torches.
- **Reduced motion:** torch flicker steady, wind drift and snow stop; the bridge moves once on a lever.

## Routes and balance (base speed 180 u/s)

Four seats a side, T1 centred (550,1325) in the west mouth, T2 (2865,1375) in the east. The centre is the
chasm's middle landing, (1700,1000). Walk from spawn to the centre is 7.5 s by the bridge, well under any cap.

| Route (T1 / T2)                                      | Length        | Walk          |
| ---------------------------------------------------- | ------------- | ------------- |
| rope bridge (stair, up the ledge, across the bridge) | 1353 / 1377 u | 7.5 / 7.7 s   |
| cave (mouth, under the chasm, up to the landing)     | 1480 / 1497 u | 8.2 / 8.3 s   |
| south pass (round the chasm's southern end)          | 1986 / 1967 u | 11.0 / 10.9 s |

The walks are within 2 % T1 / T2. The sides differ on purpose: the west peak is smaller (111 k u²)
than the east (132 k u², 16 % larger, so within 25 %), the ledges' outlines differ, the overhang sits
on the west lane only, the east holds the rockfall and the west the mire. High ground within half
the map of either spawn is one L2 peak, reached only by its own side's two stairs; the bridge joins
the ledges, so the north is contested, not owned. The 4v4 tick budget stays small: 3 layers, 4 transitions
and 2 ledges.

## Canyon lessons, on the plan

- Every deck is reachable up and down by click-to-move (#3177): each stair has a walk-down, each peak
  has both a stair and a drop.
- No body is hidden without an outline (#3178/#3251): the stairs are open steps, nothing stands south
  of one; the overhang is thin; the chasm is open, with no wall in front of the lip.
- The cave cover is the walkable floor and nothing wider (#3179); paving over it fades with the
  cutaway (#3272).

## New art needed

Nothing beyond the schema's elements: the overhang uses the existing recipe
(`3066-3067-outside-structures.md`), the bridge uses the existing bridge look with rope rails drawn
as thin lines, the ice wall uses the breakable-wall look in snow tones. The chasm is the existing
drop-off look. Wind and snow are the atmosphere that exists. Mechanics are not designed here.
