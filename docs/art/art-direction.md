# Art direction

How VibeWars looks, and why. Every asset follows this page; a change to the
look starts here, then in the generator, then in the code.

The brief fixes the language (§20): circles, rings, lines, polygons, progress
bars. No painted art. This page adds the rules the brief leaves open: which
colour means what, which shape means what, and how small things may get.

## The one rule

**A player must read a threat in a fraction of a second, at 16 px, colour
blind.** So every meaning is carried by a shape first and a colour second.
Colour alone never decides anything a player has to act on.

About 1 in 12 men are red-green colour blind. "Red is the enemy, green is my
team" is the one pairing they cannot see.

## Palette

The colours already in the client stay. Hex values are the source of truth;
the code and `scripts/assets/icons.mjs` copy them.

### Field

| Token         | Hex       | Use                                 |
| ------------- | --------- | ----------------------------------- |
| `bg`          | `#0e1116` | Arena floor, page background        |
| `grid`        | `#1a212c` | Arena grid                          |
| `panel`       | `#161b22` | HUD and menu panels, icon glyph cut |
| `line`        | `#2b3440` | Hairlines, panel borders            |
| `wall-fill`   | `#202836` | Walls                               |
| `wall-stroke` | `#3b4759` | Wall edges                          |
| `ink`         | `#d7dee8` | Text, neutral icons                 |
| `ink-dim`     | `#7d8899` | Secondary text                      |
| `dead`        | `#4a5464` | Corpses (hollow circle, no bars)    |

### Signals (arena)

| Token         | Hex       | Means                                    |
| ------------- | --------- | ---------------------------------------- |
| `target`      | `#ffd866` | Your current target (ring, nothing else) |
| `friend`      | `#59c2ff` | You and your team                        |
| `foe`         | `#ff7b72` | The other team                           |
| `heal`        | `#7ee787` | Health gained, arena health bar          |
| `damage`      | `#ff7b72` | Health lost                              |
| `condition`   | `#ffa657` | Condition markers                        |
| `hex`         | `#d2a8ff` | Hex markers                              |
| `enchantment` | `#56d4dd` | Enchantment markers                      |

### HUD bars

The health and energy bars in the match HUD and the Training Ground carry
their numbers in `ink` text, centred over a fill that may be full or nearly
empty. The fill is therefore a dark shade of its signal colour, so the text
reads on the fill and on the empty track alike.

| Token        | Hex       | Use             | `ink` on it |
| ------------ | --------- | --------------- | ----------- |
| `hud-health` | `#3a6a3e` | Health bar fill | 4.7:1       |
| `hud-energy` | `#2f6787` | Energy bar fill | 4.6:1       |

### Professions (menus only)

Never used in the arena: there, colour means team.

| Profession   | Hex       | Silhouette               |
| ------------ | --------- | ------------------------ |
| Warrior      | `#e3b341` | Shield                   |
| Ranger       | `#8fd36b` | Arrow, pointing up-right |
| Monk         | `#9ecbff` | Plus                     |
| Necromancer  | `#3fb68b` | Downward triangle, eye   |
| Mesmer       | `#e87fd0` | Hourglass                |
| Elementalist | `#ff6e5a` | Diamond, quartered       |
| Assassin     | `#c0405e` | Crescent moon            |
| Ritualist    | `#a9e5e0` | Spirit urn               |
| Paragon      | `#f0883e` | Two rank chevrons        |
| Dervish      | `#c9a27e` | Three whirling blades    |

The ten silhouettes stay distinct with the colour removed. Ten hues on a dark
field cannot all be far apart (closest pair: elementalist and paragon, ΔE ≈ 26),
so the silhouette identifies the profession and the colour only supports it.

## Shapes

| Thing       | Shape                                                 |
| ----------- | ----------------------------------------------------- |
| Actor       | Filled circle in team colour                          |
| You         | Your team's circle plus an `ink` rim, 2 px inside     |
| Target      | `target` ring, 5 px outside the actor                 |
| Dead        | Hollow `dead` circle, no bars                         |
| Cast        | Bar above the health bar, fills as the cast completes |
| Condition   | Circle plate, glyph inside                            |
| Hex         | Diamond plate, glyph inside                           |
| Enchantment | Rounded-square plate, glyph inside                    |
| Area flash  | Caster's team colour ring at the area's true radius   |
| Swing flash | Attacker's team colour arc between it and its target  |
| Projectile  | Weapon silhouette, tinted the shooter's team colour   |

The status plates differ in outline as well as colour. Hex purple and
enchantment teal are close for a deuteranope (simulated ΔE ≈ 18); diamond
against square is not.

### Area flash

Where an area skill lands (#5), the scene flashes the area it hit:

- **Colour is the caster's team**: `friend` for your side's splash, `foe`
  for theirs. Never `target` yellow, which means "your target" and nothing
  else.
- **A 2 px ring at the area's true radius**, over a fill of the same colour
  at 12 % alpha. The ring shows exactly who could be hit. It does not grow or
  shrink, because an animated radius would misstate the area.
- **It fades from full to zero alpha over 0.4 s**, then is removed, so a
  Barrage volley never stacks into a solid disc.
- **It is drawn under the actors** and over the grid and walls, so it never
  hides a health bar, a status plate or a target ring.

It cannot be confused with the target ring. The target ring is yellow and
hugs one actor (5 px outside a radius of 14). The flash is team-coloured,
at least 40 units in radius, and gone in under half a second.

### Swing flash

When a weapon attack lands or misses (#161), the scene flashes the swing:

- **A 2 px arc in the attacker's team colour**, 90° wide, centred on the
  direction from the attacker to its target, at the attacker's radius + 6.
  Drawn in code, not a sprite. Your own swing gets a 1 px `ink` line along
  its outer edge, as your circle gets its rim.
- **It fades from full to zero alpha over 120 ms**, so a dagger's rapid hits
  read as separate flashes, never as a standing ring.
- **It hugs the attacker, never the target.** The target ring hugs the
  target, is yellow, and does not fade, so the two cannot be confused.
- **Off under reduced motion.** The damage number still says what happened.

### Projectiles

Ranged weapon shots in flight (#161). Each is a sprite on a 32×12 grid,
pointing along +x, centred on the shot's position. The scene rotates it to
the heading and tints it to the shooter's team colour (`friend` or `foe`).
The sprites are white under a `bg` outline, so the tint gives the exact team
colour and the outline keeps them off the floor.

| Sprite  | Weapons     | Silhouette                                |
| ------- | ----------- | ----------------------------------------- |
| `arrow` | Bows        | Thin shaft, triangular head, chevron tail |
| `spear` | Spear       | Thicker shaft, long leaf blade, no tail   |
| `bolt`  | Wand, staff | Round orb with a tapering comet tail      |

Drawn at 32×12 px, over the actors and under the HUD: a shot is
gameplay information, and the player has to see where it will land in time
to step aside. Projectiles stay on under reduced motion.

### Skill type badges

The corner badge on a skill slot. Ink on the slot, except the two that leave a
marker on someone, which carry that marker's colour.

| Type        | Badge              |
| ----------- | ------------------ |
| Attack      | Blade              |
| Spell       | Four-point star    |
| Enchantment | Solid teal ring    |
| Hex         | Broken purple ring |
| Skill       | Square             |

### UI controls

Buttons in the HUD and menus. Ink on the panel. The states of one control
differ by shape, so the icon shows the current state at a glance.

| Icon        | Means          | Shape              |
| ----------- | -------------- | ------------------ |
| `sound-on`  | Sound is on    | Speaker, two waves |
| `sound-off` | Sound is muted | Speaker, a cross   |

## Sizes

- Icons are drawn on a 24×24 grid with strokes of at least 2 units.
- **16 px** is the smallest size anything renders at, and it is the size
  status icons are drawn at in the arena (`STATUS_ICON_SIZE`, no camera
  zoom). So every status glyph, not just its plate, must read at 16 px.
  Check it at true scale, under an actor of radius 14, not enlarged on its
  own.
- A glyph must leave most of its plate showing: if the glyph fills the
  plate, the plate's outline is all that is left and the category stops
  reading.

## Why the arena looks the way it does

Measured with the Machado (2009) colour-blindness simulation, CIE76 ΔE;
below ~20 is hard to tell apart, below ~10 is the same colour.

- **Both teams used to be green against red: ΔE 11 for a deuteranope**, which
  is the same colour. Allies are now `friend` blue and "you" get the `ink`
  rim (#76). Blue against red is ΔE 77 for a deuteranope and 56 for a
  protanope. Blue therefore means friend and nothing else: the cast bar is
  `ink`, not blue.
- **Heal and damage numbers differ by red and green (ΔE 11)**, so they carry
  a `+` or `−` sign, which means the same thing to everyone (#76).
- **Statuses are icons, not dots** (#77): the plate gives the category and the
  glyph the status.
- **Skill slots carry the type badge, and the editor the profession icon**
  (#78).
- **HUD bar numbers used to be `ink` on `heal` and `friend`: 1.1:1 and
  1.5:1**, which is unreadable. Dark text would vanish over the empty track
  once health drops, so the fills are dark shades instead, at least 4.5:1
  under `ink` (WCAG AA).

## Assets

All generated by `node scripts/assets/icons.mjs`, committed with the
generator. Never hand-edit an output file; change the script and re-run.

| Family     | Path                                |
| ---------- | ----------------------------------- |
| Profession | `apps/web/public/icons/profession/` |
| Skill type | `apps/web/public/icons/skill-type/` |
| Status     | `apps/web/public/icons/status/`     |
| UI         | `apps/web/public/icons/ui/`         |
| Projectile | `apps/web/public/icons/projectile/` |

Each file is a flat SVG of 150–450 bytes with colours baked in, because Phaser
rasterises SVG textures without CSS. Projectiles are the one exception: white,
for the scene to tint. Load it in Phaser with
`this.load.svg(key, url, { width, height })` at the size you draw it (24×24
for icons, 32×12 for projectiles), and in HTML with a plain `<img>`.

Adding a status, profession, skill type or UI control: add one entry to the
matching table in the generator, re-run it, and add a row to this page.

## Sound

Sound follows the one rule too: a player must tell what happened without
looking. So each event gets its own timbre, not just its own pitch, and the
sounds that fire most often are the shortest and quietest. You hear only what
concerns you, never the whole arena (#104).

| id                 | Plays when                          | Length | Peak     | Character                            |
| ------------------ | ----------------------------------- | ------ | -------- | ------------------------------------ |
| `cast-self`        | you start a cast                    | 0.25 s | −16 dBFS | Soft rising sine shimmer             |
| `cast-target`      | your target starts a cast           | 0.14 s | −4 dBFS  | Two sharp high ticks: interrupt now  |
| `hit-dealt`        | you deal damage                     | 0.12 s | −6 dBFS  | Dry noise crack over a quick drop    |
| `hit-taken`        | you take damage                     | 0.20 s | −5 dBFS  | Low, dull thud                       |
| `heal`             | you are healed                      | 0.32 s | −12 dBFS | Soft bright two-note chime, a fifth  |
| `interrupt`        | a cast is interrupted, by or on you | 0.25 s | −2 dBFS  | Broadband crack into a buzzy fall    |
| `interrupt-missed` | your interrupt hit nothing          | 0.10 s | −14 dBFS | Muted low click: "wasted"            |
| `death`            | anyone dies                         | 0.60 s | −6 dBFS  | Long low fall with a breath of noise |
| `refused`          | the server refuses your cast        | 0.16 s | −12 dBFS | Tiny falling two-note blip           |
| `weapon-swing`     | your weapon attack misses           | 0.16 s | −14 dBFS | Dry, pitchless airy whoosh           |
| `bow-release`      | you fire a ranged weapon            | 0.18 s | −13 dBFS | Soft low string pluck, a tiny snap   |

Rules:

- **Loudness:** `interrupt` is the loudest, `cast-self` the quietest, and no
  peak goes above −1 dBFS after encoding.
- **No clicks:** every sound fades in and out over 5 ms.
- **Interrupt is the only harsh sound.** Interrupts are where skill play
  lives; nothing else may sound like one. `cast-target` is the only one with
  ticks, so the interrupt cue is unmistakable.
- **Nothing pitched repeats fast.** The hits have almost no pitch, because
  they fire many times a second in a team fight.
- **Budget:** at most 10 KB each and 48 KB for the set, as mono MP3 at
  22.05 kHz, 48 kbit/s. MP3 because every browser's Web Audio decodes it.
- **Exactly one file per id** in `apps/web/src/audio/sound-ids.ts`. An asset
  nobody plays is dead weight.
- **Synthesised, never sampled.** All generated by `scripts/assets/sfx.sh`
  (sox and ffmpeg, both in devenv) into `apps/web/public/sfx/`,
  byte-identical on re-run. Change the script and re-run; never hand-edit an
  output file.

Play them through Web Audio with each buffer decoded once at load, not through
`<audio>` elements: a hit must start within a frame of the damage number.
