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
  (70 up); L2 the great cairn's top (140). 22 stairs.
- **Structures (8 + 1 tunnel):** five hills, the cairn top, two banks. Below Moss Vale's count.
- **Capture points (5, as today, home points):** the **great cairn** P3 (2700,1500, on the L2 top) is
  the centre, on the axis x = 2700, 0 % from equidistant. Two mirrored pairs, one hill nearer each
  base: north **P1** (1600,760) for team 1 and **P2** (3800,760) for team 2; south **P4**
  (1600,2240) for team 1 and **P5** (3800,2240) for team 2. Parity is per pair: team 1's walk to
  P1 equals team 2's to P2, and so for P4/P5. Each is on a deck with a west and an east stair and a
  lane stair, so ≥ 2 routes reach it for either team, none through the other's spawn. None is in a
  tunnel, zone or water. Resurrection shrines 1 (700,2300) and 2 (4700,2300), each in its team's lit
  ring. The lanes between hills are 190..220 wide.
- **Tunnel:** the **root tunnel** on L0, 110 wide, between the two south hills, from the west mouth
  (2250,2150) to the east mouth (3150,2150): a cross-map bypass. Lever-driven (below). Cover shows the
  seam and grating slots (#3236), as wide as the walkable floor (#3179).
- **Drop-offs (4):** the north-west and north-east hills' outer edges, and the great cairn's two sides.
- **Elements:** two **root gates** at the tunnel mouths start shut. Two brass **levers** on the two
  north hills, (1480,720) and (3920,720), **each opens both gates**: either team can open the tunnel,
  and a pulled lever opens it for both. No lift is used. Two **breakable root walls**, a mirrored pair (x 1650 and x 3726, y 1760..1900), each close a
  short-cut from a spawn to the south lane, 100 u off every route. Zones: a `spring` and a `mire`
  for each team, the same on both sides (spring (700,2650), mire (600,1950) west, mirrored east), off every route and ≥ 200 u from a spawn.
  Water: one shallow **moss pool** (north) and one deep **sink pool** (south), on the axis, off every route.
  Atmosphere (existing, #3032): three mist banks, under bodies, never over a point, stair or lever.
  One `canopy` overhang (a root arch) off every route.
- **Light:** the **Dusk** row (visual-style §2), sun from the NW, 25°, `#ffb87a` 0.5. A violet glow
  ring (220) on each hilltop, torches `#ffb060` at the gates, rings at the shrines
  and levers. 13 lights, under 16. Nothing is dim except the tunnel, which has its torches.
- **Reduced motion:** the glow holds steady (it does not flutter), torch flicker steady, mist holds
  still, spring drift stops; the gates move once on a lever.
- **8v8 tick budget:** 3 layers, 8 structures.

## Routes and balance (base speed 180 u/s)

T1 centred (540,1495), T2 (4860,1495). The map is mirrored in x (the two teams' halves); north and
south differ on purpose (north hills 400 wide, south 440, the great cairn broadest, the north pool
shallow and the south deep). Mirrored x means the walk gap is 0 %: the gap the
structure gives, not a promise about the final art.

| Spawn to the great cairn (T1 / T2) | Walk          |
| ---------------------------------- | ------------- |
| west stair (up the hill)           | 12.0 / 12.0 s |
| north lane (north stair)           | 15.6 / 15.6 s |
| south lane (south stair)           | 15.6 / 15.6 s |

**Per capture point** (T1 to its own hill = T2 to its own, the pair's mirror, gap 0 %; the centre is 0 %
from equidistant):

| Point                  | route A    | route B     |
| ---------------------- | ---------- | ----------- |
| 1 / 2 home hill, north | 8.2 s west | 8.0 s lane  |
| 4 / 5 home hill, south | 7.7 s west | 8.1 s lane  |
| 2 / 1 far hill, north  | 21.5 s rim | 20.3 s lane |
| 5 / 4 far hill, south  | 22.6 s rim | 20.3 s lane |
| 3 great cairn          | 12.0 s     | 15.6 s      |

**High ground:** the hilltop is the point, so it is its own high ground, equal for both teams; the
great cairn top (L2) overlooks the lanes between the pairs, 12.0 s from either spawn; the two moss
banks (1500..2000 / 3400..3900, y 1100..1330) overlook the north lane from each team's side. A far
hill is a 20..23 s walk, the fight with the centre is 12 s (< 25 s).
**Worst case:** the gates shut change no point's routes (the tunnel is a bypass); unbroken root
walls leave the west stair and the north lane to every point.

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

- Architect decision: home points, one centre and two mirrored pairs. The far hills are 20..23 s from
  a spawn, under the 25 s bound.
