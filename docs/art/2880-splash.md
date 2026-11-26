# Splash screen proposals (#2880)

Five different ideas for the first screen, each on one sheet: 1920x1080 left,
390x844 phone portrait right. Drawn by `scripts/assets/splash-proposals.mjs`
from the palette in `art-direction.md`, in DejaVu Sans / Serif (already
licensed for the repo's art). All original; nothing from Guild Wars 1. The
name "VibeWars" is not translated; "PRESS ANY KEY TO BEGIN" is English here
and goes through `t()` when built. The operator picked proposal 1 (see "Picked" below).

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

## Picked: 1, as a sequence over a battle

The operator picked proposal 1 and revised it twice: a crowd of small
characters fighting on a random map behind it, then a timed intro.
`2880-splash-live.png` is the final frame (desktop and phone);
`2880-splash-live-storyboard.png` is the sequence. Drawn by
`scripts/assets/splash-live.mjs`.

| Time   | What happens                                                                            |
| ------ | --------------------------------------------------------------------------------------- |
| 0 s    | No title. Eight friends walk in from the left edge, eight foes from the right           |
| 2-10 s | They fight in duels; some fall (hollow `dead` rings), new ones walk in from the edges   |
| 10 s   | Music starts; "Vibe" flies in from the left and "Wars" from the right, with speed lines |
| 12 s   | They meet: the screen flashes white, the music turns into the VibeWars theme            |
| 12.5 s | The wordmark and its split rule settle over the dimmed battle                           |
| 13 s   | "Press any key to begin" appears                                                        |

Rules for the build: this is the game itself, not an animation: the real
renderer and engine run an 8v8 bot match on a random
map, spawned at the screen edges and walking in. Characters are smaller than in
a match, no HUD, fixed camera.
From the fly-in on, a 30% scrim plus a darker band behind the name keep it
readable on any map. The wordmark never moves after the meeting. Build cost:
animated: a bot-vs-bot match on the splash route, plus the timing and
the flash in CSS; the music change belongs to the music epic.
