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
  the forecourt, the two daises and the two relic knolls (70 up); L2 the nave (140); L3 the inner sanctum (210).
  Twenty-four stairs.
- **Structures (13 + 1 tunnel):** six bridges, forecourt, nave, inner sanctum, north and south dais, two relic knolls.
  Close to Moss Vale's count; the bridges are small.
- **Lava:** two rivers of `molten` zones run north to south at x 1500..1800 and x 3824..4124, one
  between each base and the sanctum. Each is crossed by three bridges (y 900, 1400, 1900), so every
  crossing is a deck over lava; the middle one, the **causeway**, runs straight into the forecourt.
  Nothing else crosses a river.
- **Tunnel:** the **hidden passage** on L0, 110 wide, straight under the sanctum from the north
  mouth (2812,860) to the south mouth (2812,1940), so it is a bypass between the north and south approaches to the forecourt. Lever-driven
  (below). Cover shows the seam and grating slots (#3236), as wide as the walkable floor (#3179).
- **Lifts:** two **timer lifts** on the forecourt's west and east sides, (2380,1810) and
  (3244,1810), a mirrored pair, each beside a stair (fore-sw, fore-se), so a lift is never a route's only way. No
  lever lift is used (bots read a lever lift as closed).
- **Drop-offs (4):** both daises' back edges, the forecourt's south-east and north-west corners.
- **Objectives (as today, relics at home):** the **relic runs on `own-ghost` with `foe` carry** (a
  team carries the foe's relic to its own ghost-spawn). Each relic starts in its own base:
  **relic-spawn 1** (900,1400) for team 1, **relic-spawn 2** (4724,1400) for team 2, each in a lit
  ring (220) between its spawn block and its river, clear of tunnel, zone, water and deck, with a
  **relic knoll** (L1, 70 up) beside it as high ground. Parity is per mirrored pair: team 1's walk to
  its relic equals team 2's to its own, and the two thieves' walks match. Shrines and ghost-spawns by
  the bases: ghost-spawn 1 (700,860) and shrine 1 (700,1940) for team 1; ghost-spawn 2 (4924,1940)
  and shrine 2 (4924,860) for team 2; spawn blocks T1 (480..600, 1260..1590) and T2 (5024..5144,
  1260..1590).
- **Elements:** two **passage doors** at the mouths start shut. Two brass **levers** on the forecourt,
  (2300,1250) and (3324,1550), **each opens both doors**: whoever pulls first shares the passage.
  Two **breakable ash walls**, a mirrored pair (x 2380..2580, y 2000 and x 3044..3244, y 776), each
  close a lane between a dais and a bridge landing; no route runs within 60 u of either. Zones:
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

**Defender, own spawn to own relic** (T1 to relic 1 / T2 to relic 2): 2.0 / 2.0 s direct, 5.0 / 5.0 s
round the knoll. **Thief, spawn to the foe's relic** (T1 to relic 2 / T2 to relic 1):

| Route                    | T1 / T2       | Gap |
| ------------------------ | ------------- | --- |
| causeway (forecourt rim) | 26.5 / 26.5 s | 0 % |
| north bridge             | 26.0 / 25.8 s | 1 % |
| south bridge             | 26.0 / 26.1 s | 1 % |

**Carrier walks** (relic 2 to ghost-spawn 1 for team 1; the point mirror for team 2):

| Route                    | T1 / T2       | Gap |
| ------------------------ | ------------- | --- |
| north bridge             | 24.2 / 24.2 s | 0 % |
| causeway (forecourt rim) | 26.7 / 26.7 s | 0 % |
| south bridge             | 27.9 / 27.9 s | 0 % |

The thief's walk is longer than the defender's by design (relics stay home). Spawn to the fight
(the sanctum, the middle of the thief's way) stays under 15.5 s (< 25 s). A carrier has three routes,
none a lift. **High ground** over relic 1 is its knoll (2.9 / 2.9 s from the own spawn); relic 2 the
same by mirror. **Worst case:** both doors shut leave every spawn, relic and carry its three bridge
routes (the passage is a bypass). Lifts are never counted.

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

- Architect decision: relics stay home, so the thief's walk (about 26 s) is longer than the 25 s
  spawn-to-fight bound, which is read as the walk to the fight, not to the foe's base. Say if not.
