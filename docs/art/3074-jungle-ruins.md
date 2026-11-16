# Jungle Ruins study (#3426, part of #3074)

Study: `3074-jungle-ruins-plan.png` (outline, layers, routes, shrines, world elements, 5400×2800),
`-layer-0/1/2/3.png` (one layer's footprints each), `-spawn-team1.png` / `-spawn-team2.png`
(the default camera, 1100 tall, 16:9, with the team of eight). Regenerate with
`node scripts/assets/3074-jungle-ruins-study.mjs docs/art` (needs inkscape; the SVGs are not
committed; the drawing is shared in `scripts/assets/3074-study-lib.mjs`). The PNGs are a guide, not
coordinates. The layout is new: today's map (3000×1600) is thrown away, the place (overgrown temple
ruins: stepped pyramid terraces, collapsed colonnades, vines, a hidden passage, a river with a log
bridge) is kept.

## Rules the study holds

- **Bounds** 5400×2800 = 15.12 M u² (3.0× Canyon, long side 5400 > 4800, short side 2800 ≥ 1800).
  The ground outline fills 77 % of it, with `rock` (`OUTSIDE_KINDS`) outside. A river runs
  corner to corner (north-west to south-east) and splits the map; the stepped pyramid stands where it
  meets the centre. T1 holds the south-west, T2 the north-east, so every way between them crosses
  the river, the passage or the pyramid.
- **Biome: propose `jungle`** (the second new row; with `marsh` that is two across the four maps,
  the limit). Ground `#232c26` (dark, wet, a breath teal), rock `#5a5c52` (mossy stone), vine
  `#4a5a35` (olive, low chroma), clay earth `#5a4a30`. Visual-style §1 line: "the jungle is a dark
  wet floor with mossy grey stone, olive vine and clay; all low chroma, so the nature green and
  the friend blue stay the loudest things". It is added by this map's first build PR (#3172 rules).
  Why not `wilds`: the stone, vine and earth are different from the wilds' dressed stone.
- **Layers (4, the cap):** L0 the jungle floor, river and hidden passage; L1 the pyramid's first
  terrace, two courts and two log bridges (70 up); L2 the second terrace (140); L3 the summit (210).
  Twelve stairs: the pyramid's six, one per court, four for the log bridges.
- **Structures (7 + 1 tunnel):** terrace 1, terrace 2, summit, west and east court, two log bridges.
  Close to Moss Vale's count; the log bridges and courts are small.
- **Tunnel:** the **hidden passage** on L0, 110 wide, from the south-west mouth (2000,1750) under the
  pyramid to the north-east mouth (3400,1050). It is lever-driven (below). Cover shows the seam and
  grating slots (#3236), as wide as the walkable floor (#3179).
- **Collapsed colonnades:** two broken rows of six pillars each west and east of the pyramid
  (x 1750..2200, mirrored), low cover, no body hidden.
- **Drop-offs (4):** the two courts' sides (1400,1300), (4000,1300), terrace 1's north and south
  edges; the upper terraces drop to the one below.
- **Priest objectives, per team.** Shrine 1 (900,1000) with ghost-spawn (700,800) for team 1,
  shrine 2 (4524,1784) with ghost-spawn (4724,1984) for team 2; spawn blocks T1 (700..820,
  1240..1570) and T2 (4604..4724, 1214..1544), eight seats a side. Each shrine stands on open ground
  inside its team's lit ring (220), outside any tunnel, zone, water or deck. Other objectives, placed
  anew: the **storm-beacon** on the summit (2700,1400), a **flag-spawn** near each team,
  (1100,1750) and (4324,1034).
- **2v2 to 8v8.** Eight seats a side; a 2v2 uses the first two seats of each block (the two at
  the spawn's front), and fights in the middle of the map: the pyramid and the two colonnades,
  inside a 1400-radius ring round the summit. The rim and the shrines are the 8v8's. A 2v2's spawn to
  centre walk is 14.4 s (< 15 s), the south approach below.
- **Elements:** two **hidden doors**, one at each end of the passage, (2250,1625) and (3174,1175),
  start shut. Two brass **levers** on the courts work the far door: the west court's (1400,1150)
  the north-east door, the east court's (4024,1400) the south-west door. No lift is used (bots read a
  lever lift as closed). A **breakable vine-choked wall** (x 1850, y 1500..1700) closes a lane at the
  west colonnade. Zones: `spring` (1000,2300) and `mire` (4400,500), off every route, ≥ 200 u from
  a spawn. Water: the **river**, deep (impassable), with a shallow **ford** on each arm
  ((2200,890) and its mirror) and a **log bridge** on each arm. Atmosphere (existing, #3032): three
  mist banks, under bodies, never over a shrine, a stair or a lever. Vines are `canopy`
  overhangs, thin, at two places off every route.
- **Light:** the **Day** row (visual-style §2), sun from the NW, 50°, `#fff1d6` 0.55; the canopy
  overhangs fade over a body. Torches `#ffb060`, radius 150, at each passage mouth, ford and
  pyramid foot; rings (220) at each shrine and the summit. 11 lights, under 16. Nothing is dim
  except the passage, which has its mouth torches.
- **Reduced motion:** torch flicker steady, mist holds still, spring drift stops; the hidden
  doors move once on a lever.

## Routes and balance (base speed 180 u/s)

T1 centred (760,1405) in the west, T2 (4664,1379) in the east. Centre: the summit, (2700,1400).

| Route to the centre (T1 / T2)                | Length        | Walk          |
| -------------------------------------------- | ------------- | ------------- |
| south approach (pyramid stairs, no crossing) | 2585 / 2600 u | 14.4 / 14.4 s |
| north ford (shallow, north stairs)           | 2670 / 2653 u | 14.8 / 14.7 s |
| log bridge (north-west or south-east)        | 3424 / 3407 u | 19.0 / 18.9 s |

**Shrines.** A foe reaches a shrine three ways, equal on both sides (a foe's walk, from spawn centre):

| Route to shrine 1 (T2) / shrine 2 (T1) | Length        | Walk          |
| -------------------------------------- | ------------- | ------------- |
| north ford                             | 3846 / 3846 u | 21.4 / 21.4 s |
| hidden passage (gate open)             | 4205 / 4205 u | 23.4 / 23.4 s |
| south ford                             | 4261 / 4261 u | 23.7 / 23.7 s |

The shrine to the centre is 2470 / 2453 u, 13.7 / 13.6 s, within 1 %. All walks are within 2 % T1 / T2.
**Worst case:** both doors shut leave each shrine two routes (north and south ford) and every
spawn two to the centre (south approach, north ford). A lever lift is not used anywhere.

The sides differ on purpose: the east court is 6 % smaller than the west, the spring is south-west
and the mire north-east, the colonnades differ by a pillar's phase, and the log bridges sit at the far
ends of the river. High ground within half the map of either spawn is a court or terrace 1; terrace 2
and the summit are one stair each from either side.

## Canyon lessons, on the plan

- Every deck is reachable up and down by click-to-move (#3177): each terrace has stairs on both
  faces; the courts and bridges have a stair at each end and a drop.
- No body is hidden without an outline (#3178/#3251): stairs are open steps, nothing stands north or
  south of one; the canopy is thin and fades.
- The passage cover is the walkable floor and nothing wider (#3179); the pyramid over it fades with
  the cutaway (#3272).

## New art needed

The `jungle` biome row (above), added by the first build PR. The pyramid is stacked `decks` in the
jungle stone; the doors are the existing gate look, vines the `canopy` overhang look.
Mechanics are not designed here.
