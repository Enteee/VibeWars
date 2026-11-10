# Visual style: the 2.5D world

How a map looks, and how to tell that it looks right. This page covers the
**world**: ground, walls, height, light, water, effects and things a player
walks up to. UI, HUD, icons and characters stay in
[`art-direction.md`](art-direction.md). Where the two disagree about the world,
this page wins.

The [2.5D layers section](art-direction.md#25d-graphic-layers-direction-d) of
`art-direction.md` owns the deck, ramp and occlusion drawing (direction D). It
is not restated here: read it for planes and the x-ray outline, read this for
everything that sits on or lights them.

The brief's language still holds (circles, lines, polygons, no painted art),
and so does the one rule: **a player reads a threat in a fraction of a second,
colour blind.** A look that fails that is wrong however good it is. Everything
here is our own, GW1-like in spirit only: no GW1 art, names or screenshots.

How to read the tables: **now** is what today's renderer does, with the file
that holds it. **Target** needs engine work first, so a map must not rely on
it.

## 1. Palette

A map uses a **biome**: a small set of base tones for ground and rock. Biomes
may vary the ground, never the signals.

| Biome   | Ground    | Rock      | Plant / earth                   |
| ------- | --------- | --------- | ------------------------------- |
| Hall    | `#26303f` | `#4b5a70` | none (stone and steel)          |
| Wilds   | `#2a3328` | `#5b5f58` | moss `#3f5a35`, earth `#5a4630` |
| Heights | `#26303f` | `#4b5a70` | none, decks `#a0b2c7`           |

**Signals are reserved for the fight** and no biome tone may sit within a
hand's width of them on the colour wheel:

| Meaning             | Hex                  | Where                                  |
| ------------------- | -------------------- | -------------------------------------- |
| Friend              | `#59c2ff`            | bodies, team marks only                |
| Foe                 | `#ff7b72`            | bodies, team marks only                |
| Danger (warm)       | `#ff8a3d`, `#ffd23d` | lava, fire, strike edges, damage zones |
| Poison (acid)       | `#7fbf2a`, `#c8f05a` | toxic fog, gas                         |
| Help (cool)         | `#3f9fe8`, `#9fdcff` | springs, clear water, healing          |
| Nature (calm green) | `#2f8a3c`, `#76c96f` | groves                                 |
| Magic (violet)      | `#a77bff`            | spires, drains, cold light             |

Environment **may never** be pure friend blue or foe red as a large fill, and
a harmless ground may never use danger orange or acid green. A map's rock,
wall and ground stay desaturated, so every signal colour is the loudest thing
on screen. Shallow water is `#8fb8d6` at 30 %, paler and greyer than a spring.

Colour never decides alone: danger is also **warm and pulsing**, help is
**cool and still**, and each zone kind has its own outline pattern (below).

## 2. Light

One sun for every map: **from the north-west (`directionDeg` 315)**, so every
shadow falls south-east, as the deck shadow already does. A map changes the
sun's height and colour, never its direction, so a player learns it once.

| Time of day | Ambient (colour, intensity) | Sun elevation, colour, intensity |
| ----------- | --------------------------- | -------------------------------- |
| Day         | `#b0bcd4`, 0.45             | 50°, `#fff1d6`, 0.55             |
| Dusk        | `#7f86a8`, 0.35             | 25°, `#ffb87a`, 0.5              |
| Indoor      | `#5a6688`, 0.30             | none (the sun skips `indoor`)    |

- **Falloff** is the model's radial quadratic, clipped by shadow polygons
  (ADR-0052). A light's `radius` is where it reaches zero.
- **Warm is fire, cold is magic.** Fire and torches: `#ff9040` (fire, radius
  150 to 260, flicker 0.35) and `#ffb060` (torch, radius 150, flicker 0.2).
  Magic: `#6fa8ff` or violet, radius 150, flicker 0 (it does not flutter).
- **How many.** A light per area, not per object: about one every 250 units
  across open ground, one on each door and lever, one per hearth. A map stays
  at 16 or fewer, half of `MAX_LIGHTS` (32), so zone glow fits.
- **Nothing that matters is darkened.** Bodies never below 0.7
  (`BODY_LIGHT_FLOOR`), surfaces never below 0.45 (`SURFACE_LIGHT_FLOOR`).
  Zones, telegraphs and hidden outlines are drawn after lighting, unlit.

Now: `lighting-pass.ts`, `lighting-model.ts`, the map's `lighting` block.

Worked example, a torch (`torch-light.svg`): a warm pool of radius 150 that
fades to the ambient, on a stand that carries it.

![torch light](visual-style/torch-light.svg)

Recipe (now): `{ colour: 0xffb060, radius: 150, intensity: 0.6, flicker: 0.2 }`,
`id` starting `torch-`, placed on the stand's `position`.

## 3. Shadow and height

- **The sun's shadow** is the footprint of what casts it, moved by the sun's
  offset (`sunShadowOffset`; at 50° and one layer of 56 units that is about
  47 units, south-east). Hard edge, no blur, 55 % `#080b10` on the ground.
- **A contact shadow**: every body, pillar and prop has a small offset shadow
  at 35 % black, 5 right and 6 down at body size.
- **A wall** is a shaded front face (28 units, 40 % darker) under a **lit top
  edge**, 2 lines wide, in the wall's lightest tone.
- **Height is told in this order:** the top is the lightest plane; its edge
  carries a bright lip; its front face is darker; its shadow lands on the
  ground. A **pit** is the reverse: the floor goes 45 % darker (`PIT_FLOOR`),
  and its rim carries the lip. A **ramp** shades
  15 % and carries a panel line every 24 units along its length, chevrons
  pointing up.
- **One step is 56 units** (`ELEVATION_STEP`). There is no in-between height
  except on a ramp.

Worked example, a rock wall (`rock-wall.svg`): irregular outline, noise fill,
a lit top edge, a darker front face, a shadow thrown south-east.

![rock wall](visual-style/rock-wall.svg)

Recipe (now): top `#2d3748`, front face `#1a212c`, lit edge `#a9bbd0` 2 lines
wide, outline `#0b0f14`; texture `noise` at about 0.06 cycles per unit, at 50 %.

## 4. Outline and texture

- **A body** has a 1.5 to 2.5 px dark outline (`#0b0f14`) so it parts from any
  floor. **A wall** and a prop have a 2 px dark outline. **A zone** has a hard
  bright edge, 2 lines wide, never softer than its fill.
- **No fill is flat.** Use noise: fractal noise, 3 octaves, at a scale of
  about **one feature per body** (30 units): grain finer than that is lost at
  zoom 1, coarser reads as a blotch. Keep it at 50 to 80 % opacity over the
  base tone, so the base still names the material.
- **Line weights**, in world units at zoom 1 (`line` = one CSS px): hairline
  1, outline 2, edge 3, shore of deep water 4.
- **Small things stay legible at 16 px.** A prop under 16 px across is a
  mark, not a drawing: one shape, one colour, one outline.

Worked example, mire (`mire.svg`): dull earth, noise, bubble rings, a lumpy
rim in a lighter tone.

![mire](visual-style/mire.svg)

Recipe (now): `ZONE_LOOK.mire` = `{ fill: 0x6b4a26, edge: 0x9c7a46, alpha: 0.5,
pulse: 0.03 }`; noise and bubbles are **target** decoration.

## 5. Animation timing

| Thing            | Timing                                                                              |
| ---------------- | ----------------------------------------------------------------------------------- |
| Zone fill breath | one cycle every **1.6 s** (`PULSE_SECONDS`), fill alpha ± pulse                     |
| Fire flicker     | two sines, changing every **66 ms** (`FLICKER_INTERVAL_MS`)                         |
| Water ripple     | **5 s** period, 3 units of drift (`RIPPLE_PERIOD_SECONDS`)                          |
| Idle loops       | **1 to 6 s**; never faster than a heartbeat, never above 3 Hz                       |
| Strike telegraph | the edge goes 2.5× wider and the fill 60 % within **0.3 s** of the warning starting |
| Strike           | full fill, edge stays 2.5× wide                                                     |

- **Danger must read in under 0.3 s**: the telegraph's change is a jump, not
  a fade, and it is a change of **edge width and brightness**, which survive
  colour blindness.
- **Reduced motion** (`still`): breath, ripples, flicker and drift hold still
  at their mean. **Telegraph and strike are not decoration**: they stay, as
  states, because a player acts on them.
- Idle motion is calm and low-contrast. The more a thing can hurt, the less
  it may distract from the fight: fog may breathe at 0.14, mire at 0.03.

Now: `zone-look.ts` (`zoneFillAlpha`, `strikeZoneLook`), `water-shape.ts`,
`lighting-model.ts` (`flickerAt`).

## 6. Gameplay readability

Every rule below can be checked from one screenshot.

1. **A zone's edge is always visible**: a hard rim, 2 lines wide, over
   water, fog and light.
2. **Danger is warm and pulsing; help is cool and calm.** A harmless thing
   may not be warm; a harmful one may not be cool.
3. **Art never hides a body, a projectile or a telegraph.** Decoration sits
   under bodies, and tall props are drawn beside, not on, a lane.
4. **Zone tint stays above water and light** in render order.
5. **Each kind of zone has its own shape language**, so two kinds that share
   a hue still differ: harmful ground has a **dashed** edge, help a **solid**
   one, strike zones a **dashed edge that goes solid** when they fire.
6. **A dark corner is lit enough to fight in**: bodies at 0.7 or more.
7. **Hidden bodies show their x-ray outline** under every cover.
8. **At 16 px** a zone is still told from the next by hue **and** edge.
9. **Colour-blind pass**: view the screenshot in grey; the danger edge and
   the telegraph still stand out.

Worked example, toxic fog (`toxic-fog.svg`): soft overlapping puffs inside a
hard dashed edge, so the cloud can move and the boundary cannot.

![toxic fog](visual-style/toxic-fog.svg)

Recipe (now): `ZONE_LOOK["toxic-fog"]` = `{ fill: 0x7fbf2a, edge: 0xc8f05a,
alpha: 0.32, pulse: 0.14 }`. The puffs (radial gradients, alpha 0.55 to 0) are
**target**.

## 7. Worked examples

### Lava

Hot core `#ffd23d`, body `#ff5a1f`, crust `#b8401a`, dark cracks, a bright
rim, and a warm light cast outwards. Danger: warm, and the loudest tone in
the room.

![lava](visual-style/lava.svg)

Recipe (now): `ZONE_LOOK.molten` = `{ fill: 0xff5a1f, edge: 0xffd23d,
alpha: 0.55, pulse: 0.12 }`, plus a `fire-` light, colour `0xff9040`, radius
170, flicker 0.35 on the zone's centroid (**target**: automatic zone glow).

### Water, deep and shallow

Deep is dark with a hard pale shore and sparse ripples: a body cannot be
seen through it. Shallow is clear, shows the floor, and ripples more. Both
are scenery under the zone tint.

![water](visual-style/water.svg)

Recipe (now): `WATER_LOOK.deep` = `{ fill: 0x0a1320, fillAlpha: 1, shore:
0xc4dcee, shoreWidth: 3, ripple: 0x4e6c8a, rippleAlpha: 0.7 }`;
`WATER_LOOK.shallow` = fill `0x8fb8d6` at 0.3, shore `0x8fb8d6`.

### Toxic fog

See §6. Acid green, soft body, hard edge.

### Mire

See §4. Earth brown, noise, bubbles.

### Torch light

See §2.

### Rock wall

See §3.

### Door, open and closed

**Shut** is a solid amber bar across the gap, set between two wall stubs.
**Open** is the stubs and a clear gap with a faint dashed ghost of the door,
so a player sees where it will close. Shape differs, not only colour.

![door](visual-style/door.svg)

Recipe (now): `drawGate` strokes an open gate's wall as a faint outline (`WALL_STROKE`, 50 %), which is the ghost. The amber door body and its door-knob line are **target**.

### Lever, up and down

The handle **stands** when up and **lies** when down, so the state reads by
shape; a pip on the base is dim then bright. Handle `#e8c27a`, base `#4b5a70`.

![lever](visual-style/lever.svg)

Recipe (now): `switch-mark.ts` draws a base and a handle, upright when up and thrown to the right when down. The amber handle colour and the pip are **target**.

Every SVG here is made by `scripts/assets/visual-style.mjs`; regenerate with
`node scripts/assets/visual-style.mjs`.

## 8. Review checklist

A reviewer or QA ticks these on a map or world-art PR, from a screenshot.

- [ ] The map uses a biome's tones; no signal colour is used as scenery.
- [ ] One sun, from the north-west; shadows fall south-east.
- [ ] 16 lights or fewer; fire is warm, magic is cold.
- [ ] Every height step reads: lit top, lip, darker face, shadow or pit.
- [ ] Every zone has a visible hard edge, over water and light.
- [ ] Danger is warm and pulsing, help is cool and calm.
- [ ] Hazards telegraph by edge width within 0.3 s.
- [ ] Nothing hides a body, projectile or telegraph.
- [ ] No fill is flat; texture is about one feature per body.
- [ ] The screenshot still reads in grey and at 16 px.
- [ ] Reduced motion holds idle loops still and keeps strike states.
