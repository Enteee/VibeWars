# Brazen Causeway study (#3426, part of #3074)

Study: `3074-brazen-causeway-plan.png` (outline, layers, routes, shrines, world elements, 5600×2800),
`-layer-0/1/2.png` (one layer's footprints each), `-spawn-team1.png` / `-spawn-team2.png`
(the default camera, 1100 tall, 16:9, with the team of eight). Regenerate with
`node scripts/assets/3074-brazen-causeway-study.mjs docs/art` (needs inkscape; the SVGs are not
committed; the drawing is shared in `scripts/assets/3074-study-lib.mjs`). The PNGs are a guide, not
coordinates. The layout is new: today's map (2000×1600) is thrown away, the place (a raised
bronze-age causeway over marsh, its two gates, wall-walks along it, the marsh below as a second
route, longer by walk) is kept.

## Rules the study holds

- **Bounds** 5600×2800 = 15.68 M u² (3.1× Canyon, 8v8, long side 5600 > 4800, short side 2800 ≥ 1800).
  The ground outline fills 75 % of it, with `rock` (`OUTSIDE_KINDS`) outside. The causeway runs
  west to east through the middle (x 1400..4200); T1 holds the south-west, T2 the north-east.
  The walk from a spawn to the centre is 14 s on the causeway, under the 25 s cap.
- **Biome: `marsh`**, the row proposed by the Blackwater Ford study (ground `#2a3430`, rock `#54594f`,
  reed `#5c5a3a`, silt `#4a4034`; its first build PR adds it, the second map reuses it). No other new
  row: this study proposes one biome across the four maps so far.
- **Layers (3):** L0 the marsh and two culverts; L1 the causeway (a 2800×480 deck, 70 up) and two
  jetties; L2 two gatehouses with their wall-walk (140 up). Ten stairs.
- **Structures (5 + 2 tunnels):** causeway, west and east jetty, west and east gatehouse. 3 layers,
  5 structures, under Moss Vale's budget for 16 bodies.
- **Tunnels:** two **culverts** on L0, 110 wide, north to south straight under the causeway: west
  (2400,1040) to (2400,1760), east (3200,1000) to (3200,1800). They let a flanker cross under the
  deck without climbing. Cover shows the seam and grating slots (#3236), as wide as the walkable
  floor (#3179).
- **Drop-offs (6):** the causeway's north and south edges (two places each side); each gatehouse also
  drops to the causeway.
- **Priest objectives, per team.** Shrine 1 (800,1100) with ghost-spawn (600,900) for team 1, shrine 2
  (4824,1684) with ghost-spawn (5024,1884) for team 2; spawn blocks T1 (440..560, 1600..1930) and T2
  (5064..5184, 854..1184), eight seats a side. Each shrine stands on open marsh bank inside its team's
  lit ring (220), outside any tunnel, zone, water or deck. Other objectives, placed anew: the
  **storm-beacon** at the centre of the causeway (2800,1400), a **flag-spawn** near each team,
  (1100,1800) and (4524,984).
- **Elements:** two **bronze gates** across the causeway, west (1900,1400) and east (3724,1384),
  start shut. Two **levers**, one on each gatehouse's wall-walk (L2), work the far gate: the west
  lever (2150,1230) opens the east gate, the east lever (3480,1570) the west one. No lift is used
  (bots read a lever lift as closed). Two **breakable rotten palisades**, (x 1700, y 2150..2350) and its
  mirror (x 3900, y 434..634), each close a short lane between the marsh and a reed pool, ≥ 100 u off every route. Zones: four `mire` patches on the two marsh routes
  ((2200,880), (3500,900), (2200,1960), (3500,1920)), which drain Energy (they do not slow); each is
  ≥ 200 u from a spawn. Water: two **deep** black pools (north and south) and two shallow reed
  pools, no route crosses them. Atmosphere (existing, #3032): three mist banks, under bodies,
  never over a shrine, a stair or a lever.
- **Light:** the **Dusk** row (visual-style §2), sun from the NW, 25°, `#ffb87a` 0.5. Torches
  `#ffb060`, radius 150, at each gate, culvert mouth and end stair; rings (220) at each shrine and
  the causeway centre; 13 lights, under 16. The bronze gates catch the low sun. Nothing is dim but
  the culverts, which carry their mouth torches.
- **Reduced motion:** torch flicker steady, mist holds still; the gates move once on a lever.

## Routes and balance (base speed 180 u/s)

T1 centred (500,1765), T2 (5124,1019). Centre: the causeway middle, (2800,1400).

| Route to the centre (T1 / T2)                | Length        | Walk          |
| -------------------------------------------- | ------------- | ------------- |
| causeway (end stair, through the gate)       | 2526 / 2550 u | 14.0 / 14.2 s |
| north marsh (through the mire, centre stair) | 2925 / 2910 u | 16.3 / 16.2 s |
| south marsh (through the mire, centre stair) | 2902 / 2905 u | 16.1 / 16.1 s |

The marsh walks are lengths at base speed. Mire drains Energy and slows nothing in today's engine,
so the marsh is the longer route, not a slower one.

**Shrines.** A foe reaches a shrine three ways, equal on both sides (a foe's walk, from spawn centre):

| Route to shrine 1 (T2) / shrine 2 (T1)      | Length        | Walk          |
| ------------------------------------------- | ------------- | ------------- |
| north marsh                                 | 4376 / 4376 u | 24.3 / 24.3 s |
| causeway (both gates, stair at the far end) | 4902 / 4902 u | 27.2 / 27.2 s |
| south marsh                                 | 5092 / 5092 u | 28.3 / 28.3 s |

The shrine to the centre is 2153 / 2177 u, 12.0 / 12.1 s, within 1 %. All walks are within 2 % T1 / T2.
The shrine walks are long (the map is large and the shrines sit behind the spawns); the 25 s cap
is for spawn to centre.
**Worst case:** both gates shut take the causeway away from a foe going to a shrine, who keeps two
routes (north and south marsh), and every spawn keeps two to the centre (north and south marsh).
A lever lift is not used anywhere.

The sides differ on purpose: the two gatehouses stand on opposite sides of the lane (west north,
east south), the culverts are at different x, the jetties differ in size and the reed pools in shape.
High ground within half the map of either spawn is a jetty or the causeway; the L2 gatehouses are
reached by one stair each, at the centre side, so the middle is contested, not owned.

## Canyon lessons, on the plan

- Every deck is reachable up and down by click-to-move (#3177): the causeway has stairs at both
  ends and the middle on both sides plus drops; each gatehouse has a stair and a drop.
- No body is hidden without an outline (#3178/#3251): stairs are open steps, nothing stands north or
  south of one; the lean-to is thin; gatehouses are open towers, not a roof over the lane.
- The culvert cover is the walkable floor and nothing wider (#3179); the causeway over it fades with
  the cutaway (#3272).

## New art needed

**Slow shallow water (not built).** Shallow water slows nothing in today's engine (no rule reads depth
`shallow`), and `mire` drains Energy rather than slowing. The reed pools and mire patches are walked at base
speed, as every table here assumes. A slow-water mechanic is the architect's to decide; no route
here counts on it.

The `marsh` biome row (see Blackwater Ford). The gates are bronze, the existing gate look, the
causeway `decks` in the marsh stone. Mechanics are not designed here.
