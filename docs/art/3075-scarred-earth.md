# Scarred Earth study (#3430, part of #3075)

Study: `3075-scarred-earth-plan.png` (outline, layers, routes, capture points, shrines, world
elements, 5400×2800), `-layer-0/1/2.png` (one layer's footprints each), `-spawn-team1.png` /
`-spawn-team2.png` (the default camera, 1100 tall, 16:9, with the team of eight). Regenerate with
`node scripts/assets/3075-scarred-earth-study.mjs docs/art` (needs inkscape; the SVGs are not
committed; the drawing is shared in `scripts/assets/3075-study-lib.mjs`). The PNGs are a guide, not
coordinates. The layout is new: today's map (3200×2000, flat) is thrown away, the place (a cratered
battlefield: craters as pits, trenches as tunnels, wrecked siege towers as towers) is kept.

## Rules the study holds

- **Bounds** 5400×2800 = 15.12 M u² (3.0× Canyon, long side 5400 > 4800, short side 2800 ≥ 1800,
  above the 12.6 M u² 8v8 bound). The ground outline fills 73 % of it (≥ 60 %), with `rock`
  (`OUTSIDE_KINDS`) outside.
- **Biome: `volcanic`** (visual-style §1: ground `#2b2421`, rock `#4a4340`, earth `#4a3426`, ash
  scrub `#5a5444`). No new row: the scorched field is the volcanic earth and ash, the craters are
  dark pits with a pale rim. `ash` is not proposed.
- **Layers (3):** L0 the field, ten craters and two trenches; L1 the three tower hulks and two spoil
  banks (70 up); L2 the three hulk decks (140). 20 stairs.
- **Structures (8 + 2 tunnels):** three siege-tower hulks (base and deck each) and two spoil banks.
  Below Moss Vale's count.
- **Capture points (5, as today, placed anew):** all on the centre line x = 2700, so every point is
  the same walk from both spawns: P1 (2700,420) and P5 (2700,2380) on open ground between craters in
  a lit ring; P2 (2700,910) and P4 (2700,1890) on the hulks' bases (L1); P3 (2700,1400) on the great
  siege tower's deck (L2). Each hulk has stairs on all four faces, so ≥ 2 routes reach it for either
  team, none through the other's spawn. No point is in a trench, zone or crater, and none on a deck
  one stair reaches. Resurrection shrines 1 (700,1000) and 2 (4700,1000).
- **Craters (pits, 10):** five a side, 300..400 wide, off every route and ≥ 200 u from a spawn,
  placed between the points and the bases.
- **Tunnels:** the two **trenches** on L0, 110 wide, west to east at y 665 (north) and y 2135 (south),
  x 1400..4000, each with a gate at both mouths. Lever-driven (below). Cover shows the seam and
  grating slots (#3236), as wide as the walkable floor (#3179).
- **Drop-offs (4):** the great hulk's north and south edges, the north hulk's west edge and the
  south hulk's east edge.
- **Elements:** four **trench gates** start shut. Two brass **levers** on the hulk bases, (2500,910)
  **opens both north gates** and (2900,1890) **both south gates**: either team can open a trench, and
  a pulled lever opens it for both. No lift is used. A **breakable wrecked palisade** (x 1700, y
  1660..1830) closes a short-cut from the spawns to the south lane. Zones: `mire` and `spring`, one
  each side, off every route and ≥ 200 u from a spawn. Atmosphere (existing, #3032): three smoke
  banks, under bodies, never over a point, a stair or a lever. One `canopy` overhang (a toppled
  beam) off every route.
- **Light:** the **Dusk** row (visual-style §2), sun from the NW, 25°, `#ffb87a` 0.5. A ring (220) at
  each point, torches `#ffb060` (150) at the four trench mouths, rings at the shrines and levers.
  13 lights, under 16. Nothing is dim except the trenches, which have their mouth torches.
- **Reduced motion:** torch flicker steady, smoke holds still, spring drift stops; the gates move
  once on a lever.
- **8v8 tick budget:** 3 layers, 8 structures.

## Routes and balance (base speed 180 u/s)

T1 centred (540,1405), T2 (4860,1405). The map is mirrored in x (the two halves); north and south
differ (craters, hulk sizes, the north hulk and south hulk, the great hulk widest). A mirror makes
the walk gap 0 %: the gap the structure gives, not a promise about the final art.

| Spawn to the great siege tower (T1 / T2) | Walk          |
| ---------------------------------------- | ------------- |
| west approach (up the hulk)              | 12.0 / 12.0 s |
| south lane                               | 13.5 / 13.5 s |
| north lane                               | 13.6 / 13.6 s |

**8v8, per capture point** (T1 = T2, gap 0 %; the middle point is 0 % from equidistant):

| Point           | west approach | lane approach |
| --------------- | ------------- | ------------- |
| 1 (open, north) | 14.4 s        | 14.8 s        |
| 2 (north hulk)  | 13.0 s        | 14.8 s        |
| 3 (great hulk)  | 12.0 s        | 13.5 s        |
| 4 (south hulk)  | 12.6 s        | 14.7 s        |
| 5 (open, south) | 13.9 s        | 14.7 s        |

**4v4 uses the middle band**, not the whole map: a 4v4 match spawns at forward camps (1240,1400) and
(4160,1400), so the fight is x 1200..4200 and the rear is not used. Camp to point, T1 = T2:

| Point | west approach | lane approach |
| ----- | ------------- | ------------- |
| 1     | 10.5 s        | 12.4 s        |
| 2     | 9.1 s         | 12.4 s        |
| 3     | 8.1 s         | 10.0 s        |
| 4     | 8.7 s         | 12.4 s        |
| 5     | 10.1 s        | 12.4 s        |

Whether a map can have a second set of spawn blocks is a build question for #3440. Spawn to fight
stays under 15 s (< 25 s) in both sizes.

**High ground:** each hulk's deck (L2) overlooks its point and the lanes beside it; the two spoil banks
(1500..2050 / 3350..3900, y 1000..1280) overlook the north lane from each team's side. Both teams
reach each in the same time (the layout is mirrored).
**Worst case:** the trenches shut change no point's routes (the trench is a bypass); an unbroken
palisade leaves the west approach and the north lane to every point.

## Canyon lessons, on the plan

- Every deck is reachable up and down by click-to-move (#3177): every hulk has a stair on each face
  and each deck two.
- No body is hidden without an outline (#3178/#3251): stairs are open steps, nothing stands north
  or south of one; the beam is thin and fades.
- The trench cover is the walkable floor and nothing wider (#3179); the hulks over it fade with the
  cutaway (#3272).

## New art needed / not built

Nothing new: the hulks are stacked `decks` in the volcanic stone with a mound top, the craters the
existing pits, the gates the existing gate look. Mechanics are not designed here.

## Questions

- Today's points sit west and east of centre (two nearer each base). The card asks for every point
  within 10 % between teams, so all five are on the centre line. If home points are wanted, say so.
- 4v4 as forward camps needs a second spawn set in the map JSON. The alternative is the whole map
  with 8v8's camps, where a 4v4 fight is about 14 s from each spawn.
