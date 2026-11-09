# ADR-0051: 2.5D is a 2D simulation with discrete layers

## Status

Accepted (2026-11-08). Issue #2825, epic #2810, operator request. The operator picked art direction D (#2811), recorded in `docs/art/art-direction.md`. Builds on ADR-0001 (the simulation knows nothing of rendering) and ADR-0006 (map format). Replaces the current maps under ADR-0016.

## Context

The game cannot show a bridge, a platform or anyone standing on one, and the operator wants that look: fighters on a deck, others underneath, a ramp between them. A full height coordinate would touch every distance, collision and line-of-sight check, and put 3D questions into a deterministic simulation that today answers only 2D ones. The elevation players need is a handful of walkable levels, not a continuum.

## Decision

**A position is `x`, `y` and a discrete `layer`.** Layer 0 is the ground, 1 a deck, and 2 exists only on a map that needs it. There is no Z anywhere: no height on a body, no height on a wall, no interpolation along a ramp, no 3D collision or navigation. Range is always the 2D distance.

**A body is on exactly one layer, always.** Only the simulation changes it, on the tick a body inside a map-defined transition area (a ramp, stairs) moves towards the other layer. A move command names a target layer and the simulation validates it; an illegal one is refused and the body stands. Knockback and teleports keep the layer: a destination that is not walkable on the body's layer is clamped to the nearest point that is, so a knockback stops at a deck's edge and a step beside someone on another layer lands on the stepper's own. A respawn takes its spawn's layer.

**Bodies on different layers do not collide.** Two bodies at the same `x`, `y` on different layers pass freely. Each layer has its own walls and its own walkable area, and a nav graph per layer is linked at the transitions.

**A body inside a transition area counts as on both of the layers it connects, for melee and area effects only.** It still has one layer, which every other rule reads. This keeps a ramp from being a place where nobody can touch you.

### The rule table

| Attack                       | Rule                                                                                                                  |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Melee                        | Same layer only (a body on a transition counts as on both).                                                           |
| Area effect                  | Only the layer it belongs to, see below (a body on a transition counts as on both).                                   |
| Ranged or spell, same layer  | That layer's walls, as today.                                                                                         |
| Ranged or spell, upper→lower | Upper-layer walls. A target under a deck's footprint can't be hit from that deck.                                     |
| Ranged or spell, lower→upper | Lower-layer walls. A target on a deck can't be hit by a shooter under that deck's footprint.                          |
| Bow or spear, upper→lower    | +15% range and +10% non-critical damage.                                                                              |
| Bow or spear, lower→upper    | −15% range and −10% non-critical damage.                                                                              |
| Objective presence           | On the objective's layer only (a body on a transition counts as on both). A dropped bundle takes its dropper's layer. |

Everything else is a plain 2D line-of-sight check. Heights are never computed: no line through a deck's edge, no blind zone along it. Bots and pathing use these same checks, so a bot never targets through a deck.

**The height modifier** (operator, 2026-11-08). A bow or spear attack, plain or from a skill that fires the weapon, aimed at a lower layer has +15% range and +10% non-critical damage; aimed at a higher layer it has −15% range and −10% non-critical damage. Two layers of difference count as one. Layers that overlap, as a body in a transition area counts as on both layers it connects, are no difference. Spells, wands and staffs get none in either direction, and a critical hit ignores the damage part. The range applies at release, with the layers read once like the rest of the shot; an attacker told to shoot a target on another layer closes to the modified range. The numbers are `HEIGHT_RANGE_PERCENT` and `HEIGHT_DAMAGE_PERCENT`.

### Who owns what on a boundary

**A shot in flight belongs to the moment it was released.** `skills/projectile.ts` fixes a shot's path at release, and the layers join that decision: which walls apply, and whether the deck rule forbids the shot, are read once from the shooter's and the target's layers at release and never again. A target that changes layer in flight is treated as today's target that moved: the shot hits if they are still within reach of its aim point in 2D, whichever layer they are on now. A shot needs no layer of its own: what it hits is its target, and an area it carries asks the target for a layer when it lands.

**An area effect belongs to the layer of what it is centred on.** One centred on a target, like Fireball, or a ground effect anchored at one, takes that target's layer when it resolves: on landing for a shot, so a blast follows a target who climbed in flight, and at placement for a ground effect. One centred on the caster, or placed where the caster stands, takes the caster's layer at placement, also on a transition or a deck's edge. Spells cross layers, so a ground caster's Fireball at a foe on a deck bursts on the deck, and spares whoever is underneath. A ground effect's layer is fixed for its life; `GroundEffect` carries it, next to `position`. A body inside a transition area is reached from either side, as above.

### The line between simulation and presentation

The simulation alone decides a body's layer and what is valid. `game-core` stays free of Phaser and of anything visual. The renderer reads layers from the snapshot and turns them into elevation offsets, draw order and occlusion; a visual offset never reaches a rule. Gameplay geometry and decoration are separate fields of the map, and decoration never becomes collision.

### Old maps are replaced

The maps as they are today get no converter and no migration (ADR-0016). The schema changes, a map document is edited by hand to match, and the old maps are deleted and replaced by new multi-layer maps. Stored data naming a removed map is discarded.

## Considered and rejected

Cross-layer combat, from #2811, where the choice was that ranged and spells cross, melee does not and a deck blocks sight:

- **Same layer only.** The simplest rules, but a bridge becomes a separate, safe arena and height means nothing.
- **Everything crosses, layers ignored.** Nothing to build, but the deck is scenery and people under a bridge are hit through it.

The model itself, from #2810:

- **Continuous Z or 3D physics.** Every system pays for a question only ramps ask, and determinism gets harder to keep.
- **Height along a shot's line (interpolated through a deck's edge).** The footprint rule gives the same cover without computing a height, and a player can learn it at a glance.
- **Keeping elevation in the renderer only.** It would look right and mean nothing: a player under a bridge would collide with one on it.

## Consequences

- Every system that reads a position must now say what it does with a layer: movement, collision, pathing, line of sight, targeting, melee, projectiles, area effects, objectives, spawns and hazards.
- `hasLineOfSight` gets a blocker set chosen per shooter and target layer, and one more geometry set: deck footprints.
- Players lose any stored data that names a removed map.
