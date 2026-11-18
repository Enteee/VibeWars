# Hall of Heroes study (#3431, part of #3076)

Study: `3076-hall-of-heroes-plan.png` (outline, layers, routes, objectives of all three modes, world
elements, 5000×4400), `-layer-0/1/2.png` (one layer's footprints each), `-spawn-team1/2/3.png` (the
default camera, 1100 tall, 16:9, with the team of eight). Regenerate with
`node scripts/assets/3076-hall-of-heroes-study.mjs docs/art` (needs inkscape and imagemagick; the SVGs
are not committed; the drawing is shared in `scripts/assets/3076-study-lib.mjs`). The PNGs are a guide,
not coordinates. The layout is new: today's map (3200×2200, flat) is thrown away, the place (a hero's
hall: a central dais on a plinth, galleries, a crypt under the floor) is kept.

**One layout for `hall-of-heroes-capture`, `-king` and `-relic`.** Everything below is the shared
outline, layers and structures; the objective table says what each file puts where. The whole hall is
one piece turned by 120° three times (team 1 north, team 2 south-east, team 3 south-west), so every
walk below is the same for all three teams, and the numbers are quoted once.

**As built (#3442): rotations snapped to axes.** The schema has axis-aligned rects only for
tunnels, pits and stairs, and stairs climb n/e/s/w, so the built crypts are L-shaped runs of
equal length, the stairs face the nearest cardinal and the dais has two stairs on its east and
west faces; the turn is not exact, and fairness is shown by walks within 10 % across the teams
(`tools/map-balance.test.ts`) instead.

## Rules the study holds

- **Bounds** 5000×4400 = 22.0 M u² (long side 5000 > 4800, short side 4400 ≥ 1800, above the 12.6 M u²
  bound for 8v8). The ground outline is a 12-gon of radius 2200 round (2500,2200), 66 % of the
  rectangle (≥ 60 %), with `rock` (`OUTSIDE_KINDS`) outside.
- **Biome: `hall`** (visual-style §1: ground `#26303f`, deck `#4b5a70`, stone and steel, no plants).
  No new row. Signal colours stay on bodies, rings and rails; team 3's drawn colour is only the
  study's, the game has its own team colours.
- **Layers (3):** L0 the floor and the crypt tunnels; L1 the plinth (70 up, radius 720) and the three
  galleries; L2 the dais (140, radius 330), where the **altar** stands. Twelve stairs: three gallery
  stairs (outer ends), three crypt stairs (up through the plinth), six dais stairs.
- **Structures (5 + 3 tunnels):** plinth, dais, three galleries (radial balconies, r 600..1500, 360
  wide, at -30°, 90° and 210°, each between two teams). Fewer than Moss Vale.
- **Tunnels:** three **crypts** on L0, 110 wide, from a mouth (r 1860 at -45°, 75°, 195°) in the
  outer floor under the plinth's rim to r 520, each coming up by a **crypt stair** (r 470..640) onto
  the plinth. Each mouth has a door. Cover shows the seam and grating slots (#3236), as wide as the
  walkable floor (#3179).
- **Drop-offs (6):** the plinth edge on each team's axis and the gallery flanks.
- **Objectives (as today, placed anew), by file:**

| Objective                                      | capture               | king          | relic         |
| ---------------------------------------------- | --------------------- | ------------- | ------------- |
| centre of the dais (altar, layer 2)            | capture-point 4       | altar         | altar         |
| gallery mid, r 1150, layer 1 (×3)              | capture-points 1..3   | –             | –             |
| team court (×3): shrine (2200,740) turned      | resurrection-shrine 3 | –             | –             |
| team court (×3): ghost-spawn (2160,420) turned | –                     | ghost-spawn 3 | –             |
| team court (×3): relic spawn (2800,740) turned | –                     | –             | relic-spawn 3 |

Every spot is on open ground inside the team's lit ring (r 220 for the relic), outside any tunnel,
zone or deck. Spawn blocks are eight seats a side: team 1 (2440..2560, 300..630), the other two
the same block turned.

- **4v4:** the same map and the first four seats of each block; the fight is the plinth.
- **Elements:** three **crypt doors** at the mouths start shut. Three brass **levers**, one in each
  team's court (2330,960) turned, **each opens all three doors**: a pulled lever opens the crypt for
  everyone. No lift is used (bots read a lever lift as closed). A **breakable colonnade wall** (180
  long) in front of each team (2410,1190), off every route. Zones: a `spring` and a `mire` per team
  (turned): spring r 1900 at -112°, mire r 1950 at -140°, off every route, ≥ 300 u from a spawn and
  objective. Water: three shallow **pools** (r 1980 at -72°, turned), off every route. Atmosphere
  (existing, #3032): three dust banks, under bodies, never over an altar, a stair or a lever. One
  `canopy` overhang (a fallen lintel, 1050..1270, 830..900). Six pillars stand on the dais between
  its stairs.
- **Light:** the **Dusk** row (visual-style §2), sun from the NW, 25°, `#ffb87a` 0.5, an indoor
  hall: torches `#ffb060`, radius 150, at each crypt mouth and gallery; rings (220) at the altar and
  each relic spawn; levers (130). 13 lights, under 16. Nothing is dim except the crypts, which have
  their mouth torches.
- **Layers and structures for 8v8:** 3 layers (≤ 4), 5 structures + 3 tunnels, close to Moss Vale.
- **Reduced motion:** torch flicker steady, dust holds still, spring drift stops; the doors move
  once on a lever.

## Routes and balance (base speed 180 u/s)

Team centres (2500,465), turned. Altar (2500,2200).

| Spawn to the altar (all three teams)              | Walk   |
| ------------------------------------------------- | ------ |
| east gallery (stair r 1700, along it, dais stair) | 19.0 s |
| west gallery                                      | 19.0 s |
| crypt (door open)                                 | 17.7 s |

Within a team the three routes are 17.7..19.0 s (7 %). Across teams the walks are equal (the hall is
turned, so 0 %, within 10 %). Spawn to fight stays under 19.1 s (< 25 s).

**Carrier walks** (relic spawn to the altar): east gallery 16.8 s, west gallery 19.9 s, crypt 15.7 s,
the same for all three teams (0 %).

**High ground** overlooking the altar is the galleries' rims and the plinth edge. Each team reaches
its two neighbour galleries' mid in 12.9 s, the same for all three (0 %, within 25 %).
**Capture-points:** spawn to a neighbour gallery's point 12.6 s; every team has the same two
neighbours' worth, the far gallery is across the hall.
**Worst case:** the three crypt doors shut leave every spawn and every relic two gallery routes to
the altar; no route runs through another team's spawn (the three spawns are a triangle with the dais
inside it, and the galleries run between them). The altar and each gallery are reachable by every
team.

## Canyon lessons, on the plan

- Every deck is reachable up and down by click-to-move (#3177): each gallery has a stair at its
  outer end and drops at its flanks; the plinth has crypt stairs and six dais stairs.
- No body is hidden without an outline (#3178/#3251): stairs are open steps, nothing stands north or
  south of one; the lintel is thin and fades.
- The crypt cover is the walkable floor and nothing wider (#3179); the plinth over it fades with the
  cutaway (#3272).

## New art needed / not built

Nothing new: the plinth and galleries are stacked `decks` in the hall stone, the doors the existing
gate look, the lintel the `canopy` overhang look. Mechanics are not designed here.

## Questions

None.
