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

| Token         | Hex       | Use                              |
| ------------- | --------- | -------------------------------- |
| `bg`          | `#0e1116` | Arena floor, page background     |
| `grid`        | `#1a212c` | Arena grid                       |
| `panel`       | `#161b22` | HUD and menu panels, plate cuts  |
| `line`        | `#2b3440` | Hairlines, panel borders         |
| `wall-fill`   | `#202836` | Walls                            |
| `wall-stroke` | `#3b4759` | Wall edges                       |
| `ink`         | `#d7dee8` | Text, neutral icons              |
| `ink-dim`     | `#7d8899` | Secondary text                   |
| `dead`        | `#4a5464` | Corpses (hollow circle, no bars) |
| `edge`        | `#0b0f14` | Body outline, weapon-mark casing |

### Signals (arena)

| Token          | Hex       | Means                                    |
| -------------- | --------- | ---------------------------------------- |
| `target`       | `#ffd866` | Your current target (ring, nothing else) |
| `friend`       | `#59c2ff` | You and your team                        |
| `foe`          | `#ff7b72` | The other team                           |
| `heal`         | `#7ee787` | Health gained, arena health bar          |
| `damage`       | `#ff7b72` | Health lost                              |
| `condition`    | `#ffa657` | Condition markers                        |
| `hex`          | `#d2a8ff` | Hex markers                              |
| `enchantment`  | `#56d4dd` | Enchantment markers                      |
| `stance`       | `#f778ba` | Stance markers                           |
| `preparation`  | `#e3b341` | Preparation markers                      |
| `glyph`        | `#c3e88d` | Glyph markers                            |
| `weapon-spell` | `#8b9cff` | Weapon spell markers                     |

### HUD bars

The health and energy bars in the match HUD and the Training Ground carry
their numbers in `ink` text, centred over a fill that may be full or nearly
empty. The fill is therefore a dark shade of its signal colour, so the text
reads on the fill and on the empty track alike.

| Token                 | Hex       | Use                                         | `ink` on it |
| --------------------- | --------- | ------------------------------------------- | ----------- |
| `hud-health`          | `#3a6a3e` | Health bar fill                             | 4.7:1       |
| `hud-health-hex`      | `#7a3a7a` | Health bar fill under a health-draining hex | 5.7:1       |
| `hud-health-poison`   | `#66601e` | Health bar fill while poisoned or diseased  | 4.8:1       |
| `hud-health-bleeding` | `#8c4a42` | Health bar fill while bleeding              | 4.9:1       |
| `hud-energy`          | `#2f6787` | Energy bar fill                             | 4.6:1       |

A health bar, yours and the target frame's, takes the tint of the worst
degeneration on its combatant (#807), as GW1: a hex that drains health,
then poison or disease, then bleeding; never a blend. Burning, and a hex
that drains only energy, tint nothing. The deep-wound band is drawn over
any tint, and a corpse is never tinted. The tint is never the only signal:
the status icons and the pips say it too.

### Effects monitor

Your statuses in the match HUD (#834), after the bars, in the order they
were applied: oldest left, a refresh moves to the end. They wrap to a
second row, never `+N`, and with none the monitor takes no room.

| Part         | Look                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------ |
| Icon         | The status SVG at 24 px, plate and glyph as in the arena                                                     |
| Duration bar | 3 px under the icon, as wide as it, `ink-dim` on `bg`, draining to empty; none for a status with no duration |
| Yours tick   | A 6 px `ink` square edged in `bg`, over the icon's top-right corner: an enchantment you cast                 |

No seconds on the icon, as GW1: the hover says the name, the category,
what it does, who it is from and the whole seconds left.

### HUD layout

The match HUD sits as GW1's does (#1042): what you look at in the fight
is at the screen's two centres, and the arena between them is clear.

```text
 now-playing        [ scoreboard: score · clock · enemies ]        controls
                    [ target frame, effects growing down   ]        ally-watch

                               (arena)

 chat               [ hint / message                       ]
                    [ your effects, growing up             ]
                    [ morale · gear                        ]
                    [ health                               ]
                    [ energy                               ]
                    [ skill bar                            ]
```

Your bars are as wide as the skill bar. The left edge under now-playing
stays free for a party window (#486).

### Target frame

The match HUD's target frame (#484) is three rows of fixed size, so the
HUD never jumps when a row has nothing to show, and one under them that
grows downward:

| Row     | Shows                                                                                                     |
| ------- | --------------------------------------------------------------------------------------------------------- |
| Header  | Profession icons, the name in `ink`, the "attacking" swords                                               |
| Health  | A `hud-health` bar labelled with the percentage, rounded down; `412 / 480` added for you and allies       |
| Cast    | While the target casts: the type badge, the skill's name, and a 6 px bar filling in `ink`, never blue     |
| Effects | The target's statuses as your effects monitor shows them, at 16 px with a 4 px tick; none, no room (#835) |

A foe shows the percentage alone, as GW1 shows a foe's bar alone. A dead
target has an empty track edged in `dead`. An interrupted cast keeps the
row for 400 ms with a `damage` ✕ and edge, a cancelled one dimmed, as the
skill slot does (#300). Armor is in the frame's hover title.

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

| Thing        | Shape                                                 |
| ------------ | ----------------------------------------------------- |
| Actor        | Filled circle in team colour                          |
| You          | Your team's circle plus an `ink` rim, 2 px inside     |
| Target       | `target` ring, 9 px outside the actor                 |
| Dead         | Hollow `dead` circle, no bars                         |
| Cast         | Bar above the health bar, fills as the cast completes |
| Condition    | Circle plate, glyph inside                            |
| Hex          | Diamond plate, glyph inside                           |
| Enchantment  | Rounded-square plate, glyph inside                    |
| Stance       | Pentagon plate, point up, glyph inside                |
| Preparation  | Triangle plate, point up, glyph inside                |
| Glyph        | Triangle plate, point down, glyph inside              |
| Shout        | `ink` hexagon plate, glyph inside                     |
| Chant        | `ink` banner plate, notched at the foot, glyph inside |
| Weapon spell | Shield plate, glyph inside                            |
| Skill effect | `ink-dim` wide capsule plate, glyph inside            |
| Area flash   | Caster's team colour ring at the area's true radius   |
| Swing flash  | Attacker's team colour arc between it and its target  |
| Projectile   | Weapon silhouette, tinted the shooter's team colour   |
| Weapon mark  | `ink` weapon held in the hands, one shape per weapon  |
| Walk marker  | `ink` cross of four ticks where you clicked the floor |
| Called foe   | `condition` chevron pointing down, over its name      |
| Ping         | `friend` pin on the spot, a `friend` ring growing off |
| Watched ally | Four `ink` corner brackets round the body             |

The status plates differ in outline as well as colour. Hex purple and
enchantment teal are close for a deuteranope (simulated ΔE ≈ 18); diamond
against square is not. The stance pentagon (pink, point up) differs from all
three by its outline; its pink sits next to `foe` red, but a plate is never
an actor, so the shape settles it.

| Stance status | Glyph                                          |
| ------------- | ---------------------------------------------- |
| `sprint`      | Two forward chevrons: move 25% faster          |
| `dash`        | Arrowhead trailing three lines: run 50% faster |

The preparation triangle (amber, point up) is the fifth outline. Its amber
sits near `target` yellow, but a plate is never a ring round an actor.

| Preparation status | Glyph                                        |
| ------------------ | -------------------------------------------- |
| `apply-poison`     | One drop: your attacks poison (Apply Poison) |

The glyph triangle (lime, point down) is the preparation's turned over:
one readies your attacks, the other your next spells. Its lime sits near
`heal` green, but a plate is never a bar.

| Glyph status             | Glyph                                     |
| ------------------------ | ----------------------------------------- |
| `glyph-of-lesser-energy` | A bolt: your next spells cost less energy |

The chant banner (`ink`, notched at the foot) is the shout's hexagon's
kin: both are the Paragon's voice, in `ink`, told apart by outline. The
weapon-spell shield (periwinkle) is the eighth outline; its periwinkle
sits near hex purple, but the shield against the diamond settles it.

| Chant or weapon spell status | Glyph                                         |
| ---------------------------- | --------------------------------------------- |
| `anthem-of-flame`            | A flame: your next attack skill burns         |
| `weapon-of-warding`          | A sword held up: warded until its bearer hits |

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
hugs one actor (9 px outside a radius of 14). The flash is team-coloured,
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

### Walk marker

Where you click the floor to walk (#310), the scene marks the spot:

- **Four short `ink` ticks in an ×**, at 45°, 135°, 225° and 315°. Each runs
  from 3 to 8 units out from the click point, and the centre stays open.
  Drawn in code, cased like the weapon mark: a 4 px `edge` casing first, then
  a 2 px `ink` core, butt ends.
- **It fades from full to zero alpha over 400 ms**, then is removed. A new
  click removes the old marker at once, so there is only ever one. It shows
  even when the walk is cut short or ends at the nearest reachable point.
- **It is drawn under the actors**, with the area flash, so it never hides a
  body, a bar or a plate.
- **Only you see it.** It is client-only, so it is `ink`, the colour of "you"
  (your rim, your weapon mark), never a team colour.
- **Reduced motion:** held at full alpha for 400 ms, then removed.

Why not a ring: every ring on the floor already means something. A
team-coloured ring that fades in 0.4 s is the area flash, a yellow ring is
your target, and a small ink ring beside a body is a focus. An × of ticks
is the only shape here that is a point, not a thing, and the open centre
shows exactly where you clicked.

### Calls, pings and the watched ally

A wheel click calls a foe for your team, pings the ground, or watches an
ally (#443). Each has a shape nothing else in the arena has, so none can be
taken for the target ring, the off-hand focus or the area flash.

- **The called foe** wears a chevron pointing down at it, its tip 4 px
  above the name label's top, so it clears the name at every zoom. The two arms are 6
  units wide and 6 tall, a 3 px `condition` core on a 5 px `edge` casing.
  `condition` because a call says "hurt this one", and orange is the
  colour of what hurts; it is over the body, where no plate ever sits. Your
  team sees it, you included; the other team never does. It goes when the
  foe dies or leaves, or your team calls another.
- **A ping** is a `friend` pin standing 14 units tall on the spot: a 2 px
  needle on a 4 px `edge` casing, and a 3.5-unit head with an `edge` rim.
  Round it, a 2 px `friend` ring grows from 6 to 26 units and fades out
  over the ping's 2.6 s. The area flash is a ring at the area's true
  radius, fading in 0.4 s, with nothing standing in it; a ping is small,
  slow, and has its pin. Under the actors, as the walk marker is. Reduced
  motion: the ring holds at 6 units, whole, until the ping goes.
- **The watched ally** gets four `ink` corner brackets, a square r + 13
  out, each arm 5 units, 2 px on a 4 px `edge` casing. Open at the middle
  of every side, it is never a ring: not the target ring, not the focus.
  Only you see it, so it is `ink`, the colour of "you". A corner panel
  shows the ally's name and health.

### Damage and heal numbers

Above a body, the column is already full: the health bar at r + 8 … r + 12,
the cast bar at r + 15 … r + 19, the name with its bottom 3 px over that. A
number that starts on the bar and rises through the name hides both, and the
name it hides is your target's.

- **Numbers, names and the status `+N` keep their size on screen** at
  every zoom step and window size (#456), as GW1's do: 11 px, 13 px for a
  skill's number, 17 px for a critical hit. Their rise, their stacking and
  the gaps that place them are screen px too; the bodies, bars, icons and
  rings they sit by scale with the world. Zoomed out, a name is wider than
  the world between two bodies, so names overlap sooner: another reason
  only the target's and the hovered body's show.

- **They rise beside the body, not over it.** Left-aligned at x = r + 4 to
  the right of the centre, clear of the 34-px bar, with the first line's
  bottom at y = 8 below the centre.
- **They rise straight up, 24 px a second for 1.2 s**, so at full zoom a
  single number ends with its top at 34 above the centre, still under the name.
- **Numbers landing together stack a line apart, upward, at most four** (#54).
  A second line reaches the name's band late in its rise, so a burst may
  brush the name for a moment; a single hit, the common case, never does.
- **Every number wears a 3 px `edge` outline**, stroke under fill (in
  Phaser: `stroke: "#0b0f14", strokeThickness: 3`). In melee the attacker
  stands where the target's numbers rise, so they cross their body, bar and
  name. Plain, they are 1.0 to 1.9:1 there: a heal over a full health bar is
  the bar's own green and vanishes. On the outline they are 7.6:1 (damage)
  and 12.5:1 (heal), whatever lies under them. Weapon hits keep their 0.8
  alpha, outline included. `node scripts/assets/number-outline-study.mjs`
  draws the study below.

![Number outline study](number-outline-study.svg)

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

**How a shot ends.** When a shot leaves the state, its sprite does not pop
out. It holds at the end of its flight, its aim point, and fades from full
to zero alpha over 120 ms, as the swing flash does. A shot cut short by a
wall (#215) ends at the wall's face, so the arrow is seen to stop on the
stone; a dodged shot ends where its target was. Both are the same fade:
the damage number, or its absence, says which. Under reduced motion it is
removed at once.

### Player mark

The body is a circle at the collision radius, r = 14 (#166). Everything on
it is drawn in code. `node scripts/assets/player-mark.mjs` draws the
reference sheet [`player-mark.svg`](player-mark.svg) at true size and at 4×,
off-hands included.

![Player mark reference sheet](player-mark.svg)

Outward from the centre:

| Ring     | Radius           | Style                                |
| -------- | ---------------- | ------------------------------------ |
| Body     | 0 … r            | Team colour fill                     |
| Edge     | r − 1.5 … r      | 1.5 px `edge` `#0b0f14`, living only |
| Self rim | r − 3 … r − 1    | 2 px `ink`, your own body only       |
| Off-hand | r … r + 7        | See below, living only, left side    |
| Weapon   | centre … r + 7.5 | See below, living only               |
| Target   | r + 8 … r + 10   | 2 px `target`, your target only      |

**The target ring sits at r + 9** (operator, Q26), its 2 px stroke from
r + 8 to r + 10, so nothing on the body reaches it: the weapon mark stops at
r + 7.5 and the off-hand mark inside r + 7. It is still drawn last. Its top
passes under the health bar (r + 8 … r + 12 above the centre) and its bottom
under the first status plate (from r + 6 below), both drawn over it; the
sides, where you look for it, stay clear.

**The weapon mark** (#188, #418) is the weapon held in the hands: one
silhouette for each of the 14 weapons. The shapes are data in
`apps/web/src/render/weapon-mark-geometry.ts`, in the body's local frame
(+x is the facing, +y the right hand, r = 14); the renderer, this sheet
(`node scripts/assets/player-mark.mjs`) and later the icons all read that
one file. Every point stays within **r + 5.5** of the centre; the 4 px casing
then ends by r + 7.5, short of the target ring. Strokes are 4 px `edge` under
2 px `ink`; filled shapes get the same casing and an `ink` fill; a bow's
string is the only thin line, 3 px `edge` under 1 px `ink`. Ends are butt,
because Phaser Graphics strokes have no caps. `ink` alone vanishes over the
bright body (1.5:1 on `friend`, 1.9:1 on `foe`); the casing is 9.7:1 and 7.6:1.

Where it is held:

- **One-handed** (sword, axe, spear, wand): gripped on the **right** rim, about
  9 units right of the centre, pointing forward. The off-hand is on the left,
  so a loadout reads as left hand plus right hand.
- **Two-handed**: bows are held across the front with a string; daggers are a
  short blade in each hand; hammer, scythe, staff and spear are long hafts across the
  body. Spear, scythe and staff butts poke out behind the body, a length cue
  (operator Q52).
- **Unarmed**: two fists at the front rim, so a bare-handed player still shows
  a facing.

| Weapon      | Grip | Shape (local frame, world units)                                           |
| ----------- | ---- | -------------------------------------------------------------------------- |
| unarmed     | –    | two 12-gon discs, r 2.4, at (11.5, ±7.5)                                   |
| sword       | 1H   | blade (1, 9)→(16, 9); crossguard (5, 6)→(5, 12)                            |
| axe         | 1H   | haft (1, 9)→(15, 9); head turned inward, a five-point polygon to (17, 5.5) |
| spear       | 1H   | shaft (−15, 7.5)→(12.5, 7.5); leaf head to (17.9, 7.5)                     |
| wand        | 1H   | stick (4, 9)→(12.5, 9); four-point star, outer 3, at (14.3, 8.2)           |
| hammer      | 2H   | haft (−8, 6.8)→(11.5, 6.8); block head (11.5…16, 2.4…11)                   |
| scythe      | 2H   | haft (−14, 9)→(12.5, 9); crescent blade sweeping out to the left           |
| daggers     | 2H   | a blade (5, ±9)→(15, ±9) with a guard at x = 7.5, in each hand             |
| staff       | 2H   | diagonal pole (−12, 10.2)→(13.2, 5.8); orb r 2.9 at (15.2, 5.4)            |
| shortbow    | 2H   | limb x = 17.5 − 5.5·(y/6)², y ±6: the smallest span                        |
| longbow     | 2H   | limb x = 17 − 5.5·(y/11)², y ±11: the widest span                          |
| flatbow     | 2H   | straight limbs from (12, ±9.5) to a flat grip at x = 16.5                  |
| recurve-bow | 2H   | limb x = 16.5 − 4.5·(y/7)², tips flicking forward to (13.8, ±9.6)          |
| hornbow     | 2H   | two humps with a dip at the grip, tips at (13.4, ±10)                      |

The five bows differ by span and limb shape, which matches how their ranges
differ. The string runs from one limb tip to (tip.x − 1.5, 0) to the other.
The exact numbers are in the geometry file; the table is the summary.

Why not the first draft: the first mark was a line from the centre with a
small tip at r + 3. Six families covered 14 weapons, the tip lived in a
3-unit band, and the centre-line read as a facing arrow rather than a weapon
in a hand; unarmed drew nothing, so its facing was invisible. Before that, a
symmetric axe wedge and a dagger V at the line end read as an arrowhead and a
fletching, and tips running to r + 7 cut through the target ring.

In Phaser: one `beginPath`, the strokes and fill outlines as
`moveTo`/`lineTo`, one `strokePath` for the casing and one for the core, one
`fillPoints` per fill, plus one thin pass over the strings for bows.

**The off-hand mark** (#275) sits on the off-hand side, the left of the
facing (in screen coordinates, y down: facing angle − 90°), the side the axe
head already hangs on. It is cased like the weapon mark, `edge` under `ink`,
so it reads over the floor and over a neighbour's body: `ink` on `edge` is
14.2:1, and the casing is 9.7:1 on `friend` and 7.6:1 on `foe`.

| Off-hand | Geometry (world units, angles from the facing, toward the left)                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| shield   | arc on the body's centre, radius r + 3.5, from 45° to 105°; 5 px `edge` casing (r + 1 … r + 6) under a 3 px `ink` core; butt ends     |
| focus    | ring of radius 1.75, centred at r + 3.5 and 75°; 3 px `edge` casing under a 1.5 px `ink` core; r + 0.25 … r + 6.75, hole shows `edge` |
| none     | nothing: no off-hand equipped, or a two-handed weapon                                                                                 |

Why it reads, and what it is not:

- **Clear of the weapon.** One-handed weapons sit on the right, and the
  off-hand only exists with them, so the two never share a side. Rows 6 and 7
  of the sheet put every one-handed weapon beside each off-hand.
- **Shield and focus differ by shape and size**: a 60° band hugging the body
  against a 5 px ring just off it. At true size the focus reads as a
  bright dot, the shield as a bracket.
- **Not a second weapon.** Nothing runs from the centre, so two sticks
  never appear.
- **Not the swing flash**, which is a 2 px team-coloured arc at r + 6,
  centred on the facing, spanning ±45°, and fades in 120 ms. The shield is
  `ink`, standing, and begins where the flash ends.
- **Not a status, area flash or self rim.** Statuses are plates under the
  body; the area flash is a team-coloured ring at 40 units or more; the self
  rim is inside the body. The off-hand is `ink`, partial and outside.
- **Draw order**: body, edge, self rim, off-hand, weapon mark, target ring.
  In Phaser the shield is one `arc` path stroked twice, the focus one
  `strokeCircle` per colour: two calls per actor.

### Weapon motion

Every auto-attack plays on the held weapon mark (#536). The motion is a
_pose_ on the shipped geometry: it turns and moves the mark about a pivot,
scales one accent, flexes a bow. It adds no shape but a nocked arrow while a
bow is drawn. Poses and timings are data in
`apps/web/src/render/weapon-pose.ts`; `node scripts/assets/weapon-motion.mjs`
draws [`weapon-motion.svg`](weapon-motion.svg) from `weaponPose()` itself, so
the sheet cannot drift from the game. Each row is one weapon at 4×: rest,
half wind, full wind, half strike, hit, early and late recovery.

![Weapon motion reference sheet](weapon-motion.svg)

- **Four phases.** Wind-up (the weapon cocks back, `easeInOut`), strike
  (`easeOutCubic`, so it arrives fast and stops on the hit), hold (a beat on
  impact, for the axe and hammer) and recovery (`easeInOut` back to rest).
  Their sum fits inside the attack interval, so two swings never overlap and
  the mark rests between them.
- **The strike ends exactly on the hit** for melee and on the release for
  ranged weapons: the pose at the hit is the sheet's "hit" column. The
  pose follows the host's swing timer (#560), so the first swing winds up
  too, and one cut short eases back to rest. An attack skill winds up over
  its whole activation instead, on the host's cast timer (#562): rest at
  the cast's start, the strike's start at its end. A bow's release is the
  end of the activation, not the arrow appearing.
- **The wind-up is a tell.** A defender should read it: the hammer's 0.55 s
  lift and the longbow's 0.85 s draw are slow on purpose (operator,
  2026-10-25). A quick weapon (daggers 0.16 s, unarmed 0.22 s) gives
  almost none.
- **Never past r + 5.5.** The dashed circle on the sheet is the limit; the
  4 px casing then ends by r + 7.5, short of the target ring (yellow), as
  for the static mark. A pose that crosses it is a bug in `weapon-pose.ts`.
- **The swing flash stays.** The arc at r + 6 still marks the hit for
  everyone; the weapon motion adds to it, it does not replace it.
- **Fists and daggers alternate hands.** A double strike (#561) stabs
  with both: the off hand lands 90 ms after the main hand, and the next
  swing is the main hand's again. The host says which swings struck twice
  only on the hit, so the off hand's wind-up and strike fit in those 90 ms.
  A thrown spear is gone from release until halfway through recovery, then
  slides back in and fades.
- **Reduced motion.** Every mark stays at rest, as the swing flash does:
  the damage number reports the hit, so the motion is decoration.

### Profession in the arena

Decided (Q25, Q29, Q32): placement **A**. The primary glyph shows at 11 px
in `ink` before the name, and hides with it. The target panel shows the
primary and the secondary in their profession colours (#281).

**Profession icons have no painted cuts.** The scene draws them with a tint
fill, which paints every opaque pixel `ink`. So the necromancer's eye and
the elementalist's split are transparent holes (fill-rule evenodd), not
`panel`-coloured shapes on top. A painted cut would vanish and leave a plain
triangle and a plain diamond. Every other icon family keeps its plates and
plate-coloured cuts, because they are never tinted.

The study that chose A, `node
scripts/assets/profession-badge-study.mjs` draws three placements of the
existing profession glyphs, all in `ink`, because in the arena colour means
team:

![Profession badge study](profession-badge-study.svg)

- **A: the primary, 11 px, before the name.** All ten read at true size.
- **B: A, plus the secondary at 8 px in dim ink.** The secondary is mush at
  that size; at 11 px the name plate doubles in width over a 34 px bar.
- **C: the primary on the body.** At full ink under the weapon mark (#188),
  the line runs across a plate as loud as itself, so neither reads. That was
  true of a full-ink plate; B of the body study below fixes it.

It recommended A, with the pair in the target panel, where there is room
and the profession colours are allowed.

#### The glyph inside the body

Decided (Q104, Q105): option **B** of the body study. Players on the map
were hard to tell apart with the glyph only before a name that hides, so
every body also shows its primary profession's glyph inside its circle
(#1037):

- **13 world units** square, centred on the body (radius 14), **upright**: it
  never turns with facing. World sized, so it scales with the body at every
  zoom.
- Painted in `edge` at **60 %**: a dark mark on the team colour, never the
  profession colour. The self rim stays over it.
- **Under** the off-hand and weapon marks. The scene draws in layers, bottom
  up: bodies, body glyphs, every mark on a body (off-hand, weapon, target
  ring, call chevron, watch brackets, bars), then shots, status icons, names
  and numbers. So in a clump a neighbour's weapon crosses your body: the
  weapon is the more urgent read.
- **A corpse**: the glyph in `dead` at full opacity, same size, inside the
  hollow circle, so you can tell whom to resurrect or exploit.
- **Knocked down**: centred, upright, scaled by the lying width (0.55, about
  7 units), so it stays inside the flattened disc.
- No profession: no glyph, as the name plate does.

B works where C did not because the glyph is a 60 % shadow under the
weapon, not a full-ink plate beside it: the weapon line keeps its contrast
across it, and the glyph still reads round it.

`node scripts/assets/profession-body-study.mjs` draws the three options at
the four camera zooms: A, 9 units in full `edge`; B, 13 units at 60 %; C,
a fixed 11 screen px, which crosses every weapon at Wide.

![Profession body study](profession-body-study.svg)

### Name labels (study, not decided)

Every body carries its name, 11 px and centred, so two bodies a name's
width apart already collide, and a team fight smears names over the bars.
Issue #253 proposes names only on your target and the body under the cursor,
with Alt showing them all. `node scripts/assets/name-label-study.mjs` draws
the same 8v8 clump both ways:

![Name label study](name-label-study.svg)

### Weapon and off-hand icons

The pickers and the target frame (#419) show a weapon or off-hand as its arena
mark, turned to point up and fitted to the 24 grid, so what you pick is what
you spot in the fight. Drawn from the same geometry as the arena
(`weapon-mark-geometry.ts`): a 2-unit `ink` core (2.3 px at 28 px) in a
3.6-unit `edge` casing, bow strings in the thin 1-unit weight, filled heads
cased thinner. No body disc. Unarmed is the two fists. The shield is its arc
and the focus its ring, scaled up (the ring in the same weight, or its hole
closes). Ink, never team colour: an icon in a menu names a thing, not a side.

### Skill type badges

The corner badge on a skill slot. Ink on the slot, except the two that leave a
marker on someone, which carry that marker's colour. A stance marks you, so
it carries the stance colour too, a preparation its amber, a glyph its
lime and a weapon spell its periwinkle.

| Type         | Badge                     |
| ------------ | ------------------------- |
| Attack       | Blade                     |
| Spell        | Four-point star           |
| Enchantment  | Solid teal ring           |
| Hex          | Broken purple ring        |
| Stance       | Pink pentagon ring        |
| Preparation  | Amber triangle ring       |
| Glyph        | Lime triangle ring, down  |
| Weapon Spell | Periwinkle shield ring    |
| Signet       | Ring with a seal on top   |
| Shout        | Mouth and two sound waves |
| Chant        | A note                    |
| Skill        | Square                    |

### Skill icons

One icon per implemented skill (#719), on the 24 grid, in
`apps/web/public/icons/skill/<skill-id>.svg`. The approved study is
`skill-icon-study.svg` (`scripts/assets/skill-icon-study.mjs`).

An icon is a **profession plate**, **one glyph** and an optional **modifier**.
The type badge (the table above) and the elite frame are drawn by the UI around
it, not baked in, so one file serves every screen.

| Layer    | Carries         | Rule                                                                       |
| -------- | --------------- | -------------------------------------------------------------------------- |
| Plate    | Profession      | Rounded square, the profession colour at 30% over `plate`, a 1 unit rim    |
|          |                 | in full, its silhouette as a 20% watermark                                 |
| Glyph    | Primary effect  | One shape from the table below, `ink` with a `bg` casing, in the box 3..21 |
| Modifier | How it bends it | Bottom right, on a dark disc, `ink`: up, down, less, area, clock, stun,    |
|          |                 | bleed, self, bolt, half, plus                                              |

- **Shape first.** Glyph and modifier are `ink` only; the plate's hue is
  decoration, so every icon reads with the colour taken out.
- **Every skill is its own picture.** A row in `scripts/assets/skill-icon-table.mjs`
  names a skill's glyph and modifier, and a test fails if two rows match. Start
  from the glyph for the skill's primary effect; the modifier tells apart the
  ones that share it (heal, energy and armor repeat).
- **The glyph leaves the plate showing** and keeps clear of the bottom right
  corner, which the modifier owns.
- **Sizes.** 48 px on the combat bar and in the build editor, 24 px in library
  rows, 20 px inline, 16 px the floor.
- **Unknown skill id.** A bare plate with no glyph (`unknown.svg`).
- **Glyph vocabulary** (grows by effect, not by skill): heal, fireball (comet),
  axe, sword, hammer, spear, arrow, volley, interrupt (burst), speed (chevrons
  right), slow (chevrons left), dash, energy (bolt), mountain (earth), cleanse
  (drop, struck through), armor (shield), flask, flame, trident, hawk, rock,
  arrow-burst, arrow-pierce, arrow-flame, crescent (shadow), armor-half (a
  half-filled shield), eye, blade-cleanse, blade-hook, blade-shards, hilt,
  banner-note. A new primary effect adds a glyph; a new skill adds a row.

### Skill slot states

A skill slot says what its cast is doing (#300). Every state is one 2 px ring
_inset_ in the slot, so it is never confused with the ready flash's outer ring
and the layout never moves. It sits above the recharge wipe and under the
hotkey.

| State          | Ring              | Content                   | Glyph        | Time                  |
| -------------- | ----------------- | ------------------------- | ------------ | --------------------- |
| `casting`      | `ink`, pulsing    | as is                     | none         | while it casts        |
| `interrupted`  | `damage`, steady  | 0.6 alpha                 | `damage` `✕` | 400 ms                |
| `cancelled`    | `ink-dim`, steady | 0.6 alpha                 | none         | 400 ms                |
| `cast fill`    | as `casting`      | `ink` 18% from the bottom | none         | while it casts        |
| `out of range` | none              | as is                     | `ink` `↔`    | while it cannot reach |

- **Casting** pulses its opacity from 0.65 to 1 over 700 ms. Under reduced
  motion the ring is steady.
- **Both failures dim the slot**, because the cast did not go off. They
  differ by ring colour _and_ by the glyph, so an interrupt reads without
  colour (#75). Never the recharge shade: a cancelled skill does not
  recharge.
- **Casting fills the slot** (#485): `ink` at 18% alpha rises from the bottom
  as the cast goes, under the ring and over nothing else, and goes the frame
  the cast does. It is not the recharge wipe, which is a dark clock sweep.
  It moves under reduced motion too: it is information, not decoration.
- **Out of range** (#485): with a target selected, a slot whose skill cannot
  reach it (too far, or a wall in the way) shows a `↔` in `ink` after its cost,
  which stays as it is: a struck cost would read as unaffordable. In the
  Training Ground row, which shows no cost, the `↔` follows the name. A shape, never only a colour, and a hint, not a gate:
  it combines with the unaffordable dimming.
- **The `✕` must win at a glance.** On the HUD it is about half the slot's
  height (1.9rem), centred over the name and cased in `bg`. In the Training
  Ground row it sits at the right end, at row height.

### Elite frame

An elite skill (#459) wears a **doubled** frame in `elite` `#d4a72c`, 3 px
(`border: double`), wherever a skill is drawn: HUD slot, Training Ground
row, build-editor slot, library box and tooltip. Doubled rather than only
gold, so it reads in greyscale (#78). It is the slot's border, so the
state rings above sit inside it; a negative margin keeps the slot's size.
Gold is `elite` only, not `target` (`#ffd866`), which stays in the arena.

### UI controls

Buttons and indicators in the HUD and menus. Ink on the panel. The states of one control
differ by shape, so the icon shows the current state at a glance.

| Icon        | Means                  | Shape                          |
| ----------- | ---------------------- | ------------------------------ |
| `sound-on`  | Sound is on            | Speaker, two waves             |
| `sound-off` | Sound is muted         | Speaker, a cross               |
| `music-on`  | Music is on            | Beamed eighth notes            |
| `music-off` | Music is muted         | The notes under a slash        |
| `attacking` | You are auto-attacking | Two crossed swords, guards low |

`attacking` has two blades, so at 16 px it never reads as the one-sword
`attack` skill type badge.

UI text is sentence case: "Edit team", "New character", "Save". A small
uppercase field label is styled so by CSS; the words themselves stay sentence case.

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
| Skill      | `apps/web/public/icons/skill/`      |
| Status     | `apps/web/public/icons/status/`     |
| UI         | `apps/web/public/icons/ui/`         |
| Projectile | `apps/web/public/icons/projectile/` |
| Weapon     | `apps/web/public/icons/weapon/`     |
| Off-hand   | `apps/web/public/icons/offhand/`    |

Each file is a flat SVG of 150–1,200 bytes with colours baked in, because Phaser
rasterises SVG textures without CSS. Projectiles are the one exception: white,
for the scene to tint. Load it in Phaser with
`this.load.svg(key, url, { width, height })` at the size you draw it (24×24
for icons, 32×12 for projectiles), and in HTML with a plain `<img>`.

Adding a skill: add its row to `scripts/assets/skill-icon-table.mjs` and re-run.
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

## Music

Music is mood; sound effects are information. A player must never mistake a
musical note for a cue, and must never lose a cue under the music. The music
is Strudel source we write (`apps/web/src/music/tracks/<id>.strudel.js`), one
file per track, played by the music host and driven by the game's intensity
(epic #366). Everything here serves one idea: the soundtrack of a Guild Wars
fight, orchestral, Celtic and medieval, small enough to load over a LAN.

**Evoke, never copy.** No melody, progression or motif from any existing
score, and no place names from the game that inspired this one.

### Palette

Every sound a track plays is either one of Strudel's built-in oscillators or
a key of `apps/web/public/music/samples/strudel.json`. Nothing else, and
nothing from a CDN. The allowed set is exactly that file plus the built-ins,
so there is no second list to drift.

| Voice                | How it is made                                              |
| -------------------- | ----------------------------------------------------------- |
| Strings (sustained)  | `supersaw`, 2–3 voices, slow attack, low-pass that opens    |
| Strings (pizzicato)  | `pizz` samples                                              |
| Cello, low brass     | `sawtooth` with a low-pass envelope (`lpenv`, `lpa`, `lpd`) |
| Horn, brass stabs    | `sawtooth`, faster envelope, `lpf` 1–1.5 kHz                |
| Choir "ah"/"oh"      | `sawtooth` through `.vowel("a")`                            |
| Sub, bass            | `sine`, `triangle`                                          |
| Harp, lute           | `harp`, `strum` samples                                     |
| Flute, tin whistle   | `recorder`, `whistle` samples                               |
| Timpani, war drum    | `timp`, `taiko` samples                                     |
| Hand drum, snare     | `frame`, `snare` samples                                    |
| Bells, metal, cymbal | `bells`, `anvil`, `gong`, `crash`, `swell` samples          |

Samples are cut from VCSL (CC0) by `scripts/assets/music-palette.sh` into mono
MP3, 32 kHz, 40 kbit/s. The set is about 0.55 MB; the budget is 3 MB. Licences
are in `apps/web/public/music/samples/LICENSES.md`. A map of pitched samples
has note-name keys; unpitched hits are arrays (`s("taiko:1")`). A key with
`#` in it is stored as `s` in the file name, because `#` starts a URL fragment.
The host must pass the base URL itself (`samples(map, base)`, with a trailing
slash): Strudel does not derive it from the map's URL.

### Loudness

- Music sits **under** the sound effects. Target **−18 LUFS integrated** at
  intensity 2 (or the top level of a track with fewer layers), true peak
  below −5 dBFS, before the host's music bus.
- Measured on an offline render of eight cycles: layers rise by 1–3 LU per
  level, so a fight sounds bigger without getting louder than a cue.
- The checker's summed gain of everything sounding at once stays at or below
  2 at every level (provisional, #508), and is a pessimistic bound, not a
  loudness. Keep one `.postgain()` per track.
- The checker also prices what the audio thread must do (#508): a DSP cost per
  level, at most 90 (provisional). A supersaw costs its `unison` voices, a
  `vowel` five filters, and a chord pad is five notes that overlap their
  release with the next chord: prefer fewer notes, `unison(2)` and a
  `lpq` over `vowel`. `pnpm music:check <id>` names who sounds at the peak.
- Every track uses one reverb: `.room(x).roomsize(6).orbit(2)` on the wet
  voices, nothing else on orbit 2 (`MUSIC_ROOMS`). Orbit 1 is the default
  room.

### Never in the music

- A high double tick (that is `cast-target`).
- A broadband crack into a buzzy falling tone (that is `interrupt`).
- A short falling two-note blip (that is `refused`).
- Anything above 4 kHz that is loud and short. Highs are for air and bells.

### Moods

| Mood        | Sounds like                                               | Tracks                         |
| ----------- | --------------------------------------------------------- | ------------------------------ |
| atmospheric | Open fifths, flute over harp, long reverb                 | first-light, jungle-veil       |
| melancholy  | Low strings, sparse harp, minor, lots of air              | ashen-fields                   |
| adventurous | Horn call, striding bass, frame drum, tin whistle         | northern-pass                  |
| mysterious  | Odd-length phrases, pizzicato, breathy flute, drones      | jungle-veil, glass-dunes       |
| epic        | Choir, timpani, brass melody, big open voicings           | hall-of-champions, glass-dunes |
| action      | Driving drums, string ostinato in sixteenths, short brass | clash-of-banners, ember-deep   |
| tense       | Heartbeat sub, trembling strings, the filter opening      | last-stand                     |
| dark        | Low brass, anvil, a grinding ostinato, phrygian colour    | ember-deep, last-stand         |
| triumphant  | Brass chorale, choir, bells; noble, never cheesy          | victors-hymn                   |

### Intensity

`layer(n, pattern)` plays only while the director's intensity is at least `n`.
Level 0 is a finished, calm version of the track, not the track with holes.

| Level | In game  | A track adds                                         |
| ----- | -------- | ---------------------------------------------------- |
| 0     | calm     | The bed: pad, bass, a sparse lead                    |
| 1     | engaged  | Motion: harp or pizzicato ostinato, light percussion |
| 2     | fighting | Drums, brass, the full melody                        |
| 3     | peak     | War drums doubled, choir, filter fully open          |

A track declares `layers` = its highest level plus one. Continuous moves use
`INTENSITY`, e.g. `.lpf(ref(() => 600 + INTENSITY * 900))`.

### Writing a track

1. Pick an id (kebab-case), a key from the scales Strudel's tonal knows, a
   tempo, and a mood. Add the entry to `apps/web/src/music/tracks/manifest.json`.
   List in `colour` every pitch class the track uses on purpose outside its key.
2. The first line of code is `setcpm(bpm / 4)`, under a comment with the id,
   key, bpm and one line of intent.
3. Chords only via `chord("…").voicing()`, in jazz spellings (`Ab^9`, `Cm9`,
   `Cadd9`). Never `note("c'min9")`, never `.arp()`: index into the chord with
   `n("0 2 4").chord(P).voicing()`.
4. Scales with a name of two words use tonal's one-word alias in `.scale()`:
   `e5:spanish` is E phrygian dominant. `e5:phrygian dominant` fails silently.
5. No two tracks share a progression. Each is recognisable within four cycles.
6. Run the checker at every level, then render and measure. Fix anything that
   prints `[tonal] error` or `unknown chord`: the track loses a voice and
   still "passes".
7. Quotes in `.strudel.js` are deliberate: double quotes are mini-notation.
   Prettier does not touch these files.
