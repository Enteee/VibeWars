# The Hall of Heroes study (#3431, part of #3076)

Study: `3076-hall-of-heroes-plan.png` (outline, layers, routes, objectives, world elements, 4900×4400),
`-layer-0/1/2.png` (one layer's footprints each), `-spawn-team1/2/3.png` (the default camera, 1100
tall, 16:9, with the team of eight). Regenerate with
`node scripts/assets/3076-hall-of-heroes-study.mjs docs/art` (needs inkscape; the SVGs are not
committed; the drawing is shared in `scripts/assets/3076-study-lib.mjs`). The PNGs are a guide, not
coordinates. The layout is new: today's map (3200×2200, flat) is thrown away, the place (a hero's
hall: a dais on a plinth, galleries, a crypt under the floor) is kept. **One layout serves
`hall-of-heroes-capture`, `-king` and `-relic`**; only the objective set differs (below).

## Rules the study holds

- **Bounds** 4900×4400 = 21.6 M u² (4× Canyon; long side 4900 > 4800, short side 4400 ≥ 1800, above
  the 12.6 M u² 8v8 bound). The ground outline (a 28-gon, radius 2150) fills 67 % (≥ 60 %), `rock`
  outside.
- **Biome: `hall`** (visual-style §1: ground `#26303f`, decks `#6b7a90` / `#8896ab`, stone, no
  plants). No new row.
- **Layers (3):** L0 the round floor and the crypt; L1 the octagonal plinth and three galleries
  (70 up); L2 the dais (140). 13 stairs.
- **Structures (8 + 4 tunnel segments):** plinth, dais, north gallery with its neck, south-west
  and south-east galleries with their necks. Near Moss Vale's count.
- **Tunnels (the crypt):** three doors on L0 at (1350,2200), (3000,1247), (3000,3153), 110 wide,
  all running to a crypt chamber under the plinth; one stair (2630,2720) comes up on the plinth's
  south face. Cover shows the seam and grating slots (#3236), as wide as the walkable floor (#3179).
- **Drop-offs (3):** each gallery's inner edge onto the floor, (1930,1000), (1090,2450), (3810,2450).
- **Elements:** three brass **levers**, one on each gallery ((2100,1090), (1320,2400), (3580,2400)),
  each **opens all three crypt doors**; any team opens them and they stay open. No lift is used, so
  bots are not affected. Three **breakable barricades** ((980,2400), (3896,2400), (3150,3000)) each
  close a short-cut from a spawn side into a gallery stair. Zones: `spring` ×3 and `mire` ×3,
  placed in the hall's rim, off every route and ≥ 200 u from a spawn. Three shallow **reflecting
  pools** (walkable, clear water). Atmosphere (existing, #3032): three dust-in-the-light patches,
  under bodies, never over a point, stair or lever. One `canopy` overhang (a hanging banner) off
  every route. Six pillars on the ring at radius 1500 (props, off every route).
- **Light:** the **Day** row (visual-style §2), 50°, `#fff1d6` 0.55: sun falls through an oculus.
  A ring (130–220) on each point and relic spawn, shrines and levers, torches `#ffb060` (150) at the
  three crypt doors and the plinth stairs. 17 lights, over Warden's Gallery's 15: the build card
  merges the rings of neighbours if the renderer's cap bites. Nothing is dim except the crypt, which
  has its door torches.
- **Reduced motion:** torch flicker steady, dust holds still, spring drift stops; the crypt doors
  move once on a lever.
- **8v8 tick budget:** 3 layers, 8 structures.

## Three teams

Team 1 spawns north-west (1134,1310), team 2 north-east (3766,1310), team 3 south (2390,3635),
three corners of a triangle around the plinth; each has a resurrection shrine behind its seats
(908,1310), (3992,1310), (2450,4130) and a ghost-spawn beside it. No team's spawn lies on the line
between the other two (team 3 is 2300 u off the line T1–T2). T1 and T2 are x-mirrors; T3's
approaches are its own.

## Objectives on the shared layout (counts as today)

| File       | Objectives                             | Where                                                                                                                                                                         |
| ---------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-capture` | capture-point 4, resurrection-shrine 3 | **P1** the dais (2450,2200, L2); **P2** north gallery (2450,1000, L1); **P3** south-west gallery (1500,2450, L1); **P4** south-east gallery (3400,2450, L1); shrines as above |
| `-king`    | altar 1, ghost-spawn 3                 | altar on the dais (2450,2200, L2); ghost-spawns (1100,1060), (3800,1060), (2000,4010)                                                                                         |
| `-relic`   | altar 1, relic-spawn 3                 | altar on the dais; relic spawns R1 (1700,1780), R2 (3200,1780), R3 (2450,3470), one per team, on the floor in front of each spawn                                             |

## Routes and balance (base speed 180 u/s)

Spawn to the dais (T1 / T2 / T3), the altar at (2450,2200); four routes each:

| Route              | Walk                 | Gap |
| ------------------ | -------------------- | --- |
| plinth stair       | 10.2 / 10.2 / 9.4 s  | 8 % |
| north gallery      | 16.3 / 16.3 / 16.7 s | 2 % |
| south-west gallery | 15.1 / 15.1 / 16.7 s | 9 % |
| crypt              | 16.7 / 16.7 / 17.3 s | 3 % |

Relic carry, relic spawn to altar (T1 / T2 / T3): plinth stair 8.2 / 8.2 / 7.6 s (7 %), north gallery
16.6 / 16.6 / 15.5 s (6 %), crypt 15.6 / 15.6 / 16.1 s (3 %). Every route is within 10 %, and none runs through
another team's spawn. Spawn to the dais is under 17.4 s (< 25 s).

**Capture points** (straight line ×1.15, T1 / T2 / T3): P2 8.6 / 8.6 / 16.8 s; P3 7.6 / 16.2 / 9.5 s;
P4 16.2 / 7.6 / 9.9 s. Each point is close to two teams and far from one, in a cycle: T1 holds P2 and P3
near, T2 P2 and P4, T3 P3 and P4 (7.6–9.9 s). The gap per point cannot be 10 % in a three-way map with
three side points; the cycle is the closest the shape gets (see Questions).

**High ground:** the dais overlooks the altar, plinth and all three galleries, for all teams. The
galleries overlook the floor in front of the three spawns: north gallery (300 k u²) T1 and T2 equally,
south-west (213) T1 and T3, south-east T2 and T3. Per team the reachable high ground is
north + one south gallery for T1/T2 and two south galleries for T3 (213 + 213): T3 has 29 % less
than T1/T2 in L1 area and in return the shortest plinth stair (9.4 s). See Questions.
**Worst case:** the crypt shut, or all barricades up, leave the plinth stair and two gallery routes
for every spawn and objective (≥ 2).

## Canyon lessons, on the plan

- Every deck is reachable up and down by click-to-move (#3177): the plinth has four stairs, the dais
  two, each gallery two.
- No body is hidden without an outline (#3178/#3251): stairs are open steps, nothing stands north or
  south of one; the banner is thin and fades.
- The crypt cover is the walkable floor and nothing wider (#3179); the galleries over the floor
  fade with the cutaway (#3272).

## New art needed / not built

Nothing new: plinth, dais and galleries are stacked `decks` in the hall stone, the pools the existing
shallow water, the crypt doors the existing gate look. Mechanics are not designed here.

## Questions

- Three side points cannot be equidistant for three teams. Alternative: P2 moves to a south platform
  and T3 gets a near/far pairing like the others. A gameplay decision, not made here.
- T3's high-ground area is 29 % under T1/T2's (the card asks ≤ 25 %): a fourth balcony on the
  south would fix it at the cost of a structure.
- Barricades are breakable walls; levers open crypt doors as the card allows, instead of today's plates.
