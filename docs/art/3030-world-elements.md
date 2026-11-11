# Portals, barriers, atmosphere (#3030, #3031, #3032)

Studies: `3030-portals.png`, `3031-barriers.png`, `3032-atmosphere.png`.
Regenerate with `node scripts/assets/world-elements-study.mjs docs/art`
(needs inkscape). Rules follow `visual-style.md`.

## Portal (#3030)

- Ring of ten rune stones (`#827b70` / `#6f695f`, lit top `#c4bdb0`) round a
  swirl dish. On: aqua `#5fe0d0` rings and a white core, a rising wisp, a
  cool aqua light. Aqua is help-class, never harmful hue.
- Off: the dish is dark `#12161d` with a dashed grey ring, the rune pips and
  light are gone. Shape differs from on, not only colour.
- Arrival: a white burst and an expanding ring at the exit. The ring is the
  5 s cooldown cue: it fades over the cooldown.
- Entry and exit use the same look; direction is not drawn.
- Light: on, `#5fe0d0`, radiusScale about 1.4, intensity 0.4; off none.

## Energy barrier (#3031)

- Two stone posts `#4b5a70` with aqua lamps, a shimmering curtain `#5fe0d0`
  at 28 % with wavering lines and a bright top and bottom edge.
- Closed: curtain, aqua glow. Open: posts and a faint dashed ghost.
- It blocks bodies, not sight: bodies behind it stay fully drawn, the curtain
  sits over them at low alpha.

## Destructible wall (#3031)

- A block of the chiselled stone of the rock study (lit top `#a69f92`, face
  `#6f695f`, mortar `#4d4943`), so it reads as a wall that can break, unlike
  indestructible walls, which stay `wallTop` blue-grey.
- Damage shows as cracks: none, a few at 45 % health, many near death. A
  health bar shows on hover or when targeted.
- Crumbled: rubble chunks and a dust puff; the wall is gone.

## Atmosphere (#3032)

- Fog bank: layered pale `#c8d4e4` puffs at 18 to 26 % over the ground, under
  bodies, drifting slowly. Cool grey, not acid green: that is poison.
- Smoke: grey puffs that grow and thin as they rise. Steam: white puffs that
  fade out. Both start at a stone vent or a pipe.
- Rain: thin `#bcd4f0` slanted streaks and small ripple ellipses on the
  ground, a faint dark wash, 70 streaks at 0.5 and 160 at 1.0 over this tile.
- Snow: white flakes 1 to 2.6 px, no ground tint. Weather never hides a
  body, projectile or telegraph (§6 rule 3): keep alpha at or under 0.6.
