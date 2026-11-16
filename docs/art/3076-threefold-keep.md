# The Threefold Keep study (#3431, part of #3076)

Study: `3076-threefold-keep-plan.png` (outline, layers, routes, gates, world elements, 5200×4400),
`-layer-0/1/2.png` (one layer's footprints each), `-spawn-team1/2/3.png` (the default camera, 1100
tall, 16:9, with the team of eight). Regenerate with
`node scripts/assets/3076-threefold-keep-study.mjs docs/art` (needs inkscape; the SVGs are not
committed; the drawing is shared in `scripts/assets/3076-study-lib.mjs`). The PNGs are a guide, not
coordinates. The layout is new: today's map (3200×2200, flat) is thrown away, the place (a keep with
three approaches, four gates, wall-walks, a tower over the hill) is kept.

## Rules the study holds

- **Bounds** 5200×4400 = 22.9 M u² (4.5× Canyon; long side 5200 > 4800, short side 4400 ≥ 1800,
  above the 12.6 M u² bound). The ground outline (a 32-gon, ellipse 2500×2100) fills 72 % (≥ 60 %),
  `rock` outside.
- **Biome: `hall`** (visual-style §1; stone and steel, no plants). No new row.
- **Layers (3):** L0 the ground and the posterns; L1 the courtyard (1200×1200) and three wall-walks
  (70 up); L2 the tower (600×600) with the altar (140). 13 stairs.
- **Structures (5 + 3 tunnels):** courtyard, tower, north wall-walk, south-west and south-east
  wall-walks. Below Moss Vale's count.
- **Tunnels (3 posterns):** one per team on L0, 110 wide. West (1450,2700) to a stair at
  (2450,2740) and east, its mirror, run under the courtyard to the tower's south side; north starts
  at (2350,1450) and comes up inside the courtyard's west side at (2100,2500). Cover shows the seam
  and grating slots (#3236), as wide as the walkable floor (#3179).
- **Gates (4, as today):** N (2600,1800), S (2600,3000), W (2000,2400), E (3200,2400), each in front
  of a courtyard stair. Today's plates are replaced by levers (below).
- **Drop-offs (3):** each wall-walk's inner edge, (2020,1500), (1800,2900), (3400,2900).
- **Elements:** three brass **levers**, one on each wall-walk, each **opens all four gates**; they
  stay open. No lift is used, so bots are not affected. Three **breakable barricades** (1480,2020),
  (3696,2020), (2800,1180) close short-cuts across the moat flats. Zones: `spring` ×2, `mire` ×2,
  off every route, ≥ 200 u from a spawn. Two shallow **moat pools** (walkable, clear water).
  Atmosphere (existing, #3032): three dust-in-the-light patches, never over a point, stair or
  lever. One `canopy` overhang (a hanging banner) off every route.
- **Light:** the **Day** row (visual-style §2), 50°, `#fff1d6` 0.55. Rings on the altar, gates,
  levers and posterns, torches `#ffb060` (150) at the four gates. 14 lights, under 16. Nothing is dim
  except the posterns, which have mouth lights.
- **Reduced motion:** torch flicker steady, dust holds still, spring drift stops; the gates move once
  on a lever.
- **8v8 tick budget:** 3 layers, 5 structures.

## Three teams and the three approaches

Team 1 spawns south-west (1060,3110), team 2 south-east (4140,3110), team 3 north (2680,640). Team 3
is 2400 u off the line T1–T2: no spawn is on the line between the other two. Each team has its own
approach: **wall-walk** (L1, up a stair at its far end, down into the courtyard), **gate** (T1 west,
T2 east, T3 north, stair into the courtyard), **postern** (under the floor). The south gate faces
the T1–T2 flats. Ghost-spawns sit behind each seat block: (860,3100), (4340,3100), (2600,380).

## Routes and balance (base speed 180 u/s)

Spawn to the hill (the altar at (2600,2400)), T1 / T2 / T3:

| Route     | Walk                 | Gap |
| --------- | -------------------- | --- |
| wall-walk | 12.0 / 12.0 / 13.0 s | 8 % |
| own gate  | 10.4 / 10.4 / 9.5 s  | 9 % |
| postern   | 13.6 / 13.6 / 14.9 s | 9 % |

Every route is within 10 %; none runs through another team's spawn; spawn to the hill is under
15 s (< 25 s). The hill is reached by 3 routes per team.

**Gates shut** (the worst case): each team keeps its wall-walk and postern (2 routes), and no team is
shut out while the others are not, since all three are shut together. The levers (on the wall-walks)
open all four at once.

**High ground:** L1 area per team's own wall-walk 200 / 200 / 180 k u² (T3 10 % under, within 25 %);
the courtyard (1440 k u²) and the tower (360 k u²) are shared, the tower overlooking the courtyard,
the gates and all three approaches for every team.

## Canyon lessons, on the plan

- Every deck is reachable up and down by click-to-move (#3177): the courtyard has a stair on every
  face, the tower four, each wall-walk a stair at its outer end.
- No body is hidden without an outline (#3178/#3251): stairs are open steps, nothing stands north or
  south of one; the banner is thin and fades.
- The posterns' cover is the walkable floor and nothing wider (#3179); the wall-walks over the
  floor fade with the cutaway (#3272).

## New art needed / not built

Nothing new: courtyard, tower and wall-walks are stacked `decks` in the hall stone, the moat pools
the existing shallow water, the gates the existing gate look. Mechanics are not designed here.

## Questions

- Today's four gates open by plates; here by three levers (the gate count is kept). If plates are
  wanted, one per team in front of its approach: the layout holds.
- The courtyard is a walled keep in the plan; the wall itself is the courtyard's cliff face, not a
  separate structure.
