# Moss Vale study (#3276, part of #3072)

Study: `3072-moss-vale-plan.png` (outline, layers, routes, world elements, 5000×2600),
`-layer-0/1/2/3.png` (one layer's footprints each), `-spawn-team1.png` / `-spawn-team2.png`
(the default camera, 1100 tall, 16:9, with the team of eight). Regenerate with
`node scripts/assets/3072-moss-vale-study.mjs docs/art` (needs inkscape; the SVGs are not
committed). The PNGs are a guide, not coordinates. The layout is new: today's map is thrown away,
the place (a green valley with a waterfall, an arch and a ruined mill) is kept.

## Rules the study holds

- **Bounds** 5000×2600 = 13.0 M u² (2.6× Canyon, 8v8, short side 2600 ≥ 1800). The ground outline
  fills 79 % of it. It is a valley: wide in the middle, pinched at the two spawn ends, with a cliff
  cut in the north for the waterfall and a notch in the south where the race leaves. Outside is
  `forest` (`OUTSIDE_KINDS`) round the valley and a `cliff` band across the north, both drawn. Only the spine (pool, race, drawbridge, mill) is on the axis: the east wall is steeper in the north-east and bulges in the south-east, and the two halves differ in every feature below. The `cliff` band is drawn art only (the outline takes one `outside` kind, `forest`).
- **Biome `wilds`, no new row.** Moss ground `#2c4a34`, terrace tops `#6f8a62`, rock `#5a6358`.
  Water (`#2f6b82`) and mist are looks, not biome tones. Signal colours are not used.
- **Layers (4):** L0 the pool, the race bed and the mill under-pass; L1 the valley floor;
  L2 field terraces, south terraces, two natural arches, the drawbridge and the mill floor
  (`decks`, 70 up); L3 the upper terraces and the falls ledges (`decks`, 140 up).
- **Structures (≥ 4):** six terraces (two field, two south, two upper); two natural arches with a
  stair at each end; the drawbridge; the ruined mill floor over the race; 16 stairs.
- **Tunnel:** the mill under-pass, 160 wide, a dry service tunnel from (2200,1880) to (2800,1880),
  crossing beneath the race. Its cover shows the seam and slots (#3236), exactly as wide as the
  floor (#3179). The way under each arch stays open ground, a second under-pass.
- **Water:** the pool under the waterfall and the mill race south of it, 200 wide, from the pool to
  the south edge. It is not walkable, so it divides the valley: the only crossings are the
  drawbridge, the mill floor, and the under-pass.
- **Drop-offs (many):** every terrace edge, both arch decks, the falls ledges and the mill floor
  drop to the ground.
- **Elements:** two brass **levers**, one on each bank, at (2290,1160) and (2710,1160), each work the **drawbridge** at (2500,1300) (raised = the
  race is a wall, lowered = the straight way). Two **breakable walls** (collapsed field walls) at
  x=1700 and x=3274, 360 long, in the south half of each side: breaking one opens the straight line
  from the south terrace to the mill. Zone kinds (`ZONE_KINDS`): `mire` (two, one in each spawn's flank, drawn as the bog) and
  `spring` (two, on the valley floor south of the arches, either side of the race). Mist is
  atmosphere only, not a zone: three low patches, a band each side and one south. Two shed **overhangs** on the race banks,
  220 and 300 wide. Waterfall and pool are the water look; torches on the stairs, mill and bridge.
- **Light:** dawn, the sun low in the east, 20°, `#ffe6c0` 0.45, ambient `#b8c8c0` 0.55, with a
  low mist band (pale, ≤ 0.15, under bodies). Torches `#ffb060` radius 140–170 at each stair head,
  the lever, the bridge and both ends of the under-pass. The west side faces the sun's shadow, so
  the west spawn gets one extra torch ring; nothing is dim enough to hide a body.
- **Reduced motion:** waterfall and race ripples freeze, mist drift stops, torch flicker is steady.

## Signature fight

The race. The drawbridge and its two levers decide who crosses straight; the other crossings (mill floor, under-pass) are 4 s longer and in the south, so a team that raises the bridge splits the enemy to the mill.

## Routes and balance (base speed 180 u/s)

Spawns: eight seats a side in the west and east mouth (T1 centred on (525,1300), T2 on (4515,1330)). The
centre is the drawbridge, (2500,1300).

| Route (T1 / T2)                                           | Length        | Walk          |
| --------------------------------------------------------- | ------------- | ------------- |
| valley floor, over the drawbridge                         | 1975 / 2015 u | 11.0 / 11.2 s |
| arch deck (up the arch stair, across, down to the bridge) | 2094 / 2071 u | 11.6 / 11.5 s |
| mill under-pass (south, under the race, up by the mill)   | 2681 / 2718 u | 14.9 / 15.1 s |

With the drawbridge raised, the floor and arch routes are cut and both teams have the under-pass (14.9 / 15.1 s) and the mill floor (the same lengths: the floor is walked over the race instead of under it); each team reaches a lever on its own bank, so neither holds the bridge alone.

All under 25 s. The teams' walks are within 2 % of each other on every route. High ground within half
the map of either spawn: a field terrace, an upper terrace, a south terrace and one arch deck each, but different shapes (west field terrace 980×330, east 900×370; west south terrace 900×300, east 1000×270; west arch 560×160, east 500×180); L2 1.19 M u², L3 0.28 M u² in total, each side within 3 % of the other. No high ground is reachable by one side
only without crossing the middle: the falls ledges are two, one per side, and each is reached by
its own upper terrace.

## Canyon lessons, on the plan

- Every deck is reachable up and down by click-to-move (#3177): each terrace and arch has stairs
  and a drop; the mill floor has a stair on each side.
- No body is hidden without an outline (#3178/#3251): stairs are open steps against the terrace
  face, nothing stands south of a stair, and terraces are low (70 / 140).
- The under-pass cover is the walkable floor and nothing wider (#3179). Paving over a tunnel fades
  with the cutaway (#3272): the mill floor and the arches are decks, not paving.

## New art needed

Nothing beyond the schema's elements. The waterfall is a tall water-look strip on the cliff, the
mist is atmosphere only (no zone). Mechanics are not designed here.
