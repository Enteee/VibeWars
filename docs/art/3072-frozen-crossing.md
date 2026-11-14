# Frozen Crossing study (#3276, part of #3072)

Study: `3072-frozen-crossing-plan.png` (outline, layers, routes, world elements, 2600×1940),
`-layer-0/1/2.png` (one layer's footprints each), `-spawn-team1.png` / `-spawn-team2.png`
(the default camera, 1100 tall, 16:9, with the team of two). Regenerate with
`node scripts/assets/3072-frozen-crossing-study.mjs docs/art` (needs inkscape; the SVGs are not
committed). The PNGs are a guide, not coordinates. The layout is new: today's map is thrown away,
the place (a frozen river) is kept.

## Rules the study holds

- **Bounds** 2600×1940 = 5.04 M u² (1× Canyon, 2v2). The ground outline fills 72 % of it, ragged,
  with natural land outside.
- **New biome `snow`, proposed row** for `visual-style.md` §1 (the map's first build PR adds it):
  ground `#5a5f66` (shaded snow), rock `#4d4a4a`, plant/earth: thaw slush `#6a6a58`. Snow decks
  `#9ea4ab` (ridge tops `#b4b9be`), river ice `#7d8a94` (a breath cooler than the ground), open water `#34495a`. All
  low chroma and neutral-to-grey; none sits within a hand's width of friend `#59c2ff`, help
  `#3f9fe8`/`#9fdcff` or magic violet, which is why the ice is grey-teal and the water dark, not blue.
  The build PR adds the row and its `arena-palette.test.ts` check; this study adds no code. Decks are kept mid-grey on purpose: near-white snow would wash the friend blue out, so bodies keep their contrast on it.
- **Layers (3):** L0 river ice, open water, stepping stones and the cave floor; L1 the two banks (a
  `deck` each, 70 up) and the log bridge; L2 a ridge on each bank (`decks`, 140 up).
- **Structures (≥ 4):** two banks; two ramps down to the ice; two ridge stairs; two ridges; the log
  bridge (a `bridge` deck at bank height); five stepping stones, 120 wide at a 105 pitch, run edge to edge of the deep band (x 1030..1570, y 1230..1320) and a sixth links the strip north to the band edge at x 1250..1350. There is no water between the strip and the shelf or banks; the deep water is the band minus the stones: three rects, (1030,1160,220×70), (1350,1160,220×70) and (1030,1320,540×40).
- **Tunnel:** the far-bank cave, 110 wide, from a mouth on the ice at (1570,1500) east under the east
  bank and out at its south edge at (2000,1710) onto the south lane. Cover shows the seam and
  grating slots (#3236), as wide as the walkable floor (#3179).
- **Drop-offs (4):** both ridges to their banks, both banks down to the ice at the south.
- **Elements:** a brass **lever** on the central shelf at (1300,880); it raises and lowers the
  log bridge's centre plank section (a `bridge` target), so the north crossing can be cut. A
  **breakable ice wall** across the central shelf strip at (1180..1420,740): the straight way from
  the log bridge to the middle is shut until it is broken, so the bridge fight and the middle fight
  start separate. Zones: `mire` (thaw slush, west south lane) and `scorched` (hearth char, east south
  lane), one each side, off the main routes. Open water is `water`, deep: impassable except on
  the stones. Snow fog: low pale ellipses (`#e6eaee`, ≤ 0.2) under bodies, never over them.
- **Light:** the **Day** row (visual-style §2): sun from the NW, 50°, `#fff1d6` 0.55, ambient
  `#b0bcd4` 0.45. Torches (`#ffb060`, radius 150) at both cave ends, each spawn brazier, both
  bridge heads and the lever. Nothing is dim: snow bounces the light; only the cave is dark.
- **Reduced motion:** torch flicker stops (steady glow), fog drift and water shimmer stop; the
  lever's plank moves once, not animated in loops.

## Routes and balance (base speed 180 u/s)

Spawns: T1 (470,1330) and (540,1460) on the west bank; T2 mirrored on the east bank.
The centre is the central shelf, (1300,1000).

| Route                                                           | Length | Walk  |
| --------------------------------------------------------------- | ------ | ----- |
| ice shelf (ramp down, across the ice)                           | 927 u  | 5.1 s |
| stepping stones (over the open water)                           | 1086 u | 6.0 s |
| log bridge (up the bank, over the bridge, through the ice wall) | 1597 u | 8.9 s |

Both teams have the same three, so their walks are equal. The sides differ on purpose: the east bank
holds the cave and a snow-capped ridge (231 k u²); the west a bare rock ridge (213 k u², 8 %
smaller, within 25 %) and the thaw slush. High ground within half the map of either spawn is its own
ridge, reached by its own stair; neither is reachable without crossing the middle or the bridge.
The cave gives the east a flank onto the south lane; the west's matching asset is the bank-edge
drop on its south lane. **Known risk for the build card:** the cave is an east-only flank, so a 2v2 with a one-sided tunnel needs the bench to watch for it (walks are equal, the flank is not); the build card must measure it, not leave it to later tuning.

## Canyon lessons, on the plan

- Every deck is reachable up and down by click-to-move (#3177): each ramp has a walk-down; each
  ridge has a stair and a drop.
- No body is hidden without an outline (#3178/#3251): the ramps and stairs are open steps; the
  log bridge has no wall beside it.
- The cave cover is the walkable floor and nothing wider (#3179). Paving over a tunnel fades with
  the cutaway (#3272).

## New art needed

The `snow` biome tones (above) and the snow cap look for ridge and bank tops. Ice cracks and the
log bridge rail are painted from existing deck faces and plank looks. Mechanics are not designed here.
