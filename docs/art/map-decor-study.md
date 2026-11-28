# Map decoration study (#4252)

Design only. `scripts/assets/map-decor-study.mjs` draws `map-decor-study.svg` and `.png`; this page is written by the same run.
A piece is pure decoration: no collision, no walk cost, no meaning in the fight (the contract of `render/ground-dressing.ts`).

## Rules the set follows

- Palette: the graded biome tones of `visual-style.md` §1, muted; piece colours stay within about one step of the floor in value. Nothing is warm except the lit fire pieces, nothing is blue (friend, help), red (foe, damage) or bright green (nature).
- Stacking (ADR-0057): dark base to lit top, `STEP` 1.5 px a slice, 1 px outline `#08080a` on the base and the top slice. Ground pieces cast a soft south-east shadow (sun north-west, §2).
- Readability (§6): decoration is darker and lower in contrast than any zone edge or body, and sits under bodies. Wall pieces hang on the wall face, never on the walkable floor, and never read as a door, a lever or a blocking wall: the grating is dark bars on black, no frame colour, no glow.
- Only `torch-`/`fire-`/`brazier-` pieces light (§2). Here: `torch-bracket-lit` (torch light `#ffb060`, radius 150) and `torch-candle-niche` (small, radius 90). They count toward a map's 16 lights, so a map places few.
- Originals: no GW1 name, shape or look.
- Under 16 px across at zoom 1, a piece is a mark (one shape, one colour, one outline): `skull`, `broken-sword`, `chain-pile` and the wall bracket are the smallest and keep to that.

## Pieces

| id                    | kind   | footprint (u) | slices | lights | biomes                     | note                                                                |
| --------------------- | ------ | ------------- | ------ | ------ | -------------------------- | ------------------------------------------------------------------- |
| `floor-crack`         | ground | 31 x 19 u     | 2      | no     | stone, sand, frozen        | A split in the flagstone with a raised, chipped lip.                |
| `moss-patch`          | ground | 30 x 18 u     | 3      | no     | stone, swamp               | A damp cushion of moss on a joint.                                  |
| `bone-scatter`        | ground | 24 x 32 u     | 2      | no     | stone, sand, swamp, frozen | Three long bones and a rib, lying where they fell.                  |
| `skull`               | ground | 12 x 15 u     | 5      | no     | stone, sand, swamp, frozen | A lone skull, jaw slack, one socket in shadow.                      |
| `rubble-heap`         | ground | 21 x 21 u     | 3      | no     | stone, sand, frozen        | A low heap of broken stone, five chunks.                            |
| `fallen-masonry`      | ground | 26 x 24 u     | 4      | no     | stone, sand                | A cut block and a half block, mortar still on one face.             |
| `grave-slab`          | ground | 22 x 31 u     | 4      | no     | stone, swamp, frozen       | A tilted slab with a cross cut into it.                             |
| `rune-circle`         | ground | 30 x 24 u     | 2      | no     | stone, sand, frozen        | A ring cut into the floor with four marks; dull, not lit.           |
| `puddle`              | ground | 30 x 17 u     | 3      | no     | stone, swamp, sand         | Standing water, grey and dull; never the water blue of a zone.      |
| `roots`               | ground | 24 x 24 u     | 3      | no     | stone, swamp               | A knot of roots breaking the flagstone.                             |
| `ash-drift`           | ground | 33 x 17 u     | 3      | no     | stone, sand, swamp, frozen | A soft drift of ash and dead leaves against the wind.               |
| `broken-sword`        | ground | 26 x 13 u     | 4      | no     | stone, sand, swamp, frozen | A blade snapped at the middle, hilt a hand away.                    |
| `chain-pile`          | ground | 23 x 14 u     | 3      | no     | stone, sand, swamp         | A heap of iron chain and one open shackle.                          |
| `broken-urn`          | ground | 23 x 16 u     | 4      | no     | stone, sand, swamp         | A cracked clay urn on its side, spilling ash.                       |
| `banner-torn`         | wall   | 18 x 33 u     | 5      | no     | stone, sand, frozen        | A hanging banner, hem torn to three tongues, a crest in dull gold.  |
| `torch-bracket-unlit` | wall   | 8 x 27 u      | 4      | no     | stone, sand, swamp, frozen | An iron bracket holding a dead torch.                               |
| `torch-bracket-lit`   | wall   | 8 x 36 u      | 6      | yes    | stone, sand, swamp, frozen | The same bracket with a flame: a fire light, `#ffb060`, radius 150. |
| `creeping-vines`      | wall   | 17 x 31 u     | 3      | no     | stone, swamp               | Ivy climbing from the foot, in leaf runs.                           |
| `hanging-chain`       | wall   | 9 x 39 u      | 3      | no     | stone, sand, swamp         | A chain from a ring, ending in an empty cuff.                       |
| `wall-crack`          | wall   | 7 x 34 u      | 2      | no     | stone, sand, frozen        | A long fracture with a flaked edge.                                 |
| `iron-grating`        | wall   | 21 x 21 u     | 4      | no     | stone, sand, swamp         | A barred vent, five bars, dark behind. Never a door.                |
| `torch-candle-niche`  | wall   | 18 x 21 u     | 4      | yes    | stone, sand, frozen        | A niche with three candles; a small fire light, radius 90.          |
| `carved-relief`       | wall   | 22 x 29 u     | 4      | no     | stone, sand, frozen        | A shallow relief panel: a hooded figure with bowed head.            |
| `cobweb`              | wall   | 16 x 17 u     | 2      | no     | stone, sand, swamp         | A web in a corner, thin and pale.                                   |
| `moss-run`            | wall   | 20 x 27 u     | 3      | no     | stone, swamp               | A damp run of moss down a joint, thickest at the foot.              |
| `shield-plaque`       | wall   | 18 x 25 u     | 4      | no     | stone, sand, frozen        | A dented iron shield nailed up, boss and rim.                       |

## Variants

Each piece ships 3 variants: ground pieces turn (any angle) and mirror, wall pieces mirror only (they hang). Each variant re-seeds the piece's small shapes (a crack's path, a leaf's place) and nudges the tint (cooler, warmer, per biome family). A map picks the variant by a hash of the piece's position, so a repeat does not read as a stamp.

## Cost (estimate)

Average ground piece 694 px², wall piece 588 px² at zoom 1 (slice count 3.4 on average).
Like the bodies of ADR-0057, a piece is baked once at match start into an atlas, never drawn live (a live piece is 4 to 8 polygons re-tessellated each frame).

- **Draw**: a sprite per piece. A typical scatter of 40 ground and 15 wall pieces is about 36,580 px², about **1.83 ms** a frame at ADR-0054's 50 ns per textured pixel, if all are on screen. A camera sees about a third of a map: expect **under 1 ms**. The 8v8 crowd costs 1.35 ms of update (benchmarks.md), so a dressed map adds up to half of that in the worst case; the bench must show it before the follow-up switches it on.
- **Bake**: 26 pieces × 3 variants = 78 images, about 195 KB of texture per biome (4 B a pixel), baked once at load. A map bakes only the pieces it lists.
- **Cheaper still**: ground pieces under 16 px can be painted into the ground tile (`ground-dressing.ts`), at zero draw cost, as repeats. The study's `floor-crack`, `moss-patch`, `ash-drift` and `puddle` suit that; the rest are placed sprites.
- **Lights**: at most 4 lit pieces on a map (of the 16 allowed).

## Not in this study

How a map places pieces (data, density, no-go zones), the renderer, and the per-map dressing: follow-up cards after the operator approves the sheet. Water, zone and border shapes: #4251.
