# The Hollow Deep study (#3432, part of #3077)

Study: `3077-hollow-deep-plan.png` (outline, layers, routes, world elements, 5400×3600),
`-layer-0/1/2.png` (one layer's footprints each), `-spawn-team1.png` / `-spawn-team2.png` (the
default camera, 1100 tall, 16:9, with the team of eight). Regenerate with
`node scripts/assets/3077-hollow-deep-study.mjs docs/art` (needs inkscape; the SVGs are not
committed; the drawing is shared in `scripts/assets/3077-study-lib.mjs`). The PNGs are a guide, not
coordinates. The layout is new: today's map (4000×2200, flat) is thrown away, the place (a cavern
under a thin ceiling, a chasm with rope bridges, glowing pools as light) is kept.

## Rules the study holds

- **Bounds** 5400×3600 = 19.4 M u² (3.8× Canyon; long side 5400 > 4800, short side 3600 ≥ 1800,
  above the 12.6 M u² 8v8 bound). The ground outline (a 44-point lobed cave wall, symmetric in x)
  fills 69 % (≥ 60 %), `rock` outside.
- **Biome: propose `cavern`** (no existing biome is dark and cool enough to carry local light:
  `hall` is lighter and bluer). #3172 row: ground `#1f2829`, rock `#4a5654`, earth `#3a3a32`, no
  plants; decks `#4a5654`, lookout `#66726f`. Desaturated slate-teal, chroma well under every signal
  hue (nearest: help `#9fdcff`, far in chroma); the visual-style §1 line to add: "The cavern
  (#3432) is a dark slate rock, a breath teal and desaturated, darker than the hall so the pools
  and torches are the brightest things on it." The first build PR adds it.
- **Layers (3):** L0 the cave floor and the two crawls; L1 the two daises, the island and four rope
  bridges (70 up); L2 the lookout (140). 10 stairs.
- **Structures (8 + 2 tunnels):** island, lookout, two daises, four bridges. Below Moss Vale's
  count plus a bridge each.
- **The chasm** (a deep-water look, 1520×2000, centre (2700,1800)) is a hole in the middle of the
  map, outside the walkable ground; the island stands in it. Four rope bridges (west, east, north,
  south, 120 wide) join it to the floor. The bridges are fixed decks: **no lever drives them**, so
  the chasm always has four crossings.
- **Tunnels (2 crawls):** (1500,2550) to (2400,3050) and its x-mirror, 110 wide, under the south
  rim; each exits beside the south bridge's stair. A gate at each mouth. Cover shows the seam and
  grating slots (#3236), as wide as the walkable floor (#3179).
- **Drop-offs (3):** the west and east daises' inner edges, the island's north edge.
- **Elements:** two brass **levers**, one on each dais ((1150,1550) and its mirror), each **opens both
  crawl gates**; either team opens them and they stay open. No lift is used, so bots are not
  affected. Two **breakable rockfalls** ((1500,1000) and its mirror) close short-cuts to the north
  ledge. Zones: `spring` ×2, `mire` ×2, off every route and ≥ 200 u from a spawn. Four shallow
  **glow pools** (walkable, clear water, lit pale). Atmosphere (existing, #3032): two mist patches
  over the chasm's north and south, never over a stair, lever or bridge end. The "thin ceiling" is
  two **overhangs** (a rock lip each, north of the daises) that fade, not a roof over the map
  (#3272, #3352, #3418).
- **Light (dark, but readable):** a night row, sun 0.20, `#9fb4c0`: mostly local light. Four pale
  pool lights (`#d6e6e4`, 240–260) on the floor of each side, a ring on the island, each bridge, each
  dais and spawn block, torches `#ffb060` (150) at the two crawl gates. 16 lights, at the cap.
  Every walkable area lies within 300 u of a light, so a body reads at a glance; the chasm edge is
  lit by the island ring and the bridge rings.
- **Reduced motion:** torch flicker steady, mist holds still, spring drift stops; the crawl gates
  move once on a lever.
- **8v8 tick budget:** 3 layers, 8 structures.

## Routes and balance (base speed 180 u/s)

The map is the x-mirror of itself, so team 1 and 2 walk the same (0 % gap): the gap the structure
gives, not a promise about the final art. Spawn centre (440,1865) to the island centre (2700,1800):

| Route                              | Walk   |
| ---------------------------------- | ------ |
| west bridge (east for team 2)      | 12.6 s |
| crawl, then the south bridge       | 21.1 s |
| south ledge, then the south bridge | 22.4 s |
| north ledge, then the north bridge | 23.1 s |

Four routes per team, all under 25 s. Spawn to the first fight (the west bridge head) is 8 s. No
route crosses the other team's half before the chasm. **High ground:** each dais (350 k u²) is its
team's, the same for both; the island (360 k u²) and its lookout are shared and both reached by
four bridges. **Worst case:** the crawl gates shut and the rockfalls unbroken leave the bridge and
both ledges (≥ 2 routes, 3 in fact) for every spawn.

## Canyon lessons, on the plan

- Every deck is reachable up and down by click-to-move (#3177): each dais has a stair at both
  ends, each bridge a stair at its floor end, the lookout two.
- No body is hidden without an outline (#3178/#3251): stairs are open steps, nothing stands north
  or south of one; the thin ceilings fade.
- The crawl cover is the walkable floor and nothing wider (#3179); the ceilings over the north
  ledge fade with the cutaway (#3272).

## New art needed / not built

The `cavern` biome row above (the build card's). The rope bridge is the existing `bridge` look; the
chasm is the existing deep water look. Nothing else new; nothing designed here.

## Questions

- The chasm as deep water means falling in drowns/blocks as water does today. If a chasm should
  drop to the floor below (a pit), that is a mechanic, not decided here.
- Annihilation has two ghost-spawns today (one per team); they stay, (330,1450) and its mirror.
