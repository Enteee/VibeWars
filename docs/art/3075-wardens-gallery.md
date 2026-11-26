# The Warden's Gallery study (#3430, part of #3075)

Study: `3075-wardens-gallery-plan.png` (outline, layers, routes, capture points, shrines, world
elements, 5200×2500), `-layer-0/1/2.png` (one layer's footprints each), `-spawn-team1.png` /
`-spawn-team2.png` (the default camera, 1100 tall, 16:9, with the team of eight). Regenerate with
`node scripts/assets/3075-wardens-gallery-study.mjs docs/art` (needs inkscape; the SVGs are not
committed; the drawing is shared in `scripts/assets/3075-study-lib.mjs`). The PNGs are a guide, not
coordinates. The layout is new: today's map (3200×1400, flat) is thrown away, the place (a long
sculpture gallery with four gates, balconies, plinths as points, skylights) is kept.

## Rules the study holds

- **Bounds** 5200×2500 = 13.0 M u² (2.6× Canyon, long side 5200 > 4800, short side 2500 ≥ 1800,
  above the 12.6 M u² 8v8 bound). The ground outline fills 79 % (≥ 60 %), `rock` outside.
- **It stays a gallery:** it grows on the short side (1400 → 2500) with a **north hall and a south
  hall**, each lined by two balconies, a central **court** on the axis where the great plinth stands, an end **vestibule** per team, and the two undercrofts. The long nave (west to east) is the
  gallery; the court is the "courtyard" the card asks about.
- **Biome: `hall`** (visual-style §1: ground `#26303f`, deck `#4b5a70`, stone and steel, no plants).
  No new row.
- **Layers (3):** L0 the floor and two undercrofts; L1 two plinths, the great plinth and four
  balconies (70 up); L2 the great plinth's top (140). 22 stairs.
- **Structures (8 + 2 tunnels):** two plinths, the great plinth (base and top), four balconies.
  Below Moss Vale's count.
- **Capture points (7, home points: the centre and a mirrored trio per team):** **P4** the centre
  (2600,1250) on the great plinth's top (L2). Team 1's **P1** (1700,500) floor, **P2** (1700,1250) on a
  plinth (L1), **P3** (1700,2000) floor; team 2's **P5** (3500,500), **P6** (3500,1250) plinth, **P7**
  (3500,2000), the x-mirrors of P1..P3, so each pair is the same walk from its own spawn. Each plinth
  has a stair on all four faces (the great plinth's top, two), so ≥ 2 routes reach it for either team,
  none through the other's spawn. No point is in an undercroft, zone or pool. Resurrection shrines 1
  (620,1250) and 2 (4580,1250), in the vestibules.
- **Tunnels (2):** the north and south **undercrofts** on L0, 120 wide, x 1100..4100 at y 800 and
  y 1700, a gate at each mouth. Cover shows the seam and grating slots (#3236), as wide as the
  walkable floor (#3179).
- **Gates (4, as today):** the four undercroft gates. Today's plate openers are replaced by levers
  (below); see Questions.
- **Drop-offs (4):** the north-west balcony's court edge, the north-east balcony's, the great
  plinth's west and east edges.
- **Elements:** two brass **levers** on the great plinth's base, (2330,1120) **opens both north gates**,
  (2870,1380) **both south gates**: either team opens them, and they stay open. No lift is used. Two
  **breakable toppled statue barricades** (x 1000, y 1010..1170 and its x-mirror at x 4176) each
  close a short-cut from a vestibule into the court. Zones: `spring` and `mire`, two each, in the
  four corner alcoves, off every route and ≥ 200 u from a spawn. Four shallow **reflecting pools**
  (walkable, clear water). Atmosphere (existing, #3032): three dust-in-the-light patches, under
  bodies, never over a point, stair or lever. One `canopy` overhang (a hanging banner) off every route.
- **Light:** the **Day** row (visual-style §2), 50°, `#fff1d6` 0.55: sun falls through the skylights.
  A skylight ring (240, `#fff1d6`) on each point, torches `#ffb060` (150) at the four undercroft
  mouths, rings at shrines and levers. 15 lights, under 16. Nothing is dim except the undercrofts,
  which have their mouth torches.
- **Reduced motion:** torch flicker steady, dust holds still, spring drift stops; the gates move once
  on a lever.
- **8v8 tick budget:** 3 layers, 8 structures.

## Routes and balance (base speed 180 u/s)

T1 centred (360,1235), T2 (4840,1235). The map is mirrored in x (the two halves) and almost in y; a
mirror makes the walk gap 0 %: the gap the structure gives, not a promise about the final art.

| Spawn to the great plinth (T1 / T2) | Walk          |
| ----------------------------------- | ------------- |
| nave                                | 12.4 / 12.4 s |
| north hall                          | 15.2 / 15.2 s |
| south hall                          | 15.4 / 15.4 s |

**Per capture point** (own team / other team; the pairs mirror, so P1/P5, P2/P6, P3/P7 are equal for
their owners, and the centre is 0 %):

| Point             | own spawn   | other spawn |
| ----------------- | ----------- | ----------- |
| P1 / P5 (floor)   | 9.5–10.1 s  | 19.2–19.4 s |
| P2 / P6 (plinth)  | 7.4 s       | 21.6–22.5 s |
| P3 / P7 (floor)   | 9.6–10.1 s  | 19.4 s      |
| P4 (great plinth) | 16.5–16.6 s | 16.5–16.6 s |

Spawn to the centre point is under 17 s, to a far point under 23 s (halls run at y 650 and 1850, beside the undercroft gates, not through them) (< 25 s). Only 8v8 exists today (`teamSizes [8]`).

**High ground:** the great plinth's top overlooks P4 and the nave; each plinth its point; the four balconies
overlook P1/P3 and P5/P7 (x 1250..2150 and 3050..3950), the same for each team
(mirrored). **Worst case:** the undercrofts shut change no point's routes (they are a bypass);
unbroken barricades leave the nave and both halls.

## Canyon lessons, on the plan

- Every deck is reachable up and down by click-to-move (#3177): each plinth has a stair on each face,
  the top two, each balcony a stair at both ends.
- No body is hidden without an outline (#3178/#3251): stairs are open steps, nothing stands north
  or south of one; the banner is thin and fades.
- The undercroft cover is the walkable floor and nothing wider (#3179); the balconies over the halls
  fade with the cutaway (#3272).

## New art needed / not built

Nothing new: plinths and balconies are stacked `decks` in the hall stone, the pools the existing
shallow water, the gates the existing gate look. Mechanics are not designed here.

## Questions

- Today's four gates open by plates (`opener: plate`), here by two levers; the card keeps the gate
  count. If plates are wanted (one per team in front of its mouths), the layout holds.
- Home points per the architect: the centre plus mirrored pairs, parity per pair, levers kept.
