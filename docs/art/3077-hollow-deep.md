# The Hollow Deep study (#3432, part of #3077)

Study: `3077-hollow-deep-plan.png` (outline, layers, routes, ghost-spawns, world elements, 6200×2400),
`-layer-0/1/2.png` (one layer's footprints each), `-spawn-team1.png` / `-spawn-team2.png`
(the default camera, 1100 tall, 16:9, with the team of eight). Regenerate with
`node scripts/assets/3077-hollow-deep-study.mjs docs/art` (needs inkscape; the SVGs are not
committed; the drawing is shared in `scripts/assets/3077-study-lib.mjs`). The PNGs are a guide, not
coordinates. The layout is new: today's map (4000×2200, flat) is thrown away, the place (a cave
system with a chasm, rope bridges and glowing pools) is kept.

## Rules the study holds

- **Bounds** 6200×2400 = 14.88 M u² (2.9× Canyon, 8v8, long side 6200 > 4800, short side 2400 ≥ 1800).
  The ground outline fills 80 % of it (72 % with the two chasms taken out), with `rock`
  (`OUTSIDE_KINDS`) outside. T1 holds the west lobe, T2 the east lobe; the map is one piece turned 180°
  (point mirror about (3100,1200)), so every walk is equal for both teams. Spawn to centre is 15.5 s,
  under the 25 s cap.
- **Biome: propose `cavern`**, one new row, added by this map's first build PR (#3172 rules). Ground
  `#232a33`, rock `#4a5260` (a cold slate) and glow `#8a6fc9` (a mushroom violet, hue ~260°).
  Visual-style §1 line: "the cavern is a cold slate under a thin ceiling; the only colour is the violet
  glow of its pools; no tone is near the friend blue (~200°), the foe red (~5°) or the nature green
  (~110°)". Why not `heights`: its ground is lit by sun, a cave has none.
- **Layers (3):** L0 cave floor, the two undercrofts and the central chamber; L1 four shelves, two mid
  ledges, two rope bridges and the dais (70 up); L2 the crown (140 up). Ten stairs.
- **Structures (9 + 2 tunnels):** north-west, south-west, north-east, south-east shelf; west and east
  mid ledge; north and south rope bridge; dais; crown (that is 10 shapes; 3 layers, near Moss Vale's
  budget for 16 bodies).
- **Chasms:** two, north (2700..3500, 130..850) and south (2700..3500, 1550..2270), drawn as deep
  water (the lib has no chasm kind; a chasm is "no ground" in the build). Each is crossed by a rope bridge
  (1280×120, on L1) from one team's shelf to the other's. The bridges are plain structures: no lever.
- **Tunnels:** two **undercrofts** on L0, 120 wide, each running under a mid ledge, a gentle S bend:
  west (1900,1200)–(2300,1330)–(2700,1200), east mirrored. Seam and grating slots as in #3236.
- **Drop-offs (4):** the four shelves' inner edges.
- **Routes, spawn to centre (T1, T2 mirrored):** undercroft 15.5 s, over the mid ledge 15.6 s,
  north shelf 16.6 s, south shelf 16.6 s (spread 7 %). Ghost-spawn to centre 15.5 s.
  Enemy to each team's ghost-spawn: north bridge 30.6 s, middle 31.1 s, south bridge 34.6 s; ≥ 3 routes.
- **High ground** is the crown (3010..3190, 1110..1290, L2) on the dais in the centre chamber: both
  teams 15.6 s to the foot of the dais plus 0.6 s up, equal by symmetry (0 %).
- **Objectives:** the only objective today is the ghost-spawn, 2, kept: T1 (520,420), T2 (5680,1980),
  each on open floor in the lobe's far corner, outside any tunnel, zone or water, in its own lit ring.
  No shrine, no new objective.
- **Lever-driven elements:** an **undercroft gate** per side, shut at the start, opened by a lever
  on a shelf (west gate: lever (2300,450) on the north-west shelf; east: (3900,1950)). The gates are
  doors, not lifts, so bots path round them. With both gates shut every spawn keeps three routes
  (ledge, north shelf, south shelf), and the chasms keep two crossings each way.
- **Breakables:** a **stalagmite wall** beside each ghost-spawn, (780,560) and (5396,1600), 24×240.
- **Zones:** `spring` (glowing pool, (1100,800), (5100,1600)) and `mire` (the north-west and south-east shelf, (2250,640),
  (3950,1760), on shelf ground off the bridges): two kinds. Two shallow glow pools as set dressing (decorative water).
- **Lights and atmosphere (#3272, #3352, #3418):** a cave is dark, so light is local. Light count: 15 (cap 16). Torches at each tunnel mouth, at both bridges and on the chamber, violet glow rings
  at the pools and at the centre (r 260). `ceiling lip` overhangs fade as the player walks under them;
  there is no roof over the whole map. Mist over each chasm. Time of day: the Indoor row (#5a6688, 0.30, no sun).
  Not every walkable area is inside a ring (shelves and the outer floor are not): readability comes from the Indoor ambient plus the body and surface floors (0.7 / 0.45).
- **Canyon lessons on the plan:** tunnel as wide as its floor (#3179); stairs touch the lower and the
  upper footprint (#3177); a drop-off is marked where a ledge ends (#3178/#3251).
- **Reduced motion:** the mist and the pool glow are static in the study; with reduced motion the
  build holds them still (no flicker).
- **8v8 tick budget:** 3 layers (≤ 4), 10 structures + 2 tunnels.

## Questions

None: objective kind and count unchanged.

## New art needed / not built

A chasm ground kind (an edge-lit hole), a rope-bridge look and the `cavern` biome row. Nothing is
designed for them here.
