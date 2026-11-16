# Broken Tower study (#3430, part of #3075)

Study: `3075-broken-tower-plan.png` (outline, layers, routes, relic spawns, altar, world elements,
5400×2800), `-layer-0/1/2/3.png` (one layer's footprints each), `-spawn-team1.png` /
`-spawn-team2.png` (the default camera, 1100 tall, 16:9, with the team of eight). Regenerate with
`node scripts/assets/3075-broken-tower-study.mjs docs/art` (needs inkscape; the SVGs are not
committed; the drawing is shared in `scripts/assets/3075-study-lib.mjs`). The PNGs are a guide, not
coordinates. The layout is new: today's map (3200×1800, flat) is thrown away, the place (a fallen
tower on a hill: its stump a climbable ruin, rubble terraces, a cellar route) is kept.

## Rules the study holds

- **Bounds** 5400×2800 = 15.12 M u² (3.0× Canyon, long side 5400 > 4800, short side 2800 ≥ 1800,
  above the 12.6 M u² bound for 8v8). The ground outline fills 70 % of it (≥ 60 %), with `rock`
  (`OUTSIDE_KINDS`) outside.
- **Biome: `heights`** (visual-style §1: ground `#26303f`, rock `#4b5a70`, decks `#a0b2c7`). No new
  row; the rubble is the rock with the earth speck. Signal colours stay on bodies, rings and rails.
- **Layers (4, the cap):** L0 the hill foot and the cellar tunnel; L1 the rubble terraces (70 up),
  the central hill terrace and six outer terraces; L2 the tower base (140); L3 the stump top
  (210), where the **altar** stands. Thirteen stairs.
- **Structures (9 + 1 tunnel):** the hill terrace, tower base, stump top, and two terraces and a
  ledge on each side (west rubble terrace and its east pair, north spill and south spill, south
  ledge and north ledge). Close to Moss Vale's count.
- **Tunnel:** the **cellar** on L0, 110 wide, from the west mouth (1530,1390) under the hill's south
  side to the east mouth (3824,1366), with a **cellar stair** (2630,1580) up into the hill terrace.
  Both mouths have a door (lever-driven, below). Cover shows the seam and grating slots (#3236), as
  wide as the walkable floor (#3179).
- **Drop-offs (4):** the north spill, west rubble terrace, east terrace and south spill edges; the
  hill's upper decks drop to the one below.
- **Objectives (as today, placed anew):** **relic-spawn 1** (1000,1850) for team 1 and **relic-spawn
  2** (4424,934) for team 2, each on open ground inside its team's lit ring (220), outside any
  tunnel, zone or deck; one **altar** on the stump top (2700,1400), reached by ≥ 2 stair routes
  and the cellar, never a lift. Spawn blocks T1 (480..600, 1260..1590) and T2 (4824..4944,
  1194..1524), eight seats a side.
- **4v4:** uses the same map and the first four seats of each block (the two rows at the front); the
  fight is the hill, inside a 1500-radius ring round the altar. The relic spawns and routes are the 8v8's.
- **Elements:** two **cellar doors** at the tunnel mouths, (1530,1390) and (3824,1366), start shut.
  Two brass **levers** on the hill terrace, (2250,1380) and (3150,1420), **each opens both doors**:
  either team can open the cellar, and a pulled lever opens it for both. No lift is used (bots read
  a lever lift as closed). A **breakable rubble wall** on each side, (x 1930, y 1580..1760) and its turned pair (x 3470, y 1024..1204), closes a lane south of the
  terrace stair, off every route. Zones: a `spring` and a `mire` for each team, the same on both sides (turned 180°):
  spring (1100,700) and mire (1100,2300) west, the pair turned east; off every route, ≥ 300 u from
  a relic spawn and ≥ 200 u from a spawn. Water: two shallow **meltwater pools**, off every route. Atmosphere (existing, #3032):
  three dust banks, under bodies, never over an altar, a stair or a lever. One `canopy` overhang
  (a fallen beam) off every route. Six broken columns stand on the tower base, clear of its stairs.
- **Light:** the **Day** row (visual-style §2), sun from the NW, 50°, `#fff1d6` 0.55. Torches
  `#ffb060`, radius 150, at each cellar mouth and hill stair; rings (220) at each relic spawn and the
  altar. 13 lights, under 16. Nothing is dim except the cellar, which has its mouth torches.
- **Reduced motion:** torch flicker steady, dust holds still, spring drift stops; the cellar doors
  move once on a lever.

## Routes and balance (base speed 180 u/s)

T1 centred (540,1425) in the west, T2 (4884,1359) in the east. Altar: (2700,1400).

| Spawn to the altar (T1 / T2) | Walk          |
| ---------------------------- | ------------- |
| cellar (door open)           | 13.9 / 14.0 s |
| south stair                  | 14.8 / 14.9 s |
| north stair                  | 15.2 / 15.1 s |

**Carrier walks** (relic spawn to altar, from the relic itself):

| Route (team 1 / team 2) | Walk          | Gap |
| ----------------------- | ------------- | --- |
| terrace                 | 12.4 / 12.3 s | 1 % |
| south stair             | 11.6 / 11.7 s | 1 % |
| cellar (door open)      | 12.0 / 12.0 s | 0 % |

A carrier has three routes; none is a lift. Spawn to fight stays under 15.3 s (< 25 s).

**High ground** overlooking the altar is the tower base's rim. Each team reaches it in the same
time (west base lip 12.9 / 12.9 s, north base lip 12.6 / 12.6 s, within 25 % by far); the base's
west and east rims are the two sides' high ground.
**Worst case:** both cellar doors shut leave every spawn and each relic two stair routes to the
altar. The altar, the stump top and every stair are reachable by both teams without passing the other's
spawn.

The sides differ on purpose: the east terrace is 6 % smaller than the west, the beam sits on the south-west only.

## Canyon lessons, on the plan

- Every deck is reachable up and down by click-to-move (#3177): each terrace has stairs and a drop;
  the hill has two stairs on each face.
- No body is hidden without an outline (#3178/#3251): stairs are open steps, nothing stands north
  or south of one; the beam is thin and fades.
- The cellar cover is the walkable floor and nothing wider (#3179); the hill over it fades with
  the cutaway (#3272).

## New art needed / not built

Nothing new: the hill is stacked `decks` in the heights stone, the doors are the existing gate look,
the beam the `canopy` overhang look. Mechanics are not designed here.

## Questions

None.
