# Scarred Earth study (#3430, part of #3075)

Study: `3075-scarred-earth-plan.png` (outline, layers, routes, capture points, shrines, world
elements, 5400×2800), `-layer-0/1/2.png` (one layer's footprints each), `-spawn-team1.png` /
`-spawn-team2.png` (the default camera, 1100 tall, 16:9, with the team of eight). Regenerate with
`node scripts/assets/3075-scarred-earth-study.mjs docs/art` (needs inkscape; the SVGs are not
committed; the drawing is shared in `scripts/assets/3075-study-lib.mjs`). The PNGs are a guide, not
coordinates. The layout is new: today's map (3200×2000, flat) is thrown away, the place (a cratered
battlefield: craters as pits, trenches as tunnels, wrecked siege towers as towers) is kept.

## Rules the study holds

- **Bounds** 5400×2800 = 15.12 M u² (3.0× Canyon, long side 5400 > 4800, short side 2800 ≥ 1800,
  above the 12.6 M u² 8v8 bound). The ground outline fills 73 % of it (≥ 60 %), with `rock`
  (`OUTSIDE_KINDS`) outside.
- **Biome: `volcanic`** (visual-style §1: ground `#2b2421`, rock `#4a4340`, earth `#4a3426`, ash
  scrub `#5a5444`). No new row: the scorched field is the volcanic earth and ash, the craters are
  dark pits with a pale rim. `ash` is not proposed.
- **Layers (3):** L0 the field, ten craters and two trenches; L1 the five tower hulks (70 up); L2
  the great siege tower's deck (140). 22 stairs.
- **Structures (5 + 2 tunnels):** five siege-tower hulks; only the great one has a deck. Below Moss
  Vale's count.
- **Capture points (5, as today, home points):** **P3** the great siege tower (2700,1400, on its L2
  deck) is the centre, on the axis x = 2700, 0 % from equidistant. Two mirrored pairs, one hulk
  nearer each base, on the hulks' bases (L1): north **P1** (1750,640) for team 1 and **P2**
  (3650,640) for team 2; south **P4** (1750,2160) for team 1 and **P5** (3650,2160) for team 2.
  Parity is per pair: team 1's walk to P1 equals team 2's to P2, and so for P4/P5. Each hulk has a
  stair on all four faces (the great deck two), so ≥ 2 routes reach it for either team, none through the
  other's spawn. No point is in a trench, zone or crater. Resurrection shrines 1 (700,1000) and 2
  (4700,1000).
- **Craters (pits, 10):** five a side, 280..340 wide, off every route (the routes run on the open
  lanes, none inside a crater or a trench) and ≥ 200 u from a spawn.
- **Tunnels:** the two **trenches** on L0, 110 wide, west to east at y 1020 (north) and y 1780
  (south), x 1500..3900, each with a gate at both mouths. Lever-driven (below). The inner lanes run
  120 u from a trench centre line (y 900 and y 1900), the outer lanes on the field edge (y 330, 2470);
  a route only crosses a trench at right angles. Cover shows the seam and grating slots (#3236), as
  wide as the walkable floor (#3179).
- **Drop-offs (4):** the great hulk's north and south edges, the NW hulk's west edge and the NE
  hulk's east edge (x-mirrored).
- **Elements:** four **trench gates** start shut. Two brass **levers** on the hulk bases, (1550,640)
  **opens both north gates** and (3850,2160) **both south gates**: either team can open a trench, and
  a pulled lever opens it for both. No lift is used. Two **breakable wrecked palisades**, a mirrored
  pair (x 950..974 and x 4426..4450, y 880..1030), each close a short-cut between the two lanes
  beside the shrine, 100 u or more off every route. Zones: a `mire` and a `spring` for each team,
  the same on both sides (mire (1320,1620), spring (1000,1620) west, mirrored east), off every route
  and ≥ 200 u from a spawn and a shrine. Atmosphere (existing, #3032): three smoke banks, under
  bodies, never over a point, a stair or a lever. One `canopy` overhang (a toppled beam) off every
  route.
- **Light:** the **Dusk** row (visual-style §2), sun from the NW, 25°, `#ffb87a` 0.5. A ring (220) at
  each point, torches `#ffb060` (150) at the four trench mouths, rings at the shrines and levers.
  13 lights, under 16. Nothing is dim except the trenches, which have their mouth torches.
- **Reduced motion:** torch flicker steady, smoke holds still, spring drift stops; the gates move
  once on a lever.
- **8v8 tick budget:** 3 layers, 5 structures.

## Routes and balance (base speed 180 u/s)

T1 centred (540,1405), T2 (4860,1405). The map is mirrored in x (the two halves); north and south
differ (craters, the south hulks 50 u wider, the great hulk widest). A mirror makes the walk gap 0 %:
the gap the structure gives, not a promise about the final art.

| Spawn to the great siege tower (T1 / T2) | Walk          |
| ---------------------------------------- | ------------- |
| west approach (up the hulk)              | 12.0 / 12.0 s |
| south lane (west hull stair)             | 15.4 / 15.4 s |
| north lane (west hull stair)             | 15.3 / 15.3 s |

**Per capture point** (T1 to its own hulk = T2 to its own, the pair's mirror, gap 0 %):

| Point                 | outer lane             | inner lane |
| --------------------- | ---------------------- | ---------- |
| 1 / 2 own hulk, north | 13.3 s                 | 9.0 s      |
| 4 / 5 own hulk, south | 13.2 s                 | 9.0 s      |
| 2 / 1 far hulk, north | 23.8 s                 | 19.6 s     |
| 5 / 4 far hulk, south | 23.8 s                 | 19.5 s     |
| 3 great hulk (centre) | 12.0 s (west approach) | 15.4 s     |

A far hulk is a 19.5..23.8 s walk, under 25 s. **4v4 plays the whole map from 8v8's camps** (architect
decision): no second spawn set; the fight with the centre is 12 s from a spawn.

**High ground:** each hulk's base (L1) overlooks its point and the lanes beside it; the great
hulk's deck overlooks both inner lanes. Both teams reach each hulk in the same time (mirrored).
**Worst case:** the trenches shut change no point's routes (no route runs in a trench); unbroken
palisades leave every route open.

## Canyon lessons, on the plan

- Every deck is reachable up and down by click-to-move (#3177): every hulk has a stair on each face
  and the great deck two.
- No body is hidden without an outline (#3178/#3251): stairs are open steps, nothing stands north
  or south of one; the beam is thin and fades.
- The trench cover is the walkable floor and nothing wider (#3179); the hulks over it fade with the
  cutaway (#3272).

## New art needed / not built

Nothing new: the hulks and the great deck are stacked `decks` in the volcanic stone with a mound top, the craters the
existing pits, the gates the existing gate look. Mechanics are not designed here.

## Questions

- Architect decisions applied: home points (one centre, two mirrored pairs), 4v4 on the whole map.
