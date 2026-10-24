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
| `heal`        | `#7ee787` | Health gained, health bar                |
| `damage`      | `#ff7b72` | Health lost                              |
| `condition`   | `#ffa657` | Condition markers                        |
| `hex`         | `#d2a8ff` | Hex markers                              |
| `enchantment` | `#56d4dd` | Enchantment markers                      |

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

The status plates differ in outline as well as colour. Hex purple and
enchantment teal are close for a deuteranope (simulated ΔE ≈ 18); diamond
against square is not.

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

## Assets

All generated by `node scripts/assets/icons.mjs`, committed with the
generator. Never hand-edit an output file; change the script and re-run.

| Family     | Path                                |
| ---------- | ----------------------------------- |
| Profession | `apps/web/public/icons/profession/` |
| Skill type | `apps/web/public/icons/skill-type/` |
| Status     | `apps/web/public/icons/status/`     |

Each file is a flat SVG of 150–450 bytes with colours baked in, because Phaser
rasterises SVG textures without CSS. Load it in Phaser with
`this.load.svg(key, url, { width, height })` at the size you draw it, and in
HTML with a plain `<img>`.

Adding a status, profession or skill type: add one entry to the matching table
in the generator, re-run it, and add a row to this page.
