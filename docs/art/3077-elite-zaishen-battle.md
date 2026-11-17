# The Elite Zaishen Battle study (#3432, part of #3077)

Study: `3077-elite-zaishen-battle-plan.png` (outline, layers, routes, world elements, 5400×2400),
`-layer-0/1/2.png` (one layer's footprints each), `-spawn-team1.png` / `-spawn-team2.png`
(the default camera, 1100 tall, 16:9, with the team of eight). Regenerate with
`node scripts/assets/3077-elite-zaishen-battle-study.mjs docs/art` (needs inkscape; the SVGs are not
committed; the drawing is shared in `scripts/assets/3077-study-lib.mjs`). The PNGs are a guide, not
coordinates. The layout is new: today's map (1600×1160, flat) is thrown away, the place (a
ceremonial arena with tiered stands, plinths and a sunken floor) is kept.

## Rules the study holds

- **Bounds** 5400×2400 = 12.96 M u² (2.6× Canyon, 8v8, long side 5400 > 4800, short side 2400 ≥ 1800;
  above the 2.5× bound of 12.6 M u²). The outline is a **walled rectangle** with
  cut corners (allowed for a built arena) and fills 81 % of the bounds. The map is one piece turned
  180° about (2700,1200): equal walks for both teams. Spawn to the start line is 15.6 s, under 25 s.
- **Biome: `hall`** (the Hall of Heroes' blue-grey stone, no new row).
- **Layers (3):** L0 the sunken floor and the two undercrofts; L1 tier 1 of the north and south stands
  and four plinths (70 up); L2 tier 2 of each stand (140 up). Ten stairs. The stands are terraces you
  fight on, not scenery.
- **Structures (8 + 2 tunnels):** north and south tier 1, north and south tier 2, four plinths
  (220×220 blocks that are cover and a perch). 3 layers, near Moss Vale's budget for 16 bodies.
- **Tunnels:** two **undercrofts** on L0, 120 wide, each a U under a tier 1: north
  (1600,720)–(1600,580)–(2200,580)–(2200,720), south turned. Seam and grating slots as in #3236.
- **Drop-offs (4):** the stands' outer edges toward the floor.
- **Objective:** the **start-line**, 1 (kept), at the centre (2700,1200), on open floor in a warm lit ring.
- **Routes, spawn to the start line (T1; T2 identical, turned):** floor 15.6 s, over the stand 16.6 s,
  undercroft 17.0 s (spread 9 %). Spawn to the other spawn: floor 28.6 s, undercroft 34.0 s.
- **High ground:** tier 2 of the stand on the team's own side, 8.8 s from the spawn (stair at (1300,400));
  the other team's is its turn: 0 % spread.
- **Lever-driven elements:** an **undercroft portcullis** per side, shut at the start, opened by a
  lever on the opposite tier 1 ((2000,560) opens the south one, (3400,1840) the north one). Doors, not
  lifts, so bots path round them; with a portcullis shut each spawn still has the floor and the stand.
- **Breakables:** a **statue screen** per side, (2000,1500) and (3376,700), 24×200.
- **Zones:** `spring` (two reflecting pools beside the start line) and `mire` (a sand pit at (800,1500)
  and (4600,900)): two kinds.
- **Light:** torches at each undercroft mouth and stair, braziers along the stands, a warm ring (r 280)
  on the start line, rings at the spawns; box awnings fade as overhangs (#3272, #3352, #3418). A dust
  haze over the sand. Time of day: noon through an open top, no dim zone.
- **Canyon lessons on the plan:** tunnels as wide as their floor (#3179); stairs touch both footprints
  (#3177); drop-offs marked (#3178/#3251).
- **Reduced motion:** the dust haze and brazier flicker are held still.
- **8v8 tick budget:** 3 layers (≤ 4), 8 structures + 2 tunnels.

## Questions

None: the objective kind and count are unchanged.

## New art needed / not built

A plinth look and the stand seating rows (as relief on the tier faces). Nothing is designed for them here.
