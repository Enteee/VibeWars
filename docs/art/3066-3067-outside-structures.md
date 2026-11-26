# Outside land (#3066) and height structures (#3067)

Studies: `3066-outside.png` (`node scripts/assets/outside-study.mjs docs/art`) and
`3067-structures.png` (`node scripts/assets/structures-study.mjs docs/art`). Both need
inkscape; the SVG is a build intermediate and is not committed.

## Outside kinds

Shared rules: the outside is lit like the rest of the map, painted with grain
(never a flat slab), and the edge is always a **line the ground side owns**.

- **cliff**: dark `#2d3748` fading to near black below, grain, faint strata. Edge is a
  pale lip `#a9bbd0` (2.5 px) over a dark `#0b0f14` outline, as a deck lip. Sight passes.
- **rock**: massed chiselled boulders (the hazard rock recipe: `#8f887b`, `#6f695f`,
  `#4d4943`, `#34312c`, lit top `#b4ad9f`), on `#3f3c37`. Edge: a dark crevice
  `#14120f` and a thin pale rim. Blocks sight.
- **forest**: overlapping canopies `#2c4a2e` with NW highlights `#3f6a3d`/`#5f8c55`,
  a trunk shadow to the SE, on `#1c2a1f`. Edge: a soft dark shadow, no line. Blocks
  sight. Desaturated: it stays away from the grove signal green `#2f8a3c`.
- **deep-water**: `#18304a` with grain and thin ripples, shore `#8fb8d6` 3 px (the
  deep-water shoreline). Darker and greyer than friend blue `#59c2ff`. Sight passes.
- **basalt** (#3225, the volcanic biome's): a cooled crust `#24201e` broken by jagged
  black cracks `#0c0a09`, a dull ember `#6e3018` deep in some. Edge: a black crevice
  with the ember in it, a thin ash rim `#8c827a`. Blocks sight. The ember is far
  below danger orange: only lava glows hot.

Outside bodies never use danger orange, acid green or friend blue as a fill.

## Structures

Every look is a lit box (`box()` in the script): lightest top, a 3 px bright lip on
the south rim, a darker south face, a hard shadow to the SE.

- **platform** stone `#a0b2c7` on a `#5f6f86` face. **tower**: masonry course lines,
  merlons on the rim, a ladder on the face. **wall-walk**: thick masonry wall, merlons
  on both rims, a five-step stair at each end. Merlons are art only.
- **terrace**: moss tops `#4f6a40` over earth faces, three stepped levels, rough
  steps in `#6f6248`. Wilds palette.
- **bridge-stone** masonry deck with piers; **bridge-plank** one lane, dark posts,
  rope rails (dashed); **bridge-log** a bark trunk with a pale cut end. All sit above
  the water, which shows between the supports.
- **Transitions**: ramp (one gradient slope), stairs (tread bands, stringers),
  stairs-landing (two flights, a wider landing slab), ladder (two rails, rungs,
  16 wide), rough-steps (irregular earth stones). Each reads from silhouette alone:
  slope, bands, a slab, thin rails, scattered stones.
