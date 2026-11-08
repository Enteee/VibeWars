# Splash screen proposals (#2880)

Five different ideas for the first screen, each on one sheet: 1920x1080 left,
390x844 phone portrait right. Drawn by `scripts/assets/splash-proposals.mjs`
from the palette in `art-direction.md`, in DejaVu Sans / Serif (already
licensed for the repo's art). All original; nothing from Guild Wars 1. The
name "VibeWars" is not translated; "PRESS ANY KEY TO BEGIN" is English here
and goes through `t()` when built. Not decided; the operator picks one.

1. **Two-tone wordmark** (pure typography). "Vibe" in `friend` blue, "Wars" in
   `foe` coral over the arena grid, a split rule beneath: the whole game, two
   sides, in one word. Fits the direction by using only its two team signals
   and the grid. Build: static CSS and text, no image.
2. **Duel emblem.** The game's own player marks, a ring disc (friend) and a
   triangle disc (foe), overlapping like a Venn, over dashed range rings.
   Fits: the marks are the shapes the arena already uses. Build: inline SVG,
   no animation needed; an optional slow ring drift is CSS.
3. **The arena** (2.5D, direction D). A raised deck with its hard offset
   shadow, white lip, supports and plank lines; a friend and a foe disc face
   off on it. Fits: direct use of the picked 2.5D look. Build: SVG or a
   pre-rendered PNG; the discs could later be real sprites on a live arena.
4. **Ripples.** "Vibe" as vibration: concentric rings radiate from a blue and
   a coral source and meet on a centre line behind the name. Fits: rings and
   lines only, the brief's §20 language. Build: CSS or canvas; animated
   (rings expanding) is the natural form, static works.
5. **Crest.** A heraldic shield in `altar` gold, a "V" cut from a blue and a
   coral blade, a four-point star, ring-bead laurels, name in serif. The one
   formal, "tournament" mood. Fits: polygons and circles; gold is the
   existing altar colour. Build: inline SVG, static.

On the phone mock the name is 60 px tall in 1, 2, 3 and 4 and about 50 px in
5, never clipped. Each PNG is under 160 KB.

## Picked: 1, with a live background

The operator picked proposal 1 and asked for a lively background: a game
playing itself behind the wordmark, characters fighting on a random map, new
ones joining from the side as others die. Mockup:
`2880-splash-live.png` (hero frame, desktop and phone) and
`2880-splash-live-storyboard.png` (four moments of one map: clash, first
hits, two fall as hollow `dead` rings, newcomers streak in from the edges).
Drawn by `scripts/assets/splash-live.mjs`.

Rules for the build: the arena is the real renderer fed by bots on a random
map, dimmed under a 28% scrim with a darker band behind the name so the name
reads on any map; the wordmark, rule and prompt are drawn above it and never
move. The fight stays in the bands above and below the name. Build cost:
animated, needs a headless bot-vs-bot match on the splash route, with the
camera fixed and no HUD.
