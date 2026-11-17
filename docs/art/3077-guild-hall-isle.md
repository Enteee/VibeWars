# Guild Hall Isle study (#3432, part of #3077)

Study: `3077-guild-hall-isle-plan.png` (outline, layers, routes, shrines, lords, guards, world
elements, 6000×2600), `-layer-0/1/2.png` (one layer's footprints each), `-spawn-team1.png` /
`-spawn-team2.png` (the default camera, 1100 tall, 16:9, with the team of eight). Regenerate with
`node scripts/assets/3077-guild-hall-isle-study.mjs docs/art` (needs inkscape; the SVGs are not
committed; the drawing is shared in `scripts/assets/3077-study-lib.mjs`). The PNGs are a guide, not
coordinates. The layout is new: today's map (3000×2000, flat) is thrown away, the place (an island
with a beach, piers and a guild hall with a gatehouse) is kept.

## Rules the study holds

- **Bounds** 6000×2600 = 15.6 M u² (3.1× Canyon, 8v8, long side 6000 > 4800, short side 2600 ≥ 1800).
  The island outline fills 75 % of it; **the sea is the outside** (`water`-look blobs outside the
  outline, no deep water inside). The map is one piece turned 180° about (3000,1300), so each team's
  walks are equal. Spawn to the flag stand is 17.4 s, under the 25 s cap.
- **Biome: propose `coast`**, one new row, added by this map's first build PR (#3172 rules). Ground
  `#7d7358` (wet sand), rock `#5b6770` (a grey sea rock), plant `#6d6a3e` (a dry olive, hue ~55°).
  Visual-style §1 line: "the coast is wet sand and grey rock with dry olive plants beside a deep teal
  sea; no tone is near the friend blue, the foe red or the nature green". Why not `wilds`: sand
  ground and a sea outside.
- **Layers (3):** L0 beach, courtyards and the two gatehouse tunnels; L1 halls, ramparts, four piers and
  the flag dais (70 up); L2 the hall roofs (140 up), walkable rooftops. 24 stairs.
- **Structures (11 + 2 tunnels):** west and east hall, two hall roofs, west and east rampart, four
  piers, the flag dais. 3 layers, near Moss Vale's budget for 16 bodies.
- **Gatehouse:** each team's courtyard is closed by a **rampart** (300×1200, L1) pierced by a tunnel,
  120 wide on L0: west (2400,1300)–(2550,1370)–(2700,1300), east turned. The rampart top is walkable
  and is reached by a stair on each face (west (2300,1080), east (2700,980) and their turns).
- **Drop-offs (4):** the rampart ends and the hall edges, marked on the plan.
- **Lords, per team (kept: guild-lord 2, guard 16):** lord 1 (1350,1300) on the west hall floor (L1),
  lord 2 (4650,1300) turned. Eight guards each: four on the hall floor around the lord (1200..1500,
  1200..1400) and four at the gatehouse mouth (2330, 1160..1440). The hall has three stairs (east,
  south, north), so a lord has ≥ 2 ways in besides the gatehouse.
- **Routes, spawn to the flag stand (T1; T2 within 1 %):** gatehouse 17.4 s, over the rampart 17.9 s,
  pier 19.0 s (spread 9 %).
- **Routes to the enemy lord (T2 to lord 1; T1 to lord 2 is within 1.5 %):** through the gatehouse
  26.8 s, over the rampart 28.4 s, by the north pier 33.4 s. Teams' walks to the enemy lord are 26.8 s and
  26.4 s: within 2 %. Three routes, one of them through the gatehouse.
- **Flag stand:** one, on the dais at the centre (3000,1300), L1; reached by T1 and T2 in 17.4 s and
  17.5 s (0.7 %, within 5 %). Flag-spawns (kept, 2): (1100,2050), (4900,550), on open beach.
- **Resurrection shrines (kept, 2):** (650,800) and (5350,1800), beside each team's beach, on open
  ground in a lit ring, outside any tunnel, zone or water.
- **Lever-driven elements:** a **gatehouse door** per side, shut at the start, opened by a lever on
  the rampart: the west door by the lever (3450,1100) on the east rampart, the east door by (2550,1500)
  on the west rampart (a lever sits in the half it does not open).
  The doors are doors, not lifts, so bots path round them; with a door shut each lord still has the
  rampart and the pier route.
- **Breakables:** a **driftwood barricade** per side, (1500,1700) and (4476,680), 24×220.
- **Zones:** `mire` (tidal flat, (1200,500), (4800,2100)) and `spring` ((2150,1000), (3850,1600)):
  two kinds. Shallow inlets north and south of the centre are the water.
- **Light:** afternoon sun low from the west; torches at both gatehouse mouths, on the piers, round
  both halls and the lords, a warm ring (r 260) on the flag dais, rings at the shrines. Hall eaves
  fade as overhangs (#3272, #3352, #3418). Sea mist in the inlets. Every body reads on sand `#7d7358`.
- **Canyon lessons on the plan:** tunnels as wide as their floor (#3179); stairs touch both footprints
  (#3177); drop-offs marked (#3178/#3251).
- **Reduced motion:** the mist and sea ripples are held still.
- **8v8 tick budget:** 3 layers (≤ 4), 11 structures + 2 tunnels.

## Questions

None: objective kinds and counts unchanged.

## New art needed / not built

The `coast` biome row, a pier plank look and a sea outline ripple. Nothing is designed for them here.
