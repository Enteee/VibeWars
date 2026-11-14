# Ashen Courtyard study (#3276, part of #3072)

Study: `3072-ashen-courtyard-plan.png` (outline, layers, routes, world elements, 3200×2400),
`-layer-0/1/2/3.png` (one layer's footprints each), `-spawn-team1.png` / `-spawn-team2.png`
(the default camera, 1100 tall, 16:9, with the team of four). Regenerate with
`node scripts/assets/3072-ashen-courtyard-study.mjs docs/art` (needs inkscape; the SVGs are not
committed). The PNGs are a guide, not coordinates. The layout is new: today's map is thrown away,
the place (a burned castle courtyard) is kept.

## Rules the study holds

- **Bounds** 3200×2400 = 7.68 M u² (1.5× Canyon, 4v4). The ground outline fills 78 % of it. It is a
  walled box, chamfered at the corners (the curtain wall is its edge), with one barbican yard
  bulging out south of the gatehouse. Outside the wall is `rock` (`OUTSIDE_KINDS`): scree and boulders, drawn.
- **Biome `hall`, no new row.** Justification: the dressed-stone family already has the right
  tones (ground `#26303f`, rock `#4b5a70`) and burning is zones, light and char, not a palette.
  Char `#1b1a1a`, ash `#4a4a4c` and charred timber `#7a5a3c` are patch looks, not biome tones.
  Fire orange appears only in embers and the forge-like braziers, where it is danger or fire.
- **Layers (4):** L0 the sunken well court and the gatehouse passage's floor; L1 the courtyard ground
  and barbican; L2 the curtain wall-walks (`decks`, 70 up); L3 three corner towers (the NE one half fallen, the SE one gone: ruin, not a box) and the gatehouse
  (`decks`, 140 up).
- **Structures (≥ 4):** five wall-walk strips (the north and south ones are broken, one gap each side
  of the gatehouse); seven stairs up to them; three towers, a half-fallen one and the gatehouse; the pit ramps. The east walk is collapsed south of its stair.
- **Tunnel:** the gatehouse passage, 200 wide, from under the gatehouse south to the barbican
  at (1600,1960)–(1600,2300). Cover shows the seam and grating slots (#3236), exactly as wide as
  the floor (#3179).
- **Pit:** the sunken well court, a 600×400 recess west of the centre (x 1150..1750) with a well (`water`) in it and a
  five-tread ramp down from the west and from the east.
- **Drop-offs (4):** the gaps in the north and south walk strips drop to the court; the broken
  tower ends drop to the walk.
- **Elements:** two brass **levers**, one on each side wall-walk, at (235,1200) and (2965,1300), each work the **portcullis**
  in the gatehouse passage at (1600,2150) (shut = the barbican is sealed, open = a way round the south
  walk). Two **breakable fallen-timber walls**, at x=860 (400 long) and x=2124 (300 long, y 900..1200), across each team's yard
  between its spawn and the pit: the yard has an exit north and south, and breaking the wall opens
  the straight way to the pit (1000 u, 5.6 s). Zone kinds (`ZONE_KINDS`): `scorched` (four char patches, two near the north, two south)
  and `vent` (two, one each side; the smoke over them is atmosphere, not a zone). Two lean-to overhangs of charred rafters on the north
  wall, different widths and places on each side. The pit, the stairs, the walls and the spawns are all off the mirror axis. Embers: warm lights on the two biggest char patches.
- **Light:** the **Day** row (visual-style §2): sun from the NW, 50°, `#fff1d6` 0.55, ambient
  `#b0bcd4` 0.45, with a low smoke haze (pale, ≤ 0.15, under bodies). Torches (`#ffb060`, radius 150)
  at each stair head, each gatehouse end, the well and the lever; embers (`#ff9040`, radius 200,
  flicker 0.35). Nothing is dim: the courtyard is open to the sky, only the passage is dark.
- **Reduced motion:** ember and torch flicker stop (steady glow), smoke drift stops, nothing else moves.

## Routes and balance (base speed 180 u/s)

Spawns: four seats a side in the west and east yard (T1 around (550,1200), T2 around (2350,1130), nearer the pit since the pit sits west of centre).
The centre is the well court, (1450,1250).

| Route                                                                        | Length        | Walk                    |
| ---------------------------------------------------------------------------- | ------------- | ----------------------- |
| round the timber wall to the pit ramp (walls up)                             | 1179 / 1293 u | 6.5 / 7.2 s (T1 / T2)   |
| wall-walk (north stair, along the walk, centre stair down, south to the pit) | 2388 / 2602 u | 13.3 / 14.5 s (T1 / T2) |

The teams are within 9 % of each other on both, the east the longer: the build card must bench it. The wall-walk is the long way on purpose: it is the
high-ground flank, and the lever and the breakable wall decide how soon a team commits to it.
High ground within half the map of either spawn is its own half of the wall-walk plus its two towers,
of unequal area (the west keeps the bigger tower); the two halves meet at the north walk's centre stair, so neither side owns a tower the
other can't reach without crossing the middle. The gatehouse is on the centre line and belongs to
no one.

## Canyon lessons, on the plan

- Every deck is reachable up and down by click-to-move (#3177): every stair is a walk-up and a
  walk-down, and each walk strip also has a drop. The pit ramps do both for the well court.
- No body is hidden without an outline (#3178/#3251): stairs are open steps against the inside of
  the wall, no wall stands south of a stair, and the parapet is a broken crenel line, not a solid cap.
- The passage cover is the walkable floor and nothing wider (#3179). Paving over a tunnel fades
  with the cutaway (#3272).

## New art needed

Nothing beyond the schema's elements. The charred-timber look reuses the breakable-wall look in a
darker tone; the char and vent patches are zone looks. Mechanics are not designed here.
