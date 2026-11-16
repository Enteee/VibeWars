# Barrow Field study (#3426, part of #3074)

Study: `3074-barrow-field-plan.png` (outline, layers, routes, shrines, world elements, 5400×2600),
`-layer-0/1/2.png` (one layer's footprints each), `-spawn-team1.png` / `-spawn-team2.png`
(the default camera, 1100 tall, 16:9, with the team of eight). Regenerate with
`node scripts/assets/3074-barrow-field-study.mjs docs/art` (needs inkscape; the SVGs are not
committed; the drawing is shared in `scripts/assets/3074-study-lib.mjs`). The PNGs are a guide, not
coordinates. The layout is new: today's map (2400×1600) is thrown away, the place (burial mounds on
a moor: barrows with tunnels inside, standing stones, fog in the hollows) is kept.

## Rules the study holds

- **Bounds** 5400×2600 = 14.04 M u² (2.8× Canyon, 8v8, long side 5400 > 4800, short side 2600 ≥ 1800).
  The ground outline fills 67 % of it, ragged, with `rock` (`OUTSIDE_KINDS`) outside: boulders, drawn
  right round the outline. The walk from a spawn to the centre is 12 s, under the 25 s cap.
- **Biome:** `wilds`, no new row. The moor is the wilds' moss `#4f5e3c` and earth `#5a4630` on
  `#2a3328`, the barrows its rock. The mounds are drawn in a mossy `#566044`, a little greener than
  the rock and nowhere near the nature green.
- **Layers (3):** L0 the moor floor and the two barrow ways; L1 four barrows (mounds, 70 up); L2 a
  cairn top on the west and on the east barrow (140 up). Transitions: six stairs, one per barrow and
  one up to each cairn top.
- **Structures (6 + 2 tunnels):** the west, east, north and south barrows; two cairn tops; a thin
  cairn shelter (overhang) over the west road. The 8v8 tick budget stays small: 3 layers, 6 stairs.
- **Tunnels:** the two **barrow ways** on L0, 110 wide, each straight under a barrow: west
  (1000,760) to (2050,760), east (4400,1840) to (3350,1840). Cover shows the seam and grating slots
  (#3236), shaded exactly as wide as the walkable floor (#3179).
- **Drop-offs (4):** the west barrow's north edge, the east barrow's south edge, the north barrow's
  north edge and the south barrow's south edge. Both cairn tops also drop to their barrow.
- **Priest objectives, per team.** Shrine 1 (700,980) with ghost-spawn (560,780) behind it for team 1,
  shrine 2 (4720,1620) with ghost-spawn (4840,1820) for team 2; spawn blocks T1 (480..600, 1250..1580)
  and T2 (4800..4920, 1020..1350), eight seats a side. Each shrine stands on open ground inside its
  own team's lit ring (radius 220), outside any tunnel, zone or deck. The other objectives are placed
  anew: the **storm-beacon** on the standing stones at the centre (2700,1300) and a **flag-spawn**
  near each team, (900,1700) and (4500,900).
- **Elements:** two brass **levers**, each on the barrow top that faces the other side, work the
  **gates** in the barrow ways: the lever on the south barrow (2050,1950) opens the west gate
  (1500,760), the one on the north barrow (3350,650) the east gate (3900,1840). Gates start shut.
  No lift is used (bots read a lever lift as closed). A **breakable fallen stone** (x 1790, y 1260..1460)
  closes a short lane in the west half. Zones: `mire` (peat, west, (1100,2000)) and `spring`
  (east, (4300,560)), off all routes and ≥ 200 u from a spawn. Water: two shallow **bog pools**
  (`#8fb8d6` at 30 %, (2700,2260) and (2750,350)), walkable scenery, no zone.
  Atmosphere (existing, #3032): three **fog banks** in the hollows (1500,1650), (3900,1000), (2700,2000):
  thin, under bodies, never over a shrine, a stair or a lever. If fog is meant to hide bodies, that is
  a mechanic: not designed here.
- **Light:** the **Dusk** row (visual-style §2): sun from the NW, 25°, `#ffb87a` 0.5. Cairn torches
  `#ffb060`, radius 150, at each barrow-way mouth, each stair and each lever; a larger ring (220) at
  each shrine and (200) at the standing stones. Nothing is dim but the barrow ways, and they carry
  their mouth torches.
- **Reduced motion:** torch flicker steady, fog holds still, spring drift stops; the gates move once
  on a lever.

## Routes and balance (base speed 180 u/s)

T1 centred (540,1415) in the south-west, T2 (4860,1185) in the north-east. The centre is the
standing stones, (2700,1300).

| Route to the centre (T1 / T2)                 | Length        | Walk          |
| --------------------------------------------- | ------------- | ------------- |
| moor road (open ground through the middle)    | 2190 / 2195 u | 12.2 / 12.2 s |
| barrow way (tunnel, gate open)                | 2702 / 2684 u | 15.0 / 14.9 s |
| over the barrow (stair, across the top, drop) | 2484 / 2477 u | 13.8 / 13.8 s |

**Shrines.** A foe reaches a shrine three ways, equal on both sides (a foe's walk, from spawn centre):

| Route to shrine 1 (T2) / shrine 2 (T1) | Length        | Walk          |
| -------------------------------------- | ------------- | ------------- |
| moor road                              | 4267 / 4298 u | 23.7 / 23.9 s |
| south moor (past the south barrow)     | 4481 / 4522 u | 24.9 / 25.1 s |
| barrow way (tunnel, gate open)         | 4329 / 4338 u | 24.0 / 24.1 s |

The shrine to the centre is 2051 / 2077 u, 11.4 / 11.5 s, within 1 %. All walks are within 2 % T1 / T2.
**Worst case:** both gates shut and the fallen stone standing leave each shrine two routes to a foe
(moor road, south moor), and every spawn two to the centre (moor road, over the barrow). A lever
lift is not used anywhere.

The sides differ on purpose: the east barrow is 7 % bigger (492 k u² against 458 k), the east cairn top
(101 k u²) against the west (95 k u²) within 7 %, the north barrow differs from the south, the
spring is east and the mire west, and the shelter and the breakable stand in the west half. High
ground within half the map of either spawn is one L2 cairn top, reached only by its barrow's stairs;
the barrows are open from every side, so the middle is contested, not owned.

## Canyon lessons, on the plan

- Every deck is reachable up and down by click-to-move (#3177): each stair has a walk-down, each
  cairn top has both a stair and a drop.
- No body is hidden without an outline (#3178/#3251): the stairs are open steps, nothing stands
  north or south of one; the shelter is thin; barrows are lit on the NW faces.
- The barrow-way cover is the walkable floor and nothing wider (#3179); paving over it fades with the
  cutaway (#3272).

## New art needed

Nothing beyond the schema's elements: barrows are `decks` in an earth-moss look (a tint of the wilds,
no new row), standing stones are `rock`-look props, the gates use the existing gate look. Mechanics
are not designed here.
