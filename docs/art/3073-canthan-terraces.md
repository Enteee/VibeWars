# Canthan Terraces study (#3392, part of #3073)

Study: `3073-canthan-terraces-plan.png` (outline, layers, routes, world elements, 2400×2100),
`-layer-0/1/2.png` (one layer's footprints each), `-spawn-team1.png` / `-spawn-team2.png`
(the default camera, 1100 tall, 16:9, with the spawn's body). Regenerate with
`node scripts/assets/3073-canthan-terraces-study.mjs docs/art` (needs inkscape; the SVGs are
not committed). The PNGs are a guide, not coordinates. The layout is new: today's map is thrown away,
the place (rice-paddy terraces on a hillside, a pagoda, a lantern bridge) is kept.

## Rules the study holds

- **Bounds** 2400×2100 = 5.04 M u² (1× Canyon). The ground outline fills 67 % of it, ragged,
  with `rock` (`OUTSIDE_KINDS`) outside: boulders drawn in the plan and both spawn frames.
- **Biome `wilds`** (visual-style §1): ground `#2a3328`, rock `#5b5f58`, moss `#4f5e3c`, earth
  `#5a4630`; stone decks `#a9a58f`, roof tile `#7a4a3a`. No new row: the green stays the muted
  moss, so allies' green is not crowded, and the paddies read as _water_ (`#3f9fe8`), not as
  grass. Blue and red appear only on bodies and team marks.
- **Layers (3):** L0 the valley floor and culvert; L1 the middle terrace (a `deck`, 70 up),
  a curved contour band across the hill; L2 the paddy terrace (west) and the pagoda terrace
  (east), joined by the lantern bridge (`decks`, 140 up).
- **Structures (≥ 4):** the L1 terrace; five `transitions` (west and east stair, the wide
  _paddy steps_ up the centre, one stair to each L2); two L2 decks; the lantern bridge; the pagoda
  (a stone base with two eaved storeys, on the east deck); two lantern arches as overhangs over the lanes.
- **Tunnel:** a U-shaped flooded **culvert** on L0, 110 wide, mouths at (700,1560) (west) and
  (1700,1500) (east), running under the terrace. The **drain shaft** at (1250,1130), off the
  map's axis, is its middle: a ramp up to the terrace, a stone ring and water at its foot
  (`water`, shallow). Cover shows the seam and grating slots (#3236), shaded exactly as wide as
  the walkable floor (#3179).
- **Drop-offs (4):** both L2 edges to the terrace, both terrace edges to the valley floor.
- **Elements:** a brass **lever** on the terrace at (1130,1060) works the **sluice gate** in the
  culvert at (1250,1230) (it stands at the shaft foot: shut, the culvert is a dead end for both
  teams alike, so the stair and the paddy steps are the two routes; open, the culvert links both
  mouths to the shaft); a **mud-brick breakable wall** across the south at x=1200, where a straight
  L0 walk between spawns would run; zones `mire` (paddy mud, (880,1890)) and `spring` (a hillside
  spring, (1660,1900)), both on the south edge of the floor, off all three routes and well clear of both
  spawns; shallow paddy water on every tier (six fields, drawn with a bund rim) is
  scenery with the existing `water` look, not a zone.
- **Light:** the **Day** row (visual-style §2): sun from the NW, 50°, `#fff1d6` 0.55, ambient
  `#b0bcd4` 0.45. Local lights: a paper lantern (`#ffcf80`, radius 150) at each culvert mouth,
  each stair head, the shaft and the lantern bridge, a larger one (radius 220) at the pagoda,
  and the spring's teal glow. Nothing is dark: only the culvert is dim, and it carries the mouth lanterns.
- **Atmosphere (#3032):** the **fog bank**, thin, over the two lowest paddy fields and the culvert approach only
  (no zone, never over a route or the high ground). Reduced motion: it holds still.
- **Reduced motion:** the lantern flicker stops (a steady glow); the water glint and spring
  drift stop; everything else is static already.

## Routes and balance (base speed 180 u/s)

Both spawns on L0, not mirrored: T1 at (500,1690) south-west, T2 at (2060,1690) south-east, 1560 apart. The east terrace edge bulges out and the pagoda deck is larger than the paddy deck. The centre is the drain shaft.

| Route                                      | Length        | Walk        |
| ------------------------------------------ | ------------- | ----------- |
| stair (west or east stair, across terrace) | 1024 / 1104 u | 5.7 / 6.1 s |
| paddy steps (straight up the centre)       | 1207 / 1212 u | 6.7 / 6.7 s |
| culvert (mouth, under the terrace, shaft)  | 1219 / 1227 u | 6.8 / 6.8 s |

Each side has the same three, T1 / T2; the walks are within 8 % (stair 8 %, the others under 1 %). The shaft sits at x 1250, left of the map's axis (1200), and the sides still differ on purpose: the
west holds the paddy terrace (212 k u²), the east the pagoda terrace (250 k u², 15 % larger, so
within 25 %); the lantern arches sit on different lanes. High ground within half the map of
either spawn is one L2 deck, each reached only by its own side's stair from the terrace; the
lantern bridge joins them, so the north is contested, not owned. The bridge is a fixed span, so nobody is cut off.

## Canyon lessons, on the plan

- Every deck is reachable up and down by click-to-move (#3177): each stair has a walk-down,
  and each L2 has both a stair and a drop.
- No body is hidden without an outline (#3178/#3251): stairs are open steps, no wall stands
  south of one; arches are thin overhangs bodies show through; the pagoda stands on its deck's
  north edge, so nothing walkable is behind it.
- The culvert cover is the walkable floor and nothing wider (#3179); paving over the culvert
  fades with the cutaway (#3272).

## New art needed

Nothing beyond the schema's elements: the arches use the existing overhang recipe
(`3066-3067-outside-structures.md`), the breakable wall uses the existing look. The pagoda is
stacked deck and overhang faces (a tile-roof tint), the paddies are the existing shallow water
inside an earth bund, the bridge's lanterns are the existing light dot. Mechanics are not designed here.
