# Wilds hazards and interactables (#3053)

Study: `3053-hazards.png`, regenerate with `node scripts/assets/hazards-study.mjs docs/art`
(needs inkscape; the SVG is a build intermediate, not committed). Rows: fire
vent, gas spout, rockfall (idle, telegraph, active), rolling rocks (three
rotations), lever (up, down), door (closed, open), pressure plate (up, held).

Rules the study holds:

- **Rock is chiselled, not round.** An 8-sided outline, an offset inner ring,
  facets toned by their angle to the NW light (`#8f887b` lit, `#6f695f`,
  `#4d4943`, `#34312c` in shade), a lit top plane `#b4ad9f`, a pale rim `#e6dfd0`
  on the NW edge, a cast shadow to the SE. Stone outline `#23211d`. Rocks of
  one map share these tones.
- **Telegraph = the 2.5 x edge ring** (`strikeZoneLook`), in the kind's
  `ZONE_LOOK` edge colour (vent `#ffb03d`, spout `#e6ff6a`, rockfall `#d8d0c0`), plus one extra cue that is not colour: sparks (vent), wisps (spout),
  a darkening shadow (rockfall). It reads on lava because the ring is the
  brightest thing and the cue moves.
- **Harmful is loud only while it hurts.** Idle is a stone collar with a faint
  smoulder or moss; active adds the column, burst or falling rocks.
- **Light:** vent active `#ff7a30`, large; vent telegraph smaller. Lever up
  carries a small brass `#e8c27a` glow (danger yellow is for harm only). Nothing else casts.
- **Lever:** stone base, wooden arm `#8a5a2a`, knob brass when up (on), grey when down.
- **Door:** iron frame `#3b4759`, oak leaves `#7a4e26` with iron bands; open, the
  leaves swing flat against the jambs and show a dark passage.
- **Plate:** stone disc with a front face; held, it sinks, its face vanishes
  and the ring turns brass.

Sprites: each element is a few SVG shapes, so the atlas can bake them; sizes
follow world units (vent 80 wide, boulder 72, door 106, lever 70).

The zone ring is drawn above every burst and dust cloud, and the effect stays
within the ring's reach, so the ring always tells the true area.
