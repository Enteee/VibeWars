# Threefold Keep study (#3431, part of #3076)

Study: `3076-threefold-keep-plan.png` (outline, layers, routes, gates, world elements, 5000×4400),
`-layer-0/1/2.png` (one layer's footprints each), `-spawn-team1/2/3.png` (the default camera, 1100
tall, 16:9, with the team of eight). Regenerate with
`node scripts/assets/3076-threefold-keep-study.mjs docs/art` (needs inkscape and imagemagick; the SVGs
are not committed; the drawing is shared in `scripts/assets/3076-study-lib.mjs`). The PNGs are a guide,
not coordinates. The layout is new: today's map (3200×2200, flat) is thrown away, the place (a keep
with three approaches, wall-walks, a tower over the hill, four gates) is kept. Like the Hall, it is
one piece turned by 120° (team 1 north, team 2 south-east, team 3 south-west), so every walk below
is the same for all three teams.

**Since #4098** the built map differs from this study: stairs climb only north, east, south or west,
so each of the keep's pieces (gate, wall-walk stairs, ward stair, tower stair) is turned with its
team's axis to the nearest quarter (south-east 90°, south-west 270°), every one on its team's axis;
north, the one piece not turned, has its spawns set back and its ward stair 120 east, which evens
out its walks. There is no undercroft and no keep gate: tunnels are rectangles, so no undercroft
can be the same for all three teams.

## Rules the study holds

- **Bounds** 5000×4400 = 22.0 M u² (long side 5000 > 4800, short side 4400 ≥ 1800, above the 12.6 M
  u² bound for 8v8). The ground outline is a 12-gon of radius 2200 round (2500,2200), 66 % of the
  rectangle (≥ 60 %), with `rock` (`OUTSIDE_KINDS`) outside.
- **Biome: `heights`** (visual-style §1: ground `#26303f`, rock `#4b5a70`, decks `#a0b2c7`), day
  masonry. No new row. Signal colours stay on bodies, rings and rails.
- **Layers (3):** L0 the outer court, the ward and the tunnels; L1 the **wall-walk** ring (70 up,
  r 1020..1180, three arcs), three **causeways** to the hill and the **hill** (radius 800); L2 the
  **tower** (140, radius 340), where the **altar** stands. Nineteen stairs: six up the wall-walk
  (outside, 26° either side of each gate), six from the ward to the hill, six up the tower, one out
  of the undercroft.
- **Structures (8 + tunnels):** the hill, the tower, three wall-walk arcs, three causeways.
- **Tunnels:** three **gate passages** (200 wide, r 1320..900) run under the wall-walk, one per team
  (the gates in them); an **undercroft** of three branches (110 wide) from a mouth (r 1250 at -30°,
  90°, 210°) under the wall-walk, causeway and hill to the tower's foot, and one exit branch to the
  **undercroft stair** (r 480..620, at 0°) up onto the hill. Cover shows the seam and grating slots
  (#3236), as wide as the walkable floor (#3179).
- **Drop-offs (6):** the wall-walk's inner edge on each team's axis and the causeway flanks.
- **Four gates, as today:** three **gates** (one on each approach, in the gate passage at r 1100) and
  one **keep gate** where the undercroft rises (0°, r 400). All start shut. Today's four are four
  doors round one keep; with three teams a fourth round door cannot be fair, so the fourth guards the
  one thing all three share, the undercroft's exit (put under "Questions").
- **Objectives (as today, placed anew):** one **altar** at the centre of the tower (layer 2), reached
  by ≥ 2 stair routes, never a lift; three **ghost-spawns** (2820,700) turned, each in its team's
  court, outside any tunnel, zone or deck. Spawn blocks are eight seats a side: team 1 (2440..2560,
  300..630), the others the same block turned.
- **4v4:** the same map and the first four seats of each block; the fight is the hill.
- **Elements:** three brass **levers**, one in each court (2250,880) turned, **each opens all four
  gates** (a pulled lever opens them for everyone); no lift is used (bots read a lever lift as
  closed). A **breakable palisade** (180 long) per team (3100,560) turned, off every route. Zones:
  a `spring` and a `mire` per team (turned), off every route, ≥ 300 u from a spawn and objective.
  Water: three shallow **moat pools**, off every route. Atmosphere (existing, #3032): three dust
  banks, under bodies, never over an altar, a stair or a lever. One `canopy` overhang (a fallen
  beam). Six pillars on the tower between its stairs.
- **Light:** the **Day** row (visual-style §2), sun from the NW, 50°, `#fff1d6` 0.55. Torches
  `#ffb060`, radius 150, at each gate and undercroft mouth; rings (220) at the altar; (180) at each
  ghost-spawn; levers (130). 13 lights, under 16. Nothing is dim except the tunnels, which have
  their mouth torches.
- **Layers and structures for 8v8:** 3 layers (≤ 4), 8 structures + tunnels, near Moss Vale.
- **Reduced motion:** torch flicker steady, dust holds still, spring drift stops; the gates move once
  on a lever.

## Routes and balance (base speed 180 u/s)

Team centres (2500,465), turned. Altar (2500,2200).

| Spawn to the altar (all three teams)                 | Walk   |
| ---------------------------------------------------- | ------ |
| gate (open), ward stair, tower stair                 | 14.0 s |
| wall-walk east (stair, along, causeway, tower stair) | 15.4 s |
| wall-walk west                                       | 15.4 s |
| undercroft (gates and keep gate open)                | 21.8 s |

The gate and the two wall-walks are within 10 % of each other (14.0..15.4 s); the undercroft is the
long flank, 21.8 s (< 25 s). Across teams every walk is equal (0 %, within 10 %).

**High ground** is the tower's base rim and the wall-walk: each team reaches the tower's rim by its
east or west wall-walk in 9.3 s, the same for all three (0 %, within 25 %).
**Worst case:** the three gates and the keep gate shut leave every spawn two routes to the hill and
altar (wall-walk east and west). Shut, no team is shut out while the others are not: the routes are
the same for all three and no route runs through another team's spawn. The centre is reachable from
each spawn by ≥ 2 routes (≥ 4 with the gates open).

## Canyon lessons, on the plan

- Every deck is reachable up and down by click-to-move (#3177): the wall-walk has six stairs out and
  drops in; the hill has six ward stairs; the tower six.
- No body is hidden without an outline (#3178/#3251): stairs are open steps, nothing stands north or
  south of one; the beam is thin and fades.
- The tunnel cover is the walkable floor and nothing wider (#3179); the wall-walk and hill over them
  fade with the cutaway (#3272).

## New art needed / not built

Nothing new: wall-walk, causeways and hill are stacked `decks` in the heights stone, the gates the
existing gate look, the beam the `canopy` overhang look. Mechanics are not designed here.

## Questions

- Four gates with three teams: the study keeps three approach gates and a central keep gate on the
  undercroft's exit. If the four should be four doors round the keep, the fairness rules (equal for all
  three teams) cannot hold; say which is wanted before the build card.
