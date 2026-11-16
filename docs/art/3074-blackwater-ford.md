# Blackwater Ford study (#3426, part of #3074)

Study: `3074-blackwater-ford-plan.png` (outline, layers, routes, shrines, world elements, 5200×2800),
`-layer-0/1/2.png` (one layer's footprints each), `-spawn-team1.png` / `-spawn-team2.png`
(the default camera, 1100 tall, 16:9, with the team of eight). Regenerate with
`node scripts/assets/3074-blackwater-ford-study.mjs docs/art` (needs inkscape; the SVGs are not
committed; the drawing is shared in `scripts/assets/3074-study-lib.mjs`). The PNGs are a guide, not
coordinates. The layout is new: today's map (1600×1000) is thrown away, the place (a dark river ford:
shallow crossings, a broken stone bridge, mire banks, reeds, a mill on piers) is kept.

## Rules the study holds

- **Bounds** 5200×2800 = 14.56 M u² (2.9× Canyon, 8v8, long side 5200 > 4800, short side 2800 ≥ 1800).
  The ground outline fills 73 % of it, with `rock` (`OUTSIDE_KINDS`) outside. The river runs north to
  south down the middle (x 2300..2900); the teams hold the west and east banks, T1 south-west, T2
  north-east. The walk from a spawn to the centre is 12 s, under the 25 s cap.
- **Biome: propose `marsh`** (shared with Brazen Causeway), one new row, added by this map's first
  build PR (#3172 rules). Ground `#2a3430` (the wilds' ground with a breath of teal), rock `#54594f`,
  plant / earth reed `#5c5a3a` and silt `#4a4034`. Visual-style §1 line: "the marsh keeps the wilds'
  dark ground a little cooler, with dry olive reed and silt; its tones are all low chroma and well
  away from the friend blue, the foe red and the nature green; open water is the shared look". Why
  not `wilds`: the reed and silt tones differ, and Brazen Causeway wants the same.
- **Layers (3):** L0 banks, the two fords and the two culverts; L1 the west and east bridge
  approaches, the mill deck, a quay on the north-west bank and a wharf on the south-east bank
  (70 up); L2 the mill loft (140 up). Seven stairs.
- **Structures (6 + 2 tunnels):** west approach, east approach, mill deck, north-west quay,
  south-east wharf, mill loft. 3 layers, 6 structures, near Moss Vale's budget for 16 bodies.
  The bridge is **broken in the middle**: its two approaches are joined by the mill, built on the
  pier where the span fell.
- **Tunnels:** two **culverts** on L0, 110 wide, running north to south straight under each approach:
  west (1750,1160) to (1750,1650), east (3450,1110) to (3450,1700). Cover shows the seam and grating
  slots (#3236), as wide as the walkable floor (#3179).
- **Drop-offs (4):** the west approach's north edge, the east approach's south edge, the quay's north
  edge and the wharf's south edge. The mill deck has no drop: below it is deep water.
- **Priest objectives, per team.** Shrine 1 (800,1000) with ghost-spawn (600,800) for team 1,
  shrine 2 (4424,1784) with ghost-spawn (4624,1984) for team 2; spawn blocks T1 (440..560,
  1620..1950) and T2 (4664..4784, 834..1164), eight seats a side. Each shrine stands on open bank
  inside its own lit ring (radius 220), outside any tunnel, zone, water or deck. Other objectives,
  placed anew: the **storm-beacon** on the mill deck at the centre (2600,1400), a **flag-spawn** near
  each team, (1100,2000) and (4124,784).
- **Elements:** two brass **levers** on the mill deck work the **gates** in the culverts: the one at
  (2780,1300) opens the west gate (1750,1620), the one at (2420,1500) the east gate (3450,1150). Gates
  start shut. No lift is used (bots read a lever lift as closed). A **breakable silted weir**
  (x 2050, y 2000..2200) closes a lane on the south-west bank. Zones: `mire` on the reed banks (1500,2250),
  (3800,560) and on the north ford's west approach (2000,940); each off the spawn blocks by ≥ 200 u.
  Water: **deep** black water north and south, the mill race in the middle, and two **shallow**
  fords (y 730..960 and 1860..2110), walkable scenery with no zone. Atmosphere (existing, #3032): three
  mist banks, over two reed banks and the race, under bodies, never over a shrine, a stair or a lever.
- **Light:** the **Day** row (visual-style §2), sun from the NW, 50°, `#fff1d6` 0.55, under a grey
  sky: the dark water is the dark thing, the banks stay lit. Torches `#ffb060`, radius 150, at each
  culvert mouth, stair and lever; rings (220) at each shrine and at the mill. 14 lights, under 16.
  The culverts carry their mouth torches, nothing else is dim.
- **Reduced motion:** torch flicker steady, mist holds still, ripples stop; the gates move once on a
  lever.

## Routes and balance (base speed 180 u/s)

T1 centred (500,1785) in the south-west, T2 (4724,999) in the north-east. Centre: the mill, (2600,1400).

| Route to the centre (T1 / T2)                | Length        | Walk          |
| -------------------------------------------- | ------------- | ------------- |
| bridge road (south stair, over the approach) | 2192 / 2217 u | 12.2 / 12.3 s |
| culvert (tunnel, gate open, north stair)     | 2684 / 2709 u | 14.9 / 15.0 s |
| south ford (shallow, then the far approach)  | 3357 / 3336 u | 18.7 / 18.5 s |

**Shrines.** A foe reaches a shrine three ways, equal on both sides (a foe's walk, from spawn centre):

| Route to shrine 1 (T2) / shrine 2 (T1) | Length        | Walk          |
| -------------------------------------- | ------------- | ------------- |
| north ford                             | 3942 / 3942 u | 21.9 / 21.9 s |
| bridge (across the mill)               | 4299 / 4300 u | 23.9 / 23.9 s |
| south ford                             | 4686 / 4686 u | 26.0 / 26.0 s |

The shrine to the centre is 1913 / 1937 u, 10.6 / 10.8 s, within 2 %. All walks are within 2 % T1 / T2.
**Worst case:** both gates shut leave each shrine its three routes (the culverts are not on them),
and every spawn two to the centre (bridge road, south ford). A lever lift is not used anywhere.

The sides differ on purpose: the east approach is 8 % bigger (226 k u² against 210 k), the culvert
mouths are not level (west 1750, east 3450, east longer), the quay (162 k u²) is north-west and
the wharf (137 k u²) south-east, and the mire and reeds are scattered unevenly. High ground within
half the map of either spawn is one L1 quay or wharf, or the approach, open from both stairs; the
only L2 is the mill loft, at the centre, reached by its one stair, contested not owned.

## Canyon lessons, on the plan

- Every deck is reachable up and down by click-to-move (#3177): each approach has a stair at both
  edges and a drop; the loft has its stair.
- No body is hidden without an outline (#3178/#3251): stairs are open steps, nothing stands north
  or south of one; the lean-to is thin.
- The culvert cover is the walkable floor and nothing wider (#3179); the approach over it fades with
  the cutaway (#3272).

## New art needed

The `marsh` biome row (above), added by the first build PR. The mill is `decks` and `wood`-look
props, the gates the existing gate look, the fords and race the existing deep and shallow water.
Mechanics are not designed here.
