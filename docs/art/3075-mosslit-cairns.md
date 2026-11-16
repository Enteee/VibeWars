# Mosslit Cairns study (#3430, part of #3075)

Study: `3075-mosslit-cairns-plan.png` (outline, layers, routes, capture points, shrines, world
elements, 5400×3000), `-layer-0/1/2.png` (one layer's footprints each), `-spawn-team1.png` /
`-spawn-team2.png` (the default camera, 1100 tall, 16:9, with the team of eight). Regenerate with
`node scripts/assets/3075-mosslit-cairns-study.mjs docs/art` (needs inkscape; the SVGs are not
committed; the drawing is shared in `scripts/assets/3075-study-lib.mjs`). The PNGs are a guide, not
coordinates. The layout is new: today's map (3200×1800, flat) is thrown away, the place (glowing
moss on cairn hills: each point on a hilltop, the glow as light sources) is kept.

## Rules the study holds

- **Bounds** 5400×3000 = 16.2 M u² (3.2× Canyon, long side 5400 > 4800, short side 3000 ≥ 1800,
  above the 12.6 M u² 8v8 bound). The ground outline fills 72 % of it (≥ 60 %), with `rock`
  (`OUTSIDE_KINDS`) outside.
- **Biome: `wilds`** (visual-style §1: ground `#2a3328`, rock `#5b5f58`, moss `#4f5e3c`, earth
  `#5a4630`). No new row. The glow is light only: violet `#a98cff` (cold is magic), radius 220,
  flicker 0; no surface tone is near a signal hue.
- **Layers (3):** L0 the lanes and the root tunnel; L1 the five cairn hills and two moss banks
  (70 up); L2 the great cairn's top (140). 23 stairs.
- **Structures (8 + 1 tunnel):** five hills, the cairn top, two banks. Below Moss Vale's count.
- **Capture points (5, as today, placed anew):** one on each hilltop, all on the centre line
  x = 2700, so every point is the same walk from both spawns: north cairn (2700,440), moss cairn N
  (2700,960), great cairn (2700,1500, on the L2 top), moss cairn S (2700,2060), south cairn
  (2700,2560). Each is on a deck with a west and an east stair and one or two lane stairs, so ≥ 2
  routes reach it for either team, none through the other's spawn. None is in a tunnel, zone or
  water. Resurrection shrines 1 (700,1000) and 2 (4700,1000), each inside its team's lit ring.
  The lanes between hills are 190..220 wide.
- **Tunnel:** the **root tunnel** on L0, 110 wide, under the south moss cairn, from the west mouth
  (2000,2150) to the east mouth (3400,2150): a cross-map bypass. Lever-driven (below). Cover shows the
  seam and grating slots (#3236), as wide as the walkable floor (#3179).
- **Drop-offs (4):** the north and south cairns' outer edges, and the great cairn's two sides.
- **Elements:** two **root gates** at the tunnel mouths start shut. Two brass **levers** on the north
  moss cairn, (2480,960) and (2920,960), **each opens both gates**: either team can open the tunnel,
  and a pulled lever opens it for both. No lift is used. A **breakable root wall** (x 1650, y
  1780..1940) closes a short-cut from the spawns to the south lane; the route listed there has the
  wall's gap. Zones: `spring` and `mire`, one each side, off every route and ≥ 200 u from a spawn.
  Water: two shallow **moss pools** (north) and two deep **sink pools** (south), off every route.
  Atmosphere (existing, #3032): three mist banks, under bodies, never over a point, stair or lever.
  One `canopy` overhang (a root arch) off every route.
- **Light:** the **Dusk** row (visual-style §2), sun from the NW, 25°, `#ffb87a` 0.5. A violet glow
  ring (220) on each hilltop, two on the banks, torches `#ffb060` at the gates, rings at the shrines
  and levers. 16 lights, the cap. Nothing is dim except the tunnel, which has its torches.
- **Reduced motion:** the glow holds steady (it does not flutter), torch flicker steady, mist holds
  still, spring drift stops; the gates move once on a lever.
- **8v8 tick budget:** 3 layers, 8 structures.

## Routes and balance (base speed 180 u/s)

T1 centred (540,1495), T2 (4860,1495). The map is mirrored in x (the two teams' halves); the five
hills and lanes differ north to south on purpose (hills 380..520 wide, the great cairn the broadest,
the north pools shallow and the south deep). Mirrored x means the walk gap is 0 %: the gap the
structure gives, not a promise about the final art.

| Spawn to the great cairn (T1 / T2) | Walk          |
| ---------------------------------- | ------------- |
| west stair (up the hill)           | 12.0 / 12.0 s |
| north lane (north stair)           | 13.9 / 13.9 s |
| south lane (south stair)           | 14.0 / 14.0 s |

**Per capture point** (T1 / T2, same, within 0 %; the middle point is 0 % from equidistant):

| Point          | west stair | lane stair |
| -------------- | ---------- | ---------- |
| 1 north cairn  | 15.2 s     | 15.0 s     |
| 2 moss cairn N | 13.2 s     | 13.6 s     |
| 3 great cairn  | 12.0 s     | 13.9 s     |
| 4 moss cairn S | 12.9 s     | 13.7 s     |
| 5 south cairn  | 14.7 s     | 15.0 s     |

**High ground:** the hilltop is the point, so it is its own high ground, equal for both teams; the
great cairn top (L2) overlooks points 2 and 4 from either side by 12.0 s each; the two moss banks
(1500..2000 / 3400..3900, y 1100..1330) overlook the north lane from each team's side. Spawn to
fight stays under 15.3 s (< 25 s).
**Worst case:** the gates shut change no point's routes (the tunnel is a bypass); an unbroken root
wall leaves the west stair and the north lane to every point.

## Canyon lessons, on the plan

- Every deck is reachable up and down by click-to-move (#3177): every hill has a stair on each end
  and on its lane faces.
- No body is hidden without an outline (#3178/#3251): stairs are open steps, nothing stands north
  or south of one; the root arch is thin and fades.
- The tunnel cover is the walkable floor and nothing wider (#3179); the cairn over it fades with
  the cutaway (#3272).

## New art needed / not built

Nothing new: the cairns are stacked `decks` in the wilds stone with a moss mound top, the gates the
existing gate look, the glow is lights. Mechanics are not designed here.

## Questions

- Today's points sit west and east of centre (two nearer each base). The card asks for every point
  within 10 % between teams, so this study puts all five on the centre line. If home points are
  wanted (a nearer one per team), say so and the study moves two.
