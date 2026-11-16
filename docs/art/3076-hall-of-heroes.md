# Hall of Heroes study (#3431, part of #3076)

Study: `3076-hall-of-heroes-plan.png` (outline, layers, routes, objectives of all three modes,
world elements, 5200×4400), `-layer-0/1/2.png` (one layer's footprints each),
`-spawn-team1/2/3.png` (the default camera, 1100 tall, 16:9, with the team of eight). Regenerate
with `node scripts/assets/3076-hall-of-heroes-study.mjs docs/art` (needs inkscape; the SVGs are not
committed; the drawing is shared in `scripts/assets/3076-study-lib.mjs`, the #3075 one for any
number of teams). The PNGs are a guide, not coordinates. The layout is new: today's layout
(3200×2200, flat, shared by three files) is thrown away; the place (a hero's hall: a central dais
on a plinth, galleries, a crypt under the floor) is kept.

**One layout, three files.** `hall-of-heroes-capture`, `-king` and `-relic` keep sharing one
outline, one set of layers and structures. Only the objectives differ (below).

## Rules the study holds

- **Bounds** 5200×4400 = 22.9 M u² (long side 5200 > 4800, short side 4400 ≥ 1800, above the
  12.6 M u² 8v8 bound). It is taller than a two-team map because three bases sit round the dais.
  The ground outline fills 74 % (≥ 60 %), `rock` outside.
- **Three teams round the dais.** Team 1 north-west (700,900), team 2 north-east (4500,900), team 3
  south (2600,3950), each about 2150 from the dais (2600,1900). Teams 1 and 2 mirror in x; team 3
  stands on the axis. No spawn is on the line between the other two: that line (y 900) runs north
  of the dais and team 3 is 3000 south of it.
- **Biome: `hall`** (visual-style §1: ground `#26303f`, deck `#4b5a70`, stone and steel, no
  plants). No new row.
- **Layers (3):** L0 the floor and the three crypts; L1 the plinth and three galleries (70 up); L2
  the dais (140 up). 16 stairs.
- **Structures (5 + 3 crypts):** the plinth (an octagon, 1040 across), the dais on it (480 across),
  the **north gallery** (between teams 1 and 2, x 1900..3300, y 420..660), the **south-west** and
  **south-east galleries** (between 3 and 1, and 3 and 2: x 1000..1900 and its mirror, y
  2800..3040). Each gallery has a stair at each end.
- **Plinth stairs:** two on the west face (the upper faces team 1, the lower is shared by teams 1
  and 3), two on the east face (mirrored), one on the north face (shared by teams 1 and 2), one on
  the south face (team 3). The dais has one stair on each face. So every team has its own stair and
  two shared ones, and the centre is reached from each spawn by ≥ 3 routes, none through another
  team's spawn.
- **Tunnels (3 crypts, L0, 120 wide):** the **north crypt** (y 860, x 1500..3700) joins team 1's
  flank to team 2's; the **south-west crypt** (x 560 from y 1500 to 2420, then east to x 1300)
  joins team 1's flank to team 3's; the south-east crypt mirrors it. Cover shows the seam and
  grating slots (#3236), as wide as the walkable floor (#3179).
- **Drop-offs (4):** each gallery's inner edge (north gallery at x 2300, the side galleries at x
  1850 and 3350), and the dais's south-west edge down to the plinth.
- **Elements:** three **crypt gates**, one in the middle of each crypt, each on its own brass
  **lever** on the plinth (L1), on the face towards its crypt. Any team flips any lever; it toggles.
  No lift is used. Three **breakable toppled heroes**, one beside each home point on its centre side
  (24×240). Zones: `spring` ×3 (the north alcove behind the north gallery, the two south-west and
  south-east alcoves) and `mire` ×3 (north of the plinth, and south-west and south-east of it), one
  of each between every pair of teams, all off every route and ≥ 200 u from a spawn. Two shallow
  **reflecting pools** (walkable, clear water) west and east of the plinth, off every route (shallow
  water slows, #3463). Atmosphere (existing, #3032): three dust-in-the-light patches, under bodies,
  never over a point, stair or lever. Three `canopy` overhangs (hanging banners) off every route.
- **Hero rings:** each home point stands in a ring of four statues (a stone `pillar` prop each).
- **Light:** the **Day** row (visual-style §2), 50°, `#fff1d6` 0.55: sun falls through a lantern
  over the dais. A skylight ring (300, `#fff1d6`) on the dais, (240) on each home point, torches
  `#ffb060` (150) at the six crypt mouths, rings (190) at the three bases. 13 lights, under 16.
  Nothing is dim except the crypts, which have their mouth torches.
- **Reduced motion:** torch flicker steady, dust holds still, spring drift stops; a gate moves once
  per lever pull.
- **8v8 tick budget:** 3 layers, 5 structures.
- **Nav nodes (estimate):** ~200 (outline 15, plinth and dais 16, galleries 12, 16 stairs, 3 gates,
  3 breakables at 4 each, 12 statues at 4 each, crypt walls ~30), well under the 600 cap.

## Objectives, per mode

| Mode (file)                | What                   | Where                                                                                                                                                                                             |
| -------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| capture (`-capture`)       | capture-point ×4       | **P4** the centre on the dais (L2); **P1** (1560,1360), **P2** (3640,1360), **P3** (2600,2980): one home point per team on the floor in its hero ring, 45 % of the way from its spawn to the dais |
| capture                    | resurrection-shrine ×3 | each team's base: (420,700), (4780,700), (2600,4190)                                                                                                                                              |
| king of the hill (`-king`) | altar ×1               | on the dais (L2), where P4 is                                                                                                                                                                     |
| king                       | ghost-spawn ×3         | beside each base                                                                                                                                                                                  |
| relic run (`-relic`)       | altar ×1               | on the dais (L2)                                                                                                                                                                                  |
| relic                      | relic-spawn ×3         | beside each base; each team carries its own relic to the altar (`relicCarry: own`, as today)                                                                                                      |

Every kind and count stays as today.

## Routes and balance (base speed 180 u/s)

Teams 1 and 2 mirror, so each pair of their walks is the same; team 3's are tuned to within 10 %.
The spread is (slowest − fastest) / slowest over the three teams.

| Spawn to the dais top (T1 / T2 / T3) | Walk                 | Spread |
| ------------------------------------ | -------------------- | ------ |
| nave (own plinth stair)              | 13.2 / 13.2 / 12.6 s | 5 %    |
| flank (shared plinth stair)          | 14.5 / 14.5 / 16.0 s | 9 %    |
| gallery, then the drop-off           | 17.7 / 17.7 / 17.1 s | 3 %    |

Team 3 can take either the west or the east shared stair, at the same walk.

| Objective walks (T1 / T2 / T3)                             | Walk                 | Spread |
| ---------------------------------------------------------- | -------------------- | ------ |
| spawn to own home point                                    | 5.4 / 5.4 / 5.4 s    | 1 %    |
| spawn to the next team's home point (1→P2, 2→P3, 3→P1)     | 16.6 / 15.7 / 15.5 s | 6 %    |
| spawn to the previous team's home point (1→P3, 2→P1, 3→P2) | 15.7 / 16.6 / 15.5 s | 6 %    |
| base (ghost-spawn, relic-spawn) to the altar               | 15.1 / 15.1 / 13.9 s | 8 %    |

Mirrored pairs (architect, #3430): T1→P3 equals T2→P3, T1→P2 equals T2→P1, T3→P1 equals T3→P2,
each 0 %. Every spawn-to-fight walk is under 18 s (< 25 s). Only 8v8 exists today
(`teamSizes [8]`).

**High ground:** spawn to the nearest gallery: 6.1 / 6.1 / 6.5 s (5 %). Teams 1 and 2 share the
north gallery, teams 1 and 3 the south-west, teams 2 and 3 the south-east: every team is next to
two galleries and every gallery is shared by exactly two teams. The dais overlooks P4 and all four
plinth stairs.

**Worst case:** with all three crypt gates shut and the heroes unbroken, every spawn keeps its
three routes to the dais (the crypts are bypasses) and ≥ 2 routes to each home point (the floor
either side of the hero ring). No team is shut out while the others are not: the gates are the
same for each pair of teams.

## Canyon lessons, on the plan

- Every deck is reachable up and down by click-to-move (#3177): the plinth has six stairs, the dais
  four, each gallery one at each end.
- No body is hidden without an outline (#3178/#3251): stairs are open steps, nothing stands north
  or south of one; the banners are thin and fade.
- The crypt cover is the walkable floor and nothing wider (#3179); the galleries fade with the
  cutaway (#3272).

## New art needed / not built

Nothing new: the plinth, dais and galleries are stacked `decks` in the hall stone, the statues the
existing `pillar` prop, the pools the existing shallow water, the gates the existing gate look.
Mechanics are not designed here.

## Questions

- Today only the north point carries `base: 2`. Here all three home points are home points; should
  each carry `base` for its team, or none? The layout holds either way.
