# Elonian Plateau study (#3392, part of #3073)

Study: `3073-elonian-plateau-plan.png` (outline, layers, routes, world elements, 4600×2800),
`-layer-0/1/2.png` (one layer's footprints each), `-spawn-team1.png` / `-spawn-team2.png`
(the default camera, 1100 tall, 16:9, with the team of eight). Regenerate with
`node scripts/assets/3073-elonian-plateau-study.mjs docs/art` (needs inkscape; the SVGs are not
committed). The PNGs are a guide, not coordinates. The layout is new: today's map (6400×3600) is
thrown away, the place (a desert plateau of mesas: lifts up the mesas, a natural arch, a dry
canyon between, a sandstorm on a timer) is kept.

## Rules the study holds

- **Bounds** 4600×2800 = 12.88 M u² (2.55× Canyon, 8v8, short side 2800 ≥ 1800). The ground outline
  fills 66 % of it, ragged, with `rock` (`OUTSIDE_KINDS`) outside: boulders and scree, drawn right round the outline in the plan
  and both spawn frames. Sized to the walk, not to today's 6400 width: the walk from a spawn to the
  centre is 11 s, under the 25 s cap.
- **Biome `desert`** (visual-style §1): ground `#3b3226`, rock `#6e6252`, stone decks `#c2b296`,
  tops `#d3c5a8`. No new row. Blue and red appear only on bodies and team marks.
- **Layers (3, ≤ 4):** L0 the dry canyon floor (the wash) and the passage; L1 four mesas (`decks`, 70 up)
  and the arch; L2 a top on the north-west and one on the south-east mesa (`decks`, 140 up).
- **Structures (11, near Moss Vale's):** four L1 mesas; the natural arch; three timer lifts
  (west, north-east, south-east mesa); the centre-fin stair; two top stairs (the two L2 tops are
  the two decks). Counts: 3 layers, 11 structures.
- **Lifts (#3079):** all three are **timer lifts**, because bots ride timer lifts and treat lever
  lifts as closed (`packages/game-core/src/match/lifts.ts`). There is no lever lift, so no stair
  alternative is needed for a lever; the centre fin also has a plain stair, and each mesa has a lift
  up and a drop down.
- **Tunnel:** the **passage** under the centre fin on L0, 110 wide, mouths at (1850,1360) and
  (2850,1360). Cover shows the seam and grating slots (#3236), shaded exactly as wide as the walkable
  floor (#3179).
- **Drop-offs (4):** the west mesa's south edge, the south-east mesa's south edge, the fin's south edge
  and the west top to its mesa.
- **Elements:** a brass **lever** on the centre fin at (2300,1250) works the **gate** in the
  passage at (2350,1360) (shut, the passage is a dead end for both teams alike; the wash and the
  lift-and-arch route remain). A **breakable sandstone wall** across the wash's south neck at x 2288, y 1840..2100.
  Zones: `scorched` (sun-baked rock, west, (1000,1950)) and `rockfall` (loose scree, east,
  (3600,1100)), off all routes, ≥ 200 u from a spawn. A **seep**, a shallow standing pool (the shallow water look, `#8fb8d6` at 30 %, pale rim) at (1500,2250) on L0, south of the wash and ≥ 450 u from every route: walkable scenery, no zone, so the 5 % balance holds. The **sandstorm** is the atmosphere that exists
  (#3032), a pale band in the south-east, on a timer, and under bodies. If it is meant to cut vision
  or slow players, that is a mechanic: not designed here, listed below.
- **Light:** the **Day** row (visual-style §2): sun from the NW, 50°, `#fff1d6` 0.55, ambient
  `#b0bcd4` 0.45. Torches `#ffb060`, radius 140–150, at both passage mouths, each lift, each stair
  and the lever, a forge-red glow at the scorched rock. Nothing is dim but the passage, and it carries its mouth torches.
- **Reduced motion:** torch flicker steady, sandstorm drift and wash dust stop; the lifts' rise is a
  one-off move.

## Routes and balance (base speed 180 u/s)

Eight seats a side in a 2×4 block: T1 centred (480,1655) in the west mouth, T2 (4180,1380) in the east. The centre is
the foot of the centre fin, (2300,1560). T2's block stands about 80 u from the east outline on purpose: it backs onto the rim, as T1 does not.

| Route (T1 / T2)                                           | Length        | Walk          |
| --------------------------------------------------------- | ------------- | ------------- |
| wash (the open canyon floor)                              | 2014 / 2116 u | 11.2 / 11.8 s |
| passage (under the fin)                                   | 2054 / 1960 u | 11.4 / 10.9 s |
| lift and arch (a lift, over the mesas and the arch, down) | 3841 / 3865 u | 21.3 / 21.5 s |

The walks are within 5 % T1 / T2. The lift-and-arch route is the long high road: each side takes its
nearest lift and crosses the arch to the far mesa, so the north is contested, not owned. The sides
differ on purpose: the west top (161 k u²) and the east (164 k u²) are within 2 %, but the mesas differ in
outline and count (two to the north-west and north, one south-east), the forge-red scorched rock is west
and the rockfall east. High ground within half the map of either spawn is one L2 top, reached by its
mesa's lift and stair.

## Canyon lessons, on the plan

- Every deck is reachable up and down by click-to-move (#3177): each lift and stair has a walk-down,
  each top has both a stair and a drop.
- No body is hidden without an outline (#3178/#3251): stairs are open steps, nothing stands south of
  one; the arch is a thin span; the mesa faces are lit.
- The passage cover is the walkable floor and nothing wider (#3179); paving over it fades with the
  cutaway (#3272).

## New art needed

Nothing beyond the schema's elements: the lifts use the existing lift look (#3079), the arch is a
stone `bridge` deck, the breakable wall uses the existing look in sandstone. Mechanics are not
designed here: **a sandstorm that cuts vision or slows players is not designed** and would need its own card.
