# Cinder Sanctum study (#3430, part of #3075)

Study: `3075-cinder-sanctum-plan.png` (outline, layers, routes, relic spawns, shrines, ghost-spawns,
world elements, 5600×2800), `-layer-0/1/2/3.png` (one layer's footprints each),
`-spawn-team1.png` / `-spawn-team2.png` (the default camera, 1100 tall, 16:9, with the team of
eight). Regenerate with `node scripts/assets/3075-cinder-sanctum-study.mjs docs/art` (needs
inkscape; the SVGs are not committed; the drawing is shared in `scripts/assets/3075-study-lib.mjs`).
The PNGs are a guide, not coordinates. The layout is new: today's map (3200×1800, flat) is thrown
away, the place (a temple on a volcano flank: lava, a lift, a sanctum with a hidden passage) is kept.

## Rules the study holds

- **Bounds** 5600×2800 = 15.68 M u² (3.1× Canyon, long side 5600 > 4800, short side 2800 ≥ 1800,
  above the 12.6 M u² 8v8 bound). The ground outline fills 74 % of it (≥ 60 %), with `rock`
  (`OUTSIDE_KINDS`) outside.
- **Biome: `volcanic`** (visual-style §1: ground `#2b2421`, rock `#4a4340`, earth `#4a3426`, ash
  scrub `#5a5444`). No new row. Lava is the existing `molten` zone look (crust, bright rim, warm
  light); its tones stay clear of the signal hues because the rim is amber-yellow.
- **Layers (4, the cap):** L0 the flank, the lava rivers and the hidden passage; L1 the six bridges,
  the forecourt and the two daises (70 up); L2 the nave (140); L3 the inner sanctum (210).
  Twenty-two stairs.
- **Structures (11 + 1 tunnel):** six bridges, forecourt, nave, inner sanctum, north and south dais.
  Close to Moss Vale's count; the bridges are small.
- **Lava:** two rivers of `molten` zones run north to south at x 1500..1800 and x 3824..4124, one
  between each base and the sanctum. Each is crossed by three bridges (y 900, 1400, 1900), so every
  crossing is a deck over lava; the middle one, the **causeway**, runs straight into the forecourt.
  Nothing else crosses a river.
- **Tunnel:** the **hidden passage** on L0, 110 wide, straight under the sanctum from the north
  mouth (2812,860) to the south mouth (2812,1940), so it joins the two relic spawns. Lever-driven
  (below). Cover shows the seam and grating slots (#3236), as wide as the walkable floor (#3179).
- **Lifts:** two **timer lifts** on the forecourt's west and east sides, (2060,1600) and
  (3444,1600), each beside a stair (fore-sw, fore-se), so a lift is never a route's only way. No
  lever lift is used (bots read a lever lift as closed).
- **Drop-offs (4):** both daises' back edges, the forecourt's south-east and north-west corners.
- **Objectives (as today, placed anew):** the **relic runs on `own-ghost` with `foe` carry** (a team
  carries the foe's relic to its own ghost-spawn). To make every walk equal, **relic-spawn 1**
  (2812,720) and **relic-spawn 2** (2812,2080) stand mid-field on the centre line, one at the north
  dais and one at the south, each in a lit ring (220), clear of tunnel, zone, water and deck. Shrines and
  ghost-spawns by the bases: ghost-spawn 1 (700,860) and shrine 1 (700,1940) for team 1; ghost-spawn
  2 (4924,1940) and shrine 2 (4924,860) for team 2; spawn blocks T1 (480..600, 1260..1590) and T2
  (5024..5144, 1260..1590).
  **Changing where a relic starts is a gameplay question**, see Questions.
- **Elements:** two **passage doors** at the mouths start shut. Two brass **levers** on the forecourt,
  (2300,1250) and (3324,1550), **each opens both doors**: whoever pulls first shares the passage.
  A **breakable ash wall** (x 2380..2580, y 2000) closes a lane south of the forecourt. Zones:
  `molten` (the rivers) and a `spring` and a `mire` for each team, the same on both sides (turned 180°): west
  (900,2350) and (900,480), east (4724,450) and (4724,2320); off every route and ≥ 200 u from a spawn. Atmosphere (existing, #3032): three ash drifts, under bodies, never
  over a relic, stair or lever. One `canopy` overhang (a fallen lintel) off every route.
- **Light:** the **Dusk** row (visual-style §2), sun from the NW, 25°, `#ffb87a` 0.5. Lava glows
  `#ff9040` (radius 220..260 on the rivers), torches `#ffb060` at the passage mouths, rings (220)
  at the sanctum and each relic spawn. 15 lights, under 16. Nothing is dim except the passage.
- **Reduced motion:** torch and lava flicker steady, ash holds still; the lifts and doors move on
  their own cause only.

## Routes and balance (base speed 180 u/s)

T1 centred (540,1425), T2 (5084,1425). Centre: the sanctum, (2812,1400). The layout is four-fold
symmetric in its structure (bridges, forecourt, daises, rivers); props differ; the zones are the same for both teams. A mirror makes the walk gap 0 %: it is the gap the structure gives, not a promise about
final art.

| Spawn to the sanctum (T1 / T2) | Walk          |
| ------------------------------ | ------------- |
| causeway                       | 12.6 / 12.6 s |
| south bridge                   | 15.2 / 15.2 s |
| north bridge                   | 15.4 / 15.4 s |

**Spawn to each relic** (relic 1, north; relic 2 is the mirror in y):

| Route (T1 / T2)        | Walk          | Gap |
| ---------------------- | ------------- | --- |
| north bridge           | 13.6 / 13.6 s | 0 % |
| forecourt, north stair | 14.6 / 14.6 s | 0 % |
| passage (doors open)   | 20.2 / 20.2 s | 0 % |

**Carrier walks** (relic spawn to the thief's ghost-spawn; team 1 carries relic 2, team 2 relic 1):

| Route                | T1 / T2       | Gap |
| -------------------- | ------------- | --- |
| causeway             | 15.2 / 15.2 s | 0 % |
| south bridge         | 15.4 / 15.4 s | 0 % |
| north bridge         | 16.8 / 16.8 s | 0 % |
| passage (doors open) | 18.5 / 18.5 s | 0 % |

A carrier has four routes, none a lift. **High ground** over relic 1 is the north dais (13.6 / 13.6 s
from spawn) and the forecourt's north rim (12.9 / 12.9 s); relic 2 has the south dais and south rim.
Spawn to fight stays under 15.5 s (< 25 s).
**Worst case:** both doors shut leave every spawn and every relic two routes (north bridge and
forecourt), and every carry three. Lifts are never counted.

## Canyon lessons, on the plan

- Every deck is reachable up and down by click-to-move (#3177): bridges have a stair at each bank,
  the forecourt two on each face, the nave and the sanctum one per face.
- No body is hidden without an outline (#3178/#3251): stairs are open steps, nothing stands north
  or south of one; the lintel is thin and fades.
- The passage cover is the walkable floor and nothing wider (#3179); the sanctum over it fades with
  the cutaway (#3272).

## New art needed / not built

Nothing new: the temple is stacked `decks` in the volcanic stone, the bridges the wood deck look,
the doors the existing gate look, lava the `molten` zone. Mechanics are not designed here.

## Questions

- Today each relic starts in its own team's base. The study puts both relics mid-field, on the
  centre line, because the card asks for equal spawn walks to every objective. If relics should stay
  at home (defender walk shorter than thief's), say so and the study moves them.
