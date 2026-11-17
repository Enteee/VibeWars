# The Guild Hall Isle study (#3432, part of #3077)

Study: `3077-guild-hall-isle-plan.png` (outline, layers, routes, objectives, world elements,
5200×3400), `-layer-0/1/2.png` (one layer's footprints each), `-spawn-team1.png` /
`-spawn-team2.png` (the default camera, 1100 tall, 16:9, with the team of eight). Regenerate with
`node scripts/assets/3077-guild-hall-isle-study.mjs docs/art` (needs inkscape; the SVGs are not
committed; the drawing is shared in `scripts/assets/3077-study-lib.mjs`). The PNGs are a guide, not
coordinates. The layout is new: today's map (3000×2000, flat) is thrown away, the place (an island
with two guild halls, piers, a beach, a gatehouse and rooftops, the sea as the outside) is kept.

## Rules the study holds

- **Bounds** 5200×3400 = 17.7 M u² (3.5× Canyon; long side 5200 > 4800, short side 3400 ≥ 1800,
  above the 12.6 M u² 8v8 bound). The island shore (a 44-point outline, symmetric in x) fills 71 %
  (≥ 60 %). The sea is **outside**: it is the `outside` tone, not deep water inside the map.
- **Biome: propose `coast`** (no existing biome has wet sand and a sea). #3172 row: ground
  `#3b3a33` (wet sand), rock `#5d6064`, earth `#4a4a3a`, no plants; decks (timber and stone)
  `#7a7468`, outside sea `#1f3038`, a dark desaturated blue-grey, far from the friend blue
  `#59c2ff` and help blue `#3f9fe8` in chroma. The §1 line to add: "The coast (#3432) is a wet, dark
  sand shore under a sea at low chroma, so friend and help blue stay the loudest blues." The first
  build PR adds it.
- **Layers (3):** L0 the beach and the two cellars; L1 the two halls, two gatehouses, the flag mound
  and two piers (70 up); L2 the two tower roofs (140). 18 stairs.
- **Structures (9 + 2 tunnels):** two halls, two gatehouses, two tower roofs, the flag mound, two
  piers. Near Moss Vale's count.
- **Tunnels (2 cellars):** the south beach (2000,2750) under the south pier to a stair inside the
  hall at (1700,2150), and the x-mirror, 110 wide, a gate at each mouth. Cover shows the seam and
  grating slots (#3236), as wide as the walkable floor (#3179).
- **Drop-offs (3):** each hall's outer edge, the flag mound's north edge.
- **Elements:** two brass **levers**, one on each hall's floor ((1700,2000) and its mirror), each
  **opens both cellar gates**; either team opens them and they stay open. No lift is used, so bots
  are not affected. Two **breakable crate barricades** ((2050,1020), (3126,2220)) close short-cuts
  from a beach to a pier. Zones: `spring` ×2, `mire` ×2, off every route and ≥ 200 u from a spawn.
  Two shallow **tidal flats** under the piers (walkable, clear water). Atmosphere (existing,
  #3032): two sea-haze patches on the outer beach, never over a point, stair or lever. Two **eave**
  overhangs (the halls' roofs) that fade.
- **Light:** the **Day** row (visual-style §2), 50°, `#fff1d6` 0.55. A ring (260) on each lord and the
  flag stand, shrines, gatehouses, spawn blocks, piers, levers, torches `#ffb060` (150) at the two
  cellar gates. 15 lights, under 16. Nothing is dim except the cellars, which have mouth torches.
- **Reduced motion:** torch flicker steady, haze holds still, spring drift stops; the cellar gates
  move once on a lever.
- **8v8 tick budget:** 3 layers, 9 structures.

## Objectives (counts as today)

Guild lord 2: (1700,1700) and its mirror (3500,1700), inside each team's own hall (L1). Guards 16:
eight round each lord, all inside that team's hall floor
(see the plan). Flag stand 1: the mound at the centre (2600,1700, L1). Flag spawn 2: (1500,880)
and (3700,880), one per team on its north beach. Resurrection shrines 2: (500,1200) and (4700,1200)
behind each team's spawn.

## Routes and balance (base speed 180 u/s)

The map is the x-mirror of itself, so the two teams walk the same (0 % gap): the gap the structure
gives, not a promise about the final art. Team 1 spawns at (560,1665), team 2 at (4640,1665).

**Spawn to the enemy guild lord** (both teams):

| Route                                             | Walk   |
| ------------------------------------------------- | ------ |
| through the enemy **gatehouse** (flag mound side) | 21.6 s |
| north pier, then the hall's north stair           | 22.3 s |
| south pier, then the hall's south stair           | 23.2 s |
| beach, then the **cellar**                        | 24.5 s |

All four are under 25 s, and four routes (≥ 2), one through the gatehouse. **Spawn to the flag
stand:** north beach 15.8 s, south beach 16.7 s (both teams equal; the flag stand is on the
axis, so it is equidistant 0 % rather than 5 %). **Own spawn to the centre** 16.6 s.

**High ground:** each hall (900 k u²) and its tower roof (68 k u²) is its team's; the mound
(120 k u²) and piers are shared. The roof overlooks its hall's floor, the gatehouse and the beach.
**Worst case:** the cellar gates shut and the barricades unbroken leave the gatehouse and both
piers (≥ 2 routes to each lord and to the flag stand).

## Canyon lessons, on the plan

- Every deck is reachable up and down by click-to-move (#3177): the halls have stairs on three
  faces, the piers at both ends, the mound on both faces, the towers one.
- No body is hidden without an outline (#3178/#3251): stairs are open steps, nothing stands north
  or south of one; the eaves fade.
- The cellar cover is the walkable floor and nothing wider (#3179); the eaves fade with the
  cutaway (#3272).

## New art needed / not built

The `coast` biome row above (the build card's). Halls, gatehouses, piers and the mound are stacked
`decks`; the tidal flats the existing shallow water; the cellar gates the existing gate look.
Nothing else new; nothing designed here.

## Questions

- The flag stand cannot be 5 % off equidistant on a mirrored map; it is 0 %. If an off-centre flag
  stand is wanted, the layout holds.
- Guild-lord and guard art is the existing unit look; the plan's marks are placeholders.
