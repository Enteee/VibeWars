# More structure looks and overhang shade (#3078)

Study: `3078-structures-2.png` (800x500), regenerate with
`node scripts/assets/structures2-study.mjs docs/art` (needs inkscape; the SVG is not
committed). Same box language as `3067-structures.png`: lightest top, bright south
lip, darker south face, hard SE shadow.

- **ledge**: a stone deck in front of a rock face (`#6b7a90` top, `#3a4658` face),
  one five-step stair at the end.
- **ruin**: masonry deck with dark holes (lit far lip), a chipped corner and rubble
  on the ground. Holes are in the footprint, so what is drawn is what walks.
- **arch**: rock mass, lit walkable top, a dark round opening. Bodies beneath are dim.
- **gatehouse-roof**: masonry with merlons (art only) over a dark passage, optional
  iron grid inside.
- **rooftop**: plaster roofs (`#b5a98f`, face `#6a604f`: warm and desaturated, not
  danger orange), stair on a face, a plank bridge between roofs.
- **pier**: planks on posts over water; the ship deck is a raised wooden hull block
  with a mast and a pale flag.
- **plinth**: a two-tier stone base under a statue, with a brass capture ring on the
  ground (`#e8c27a`, the same brass as levers).
- **overhang shade**: a body under a deck is drawn with a 30 % `#080b10` overlay (opacity 0.3) over it,
  which keeps it above the body floor of 0.7. It is shape, not light, so it stays with
  lighting off. The cell shows the same body in the open beside two shaded ones.
