# Wilds ground zones (#3052)

Study: `3052-zones.png`, regenerate with `node scripts/assets/zones-study.mjs docs/art`
(needs inkscape; the SVG is a build intermediate, not committed). Follows
`visual-style.md`: hard edge 2 wide, dark drop under the SE edge, light from NW.

| Kind           | Base / mid / accent           | Edge      | Texture                                         | Light (colour, radiusScale, intensity) |
| -------------- | ----------------------------- | --------- | ----------------------------------------------- | -------------------------------------- |
| molten         | `#2a1410` `#7a2a10` `#ffb03d` | `#ffd23d` | dark crust, hot cracks that slowly flow         | `#ff9040`, 1.6, 0.9                    |
| scorched       | `#1c1614` `#3a2a22` `#ff6a2a` | `#ff8a3d` | charred earth, glowing ember specks that fade   | `#ff7a30`, 1.2, 0.35                   |
| toxic-fog      | `#7fbf2a` `#a8d84a` `#e0f58a` | `#c8f05a` | two drifting puff layers, translucent           | none                                   |
| mire           | `#4a3418` `#6b4a26` `#2a1c0c` | `#9c7a46` | wet mud, dark puddles, slow bubbles             | none                                   |
| foul-water     | `#2c4430` `#3d5a3a` `#8a9a4a` | `#6f8f5a` | murky water, water-painter ripple, scum flecks  | none                                   |
| tainted-water  | `#1a1226` `#2c1f40` `#9a7ad0` | `#a77bff` | near-black violet, oily sheen, ripple           | none                                   |
| spring         | `#2f86d0` `#4fb0f0` `#e8faff` | `#9fdcff` | clear water, ripple, sparkles                   | `#8fd0ff`, 1.3, 0.45                   |
| grove          | `#2f8a3c` `#4aa650` `#ffe066` | `#76c96f` | grass tufts, small flowers; lighter than ground | none                                   |
| draining-spire | `#2a2236` `#4a3a6a` `#c9a8ff` | `#a77bff` | violet wash, rings, obelisk with rune glow      | `#a77bff`, 1.4, 0.7                    |

Edges keep today's `ZONE_LOOK` colours. Fills are textured, so `alpha` drops to
a floor under the texture; the toxic fog stays translucent so bodies inside show.
Poison reads acid green or olive, drain violet, help cool blue or green (§6 rule 2).
