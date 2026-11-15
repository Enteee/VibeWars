# Sunken Bastion study (#3392, part of #3073)

Study: `3073-sunken-bastion-plan.png` (outline, layers, routes, world elements, 2700×1900),
`-layer-0/1/2.png` (one layer's footprints each), `-spawn-team1.png` / `-spawn-team2.png`
(the default camera, 1100 tall, 16:9, with the team of two). Regenerate with
`node scripts/assets/3073-sunken-bastion-study.mjs docs/art` (needs inkscape; the SVGs are not
committed). The PNGs are a guide, not coordinates. The layout is new: today's map is thrown away,
the place (a half-flooded fortress: drowned courtyard, piers, a moat with a drawbridge, wall-walks
over the water, a flooded cellar) is kept.

## Rules the study holds

- **Bounds** 2700×1900 = 5.13 M u² (1× Canyon, 2v2). The ground outline fills 67 % of it, ragged,
  with `rock` (`OUTSIDE_KINDS`) outside: tumbled masonry, drawn in the plan and both spawn frames.
- **Biome `hall`** (visual-style §1): ground `#26303f`, rock `#4b5a70`, dressed stone decks `#8c9bb0`.
  No `marsh` row: the water is the existing `water` look and the fortress is dressed stone, so a
  new biome would add only a ground tint. Blue and red appear only on bodies and team marks.
- **Layers (3):** L0 the courtyard floor, the moat and the flooded cellar; L1 the wall-walks (a
  `deck`, 70 up): a long north walk across the moat and a short bank walk on each side; L2 the
  gatehouse (west) and the keep (east) at the ends of the north walk (`decks`, 140 up).
- **Structures (≥ 4):** the L1 north walk and two bank walks; six `transitions` (a stair to the
  north walk and one to each bank walk, from each side, plus a stair up to each L2); the two L2
  decks; the drawbridge; three duckboard piers in the moat (cover, not a crossing); the sluice
  wall; two overhangs over the banks.
- **Tunnel:** the **flooded cellar** on L0, 110 wide, straight under the moat, mouths at (820,1280)
  and (1860,1280). Cover shows the seam and grating slots (#3236), shaded exactly as wide as the
  walkable floor (#3179). The shallow water of the cellar is the existing `water` look.
- **Drop-offs (4):** the north walk's south edge on each side to the bank, and both bank walks to the floor.
- **Elements:** two brass **levers**, one on each bank ((1010,800) for the west team, (1690,1010) for
  the east), work the **drawbridge** (L0 level, at (1350,905), 460 long; 90 wide). A lever-driven
  bridge, so with it raised both teams still have two other crossings (the north wall-walk and the
  flooded cellar), and nobody is cut off. A **breakable sluice wall** stands in the moat at
  (1300,1060), blocking the shallow channel south of the bridge. Zones: `foul-water` (a stagnant
  corner, west, (880,1160)) and `mire` (silt, east, (1860,760)), off all routes and ≥ 200 u from a
  spawn; both teams lose nothing by walking round them. Atmosphere: ripples on the moat.
- **Light:** the **Dusk** row (visual-style §2): sun from the NW, 25°, `#ffb87a` 0.5, ambient
  `#7f86a8` 0.35. Torches `#ffb060`, radius 140–170, at each cellar mouth, each stair head, both
  levers and the drawbridge, so nothing is dim enough to hide a body; the cellar carries its mouth torches.
- **Reduced motion:** torch flicker steady; moat ripples freeze.

## Routes and balance (base speed 180 u/s)

Two seats a side, T1 centred (445,1070), T2 centred (2275,880), the centre is the drawbridge, (1350,905).

| Route (T1 / T2)                                     | Length        | Walk         |
| --------------------------------------------------- | ------------- | ------------ |
| drawbridge (straight across the moat)               | 925 / 925 u   | 5.1 / 5.1 s  |
| flooded cellar (under the moat, up to the bridge)   | 1335 / 1461 u | 7.4 / 8.1 s  |
| north wall-walk (stair, across, down to the bridge) | 1867 / 1732 u | 10.4 / 9.6 s |

Each team has the same three; T1 / T2 are within 9 % (bridge 0 %, cellar 9 %, walk 8 %). With the
drawbridge raised (a lever on each bank, so neither team holds it alone), the cellar and the north
walk are the two crossings; the walk is long on purpose (the high road is slow, 3 s slower than the
cellar), so raising the bridge splits a team between a short wet crossing and a long dry one. High
ground within half the map of either spawn is one L2 deck (gatehouse for T1, keep for T2), each
reached only by its own side's stair from the north walk. The gatehouse (92 k u²) and the keep
(105 k u²) are within 15 %.

## Canyon lessons, on the plan

- Every deck is reachable up and down by click-to-move (#3177): each stair has a walk-down, and
  each L2 has both a stair and a drop.
- No body is hidden without an outline (#3178/#3251): the stairs are open steps, nothing stands
  south of one; the overhangs are thin; the moat is open water, nothing stands in front of it
  but piers 22 high.
- The cellar cover is the walkable floor and nothing wider (#3179); paving over it fades with
  the cutaway (#3272).

## New art needed

Nothing beyond the schema's elements: the overhangs use the existing recipe
(`3066-3067-outside-structures.md`), the drawbridge uses the existing bridge look, the breakable
wall uses the existing look, the piers are low wooden decks. The moat's deep water is the
existing `water` look at its darker ramp. Mechanics are not designed here.
