# Sandstone Steps study (#3276, part of #3072)

Study: `3072-sandstone-steps-plan.png` (outline, layers, routes, world elements, 2600×1940),
`-layer-0/1/2.png` (one layer's footprints each), `-spawn-team1.png` / `-spawn-team2.png`
(the default camera, 1100 tall, 16:9, with the spawn's body). Regenerate with
`node scripts/assets/3072-sandstone-steps-study.mjs docs/art` (needs inkscape; the SVGs are
not committed). The PNGs are a guide, not coordinates. The layout is new: today's map is thrown away,
the place (a terraced desert town on a hill) is kept.

## Rules the study holds

- **Bounds** 2600×1940 = 5.04 M u² (1× Canyon). The ground outline fills 73 % of it, ragged,
  with `rock` (`OUTSIDE_KINDS`) outside: boulders and scree, drawn in the plan and both spawn frames.
- **Biome `desert`** (visual-style §1): ground `#3b3226`, rock `#6e6252`, stone decks `#c2b296`,
  roofs `#a98a63`. No new row. Blue and red appear only on bodies and team marks.
- **Layers (3):** L0 street and under-pass; L1 the mid terrace and plaza (a `deck`, 70 up);
  L2 west rooftops, east granary terrace and a plank bridge between them (`decks`, 140 up).
- **Structures (≥ 4):** the L1 terrace; five `transitions` (west and east stair, the wide
  _grand steps_ up the centre, one stair to each L2); two L2 decks; the plank bridge; two awnings
  as overhangs over the lanes.
- **Tunnel:** a U-shaped under-pass on L0, 110 wide, mouths at (800,1255) and (1800,1255),
  running under the plaza. The **well shaft** at (1300,900) is its middle: a ramp up into the
  plaza, a stone ring and water at its foot (`water`, shallow). Cover shows the seam and
  grating slots (#3236), shaded exactly as wide as the walkable floor (#3179).
- **Drop-offs (4):** both L2 edges to the terrace, both terrace edges to the street.
- **Elements:** a brass **lever** on the plaza at (1190,830) works the **gate** in the
  under-pass at (1300,1020) (it stands at the shaft foot: shut, the under-pass is a dead end for both teams alike, so the stair (6.2 s) and the grand steps (7.2 s) are the two routes, equal for both; open, the under-pass links both lanes to the shaft); a **mud-brick breakable
  wall** across the south alley at x=1500, where a straight L0 walk between spawns would run;
  zones `mire` (west cistern seep, at (840,1700)) and `scorched` (east forge ash, at (1760,1700)),
  mirrored about the plaza axis, 120 u clear of the breakable wall, on the south edge of the street: off all three routes and well clear of both spawns
  (≥ 130 u from any route, ≥ 400 u from a spawn); a smoke vent is the forge's atmosphere.
- **Light:** the **Day** row (visual-style §2): sun from the NW, 50°, `#fff1d6` 0.55, ambient
  `#b0bcd4` 0.45; hot reads from the sand, not from dimming. Local lights: a torch (`#ffb060`,
  radius 150) at each tunnel mouth, each stair head and the well, plus the forge (`#ff9040`,
  radius 200, flicker 0.35). Nothing is dark: the street is lit by the sun, only the under-pass
  is dim, and it carries the mouth torches.
- **Reduced motion:** the torch and forge flicker stop (a steady glow); the water and smoke
  drift stop; everything else is static already.

## Routes and balance (base speed 180 u/s)

Both spawns on L0 (T1 at (520,1560), T2 at (2080,1560)), the centre is the well plaza.

| Route                                             | Length | Walk  |
| ------------------------------------------------- | ------ | ----- |
| stair (west or east stair, across the terrace)    | 1122 u | 6.2 s |
| grand steps (straight up the centre)              | 1297 u | 7.2 s |
| under-pass (mouth, under the plaza, up the shaft) | 1333 u | 7.4 s |

Each side has the same three, so the two teams' walks are equal. The sides differ on purpose:
west holds a roof cluster (a six-sided roof, 219 k u²) and the mire; east holds the granary terrace
(207 k u², 6 % smaller, so within 25 %) and the forge ash; the awnings sit on different lanes.
High ground within half the map of either spawn is one L2 deck, each reached only by its own
side's roof stair from the terrace; the plank bridge joins them, so the north is contested,
not owned.

## Canyon lessons, on the plan

- Every deck is reachable up and down by click-to-move (#3177): each stair and ramp has a
  walk-down, and each L2 has both a stair and a drop.
- No body is hidden without an outline (#3178/#3251): the stairs are drawn as open steps, no
  wall stands south of one; awnings are thin cloth bodies show through.
- The tunnel cover is the walkable floor and nothing wider (#3179); paving over the under-pass
  fades with the cutaway (#3272).

## New art needed

Nothing beyond the schema's elements: awnings use the existing overhang recipe
(`3066-3067-outside-structures.md`), the breakable wall uses the existing look. The well ring and the
terrace parapet are painted from existing deck faces. Mechanics are not designed here.
