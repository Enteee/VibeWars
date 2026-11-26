# ADR-0018: Area of effect as an `area` modifier on the skill

## Status

Accepted (2026-10-24). Amends [ADR-0004](0004-skill-data.md).

## Context

Fireball damages "target foe and all nearby foes"; Barrage hits "up to six
adjacent foes". The effect system had no spatial knowledge at all:
`applyEffects` takes one caster and one target. So both skills shipped
single-target only, with a comment saying so, and `coverage.ts` listed
`area-of-effect` as the mechanic three corpus skills waited on.

## Decision

A skill gains `area: AreaRule | undefined`, next to `target`:
`{ radius, origin: "caster" | "target", affects: "enemies" | "allies" |
"all", maxTargets, includesCaster }`. `target` keeps its meaning (_what you
must select, and whether the cast is legal_). `area` means _who else is
caught once it lands_. The two are orthogonal, which is how the corpus reads:
Fireball is still a legal single-enemy spell, with a splash.

- **One shared `resolveTargets`** (`skills/targeting.ts`) turns a landed
  skill into the combatants it hits. Without an `area` it returns exactly
  the primary target, so there is no "area path" and "normal path" to
  drift apart. With one, it returns the primary first, never filtered
  again because `canActivate` already accepted it. Then come the
  candidates that are alive, not the caster unless `includesCaster`, on the
  side `affects` names, within `radius` of the origin and in line of sight
  **from the origin**.
- **The order is deterministic, and that is mandatory** (ADR-0003). The
  candidates sort by distance from the origin, ties by id, and only then
  are cut to `maxTargets`. The server iterates a `Map`, the headless runner
  an array; without the sort, the cut keeps different targets in each.
  There is no randomness anywhere in selection.
- **`applySkillEffects` applies a landed skill to all of them.** Effects
  run in their listed order, and one that acts on the caster
  (`energy-gain`, `sacrifice-health`) fires exactly once, however many were
  hit. Calling `applyEffects` once per target would have paid a sacrifice
  per foe caught. `effectActsOnCaster` is an exhaustive switch, so a new
  effect kind is a compile error until someone decides which it is.
  `applyEffects` stays the per-target primitive.
- **Radii live in `distances.ts`** with the ranges they rescale from:
  `AREA_ADJACENT = 40` (pinned to `RANGE_MELEE`), `AREA_NEARBY = 81`,
  `AREA_IN_THE_AREA = 109`. This also ended a duplication: `catalog.ts` and
  `weapons.ts` each defined melee and spell range privately.
- **No falloff.** The reference has none, it would need its own tooltip line
  and tests, and nothing needs it. Everything in the circle takes the same
  hit.
- **No protocol change.** Areas are centred on the caster or the target,
  never on a ground point. The `combat` broadcast, which is not part of
  `game-protocol`, gains an optional `area: { x, y, radius }` so clients can
  flash where it landed. Older clients ignore it.

### Why not an effect kind

"One effect kind per mechanic" (brief §41) would suggest an `area` effect
wrapping inner effects. Rejected: it makes `SkillEffect` recursive, breaks
`describe.ts`'s one prose line per effect and the test enforcing it, and
makes nested areas representable nonsense. New `TargetRule` members were
rejected too: `TargetRule` is a plain union read by `checkTarget`'s switch and
by `describe.ts`'s `Record<Skill["target"], string>`, a payload breaks that
`Record`, and Fireball's legality genuinely did not change.

This knowingly departs from the letter of that rule. The rule's stated
purpose is "never a bespoke class, never a switch the size of a building". A
declarative `area` record and one shared `resolveTargets` meet that purpose
exactly: it is still data, there is no switch, and no skill gets custom code.

### What coverage can and cannot reclaim

Fireball is now fully implemented. Barrage has its volley, but its comment
stays: it rides on a bow attack, and weapon attacks do not exist. The three
skills that waited on `area-of-effect` still do not ship, because each was
also waiting on something else. Contagion needs `reactive-triggers`, and
Whirlwind Attack needs `weapon-attacks`. Meteor Shower's reason had been
_understated_ and is corrected, not shortened, to `knockdown`,
`ground-targeting` and `persistent-ground-area`. `implemented` stays 12 and
`unimplemented` stays 7. `coverage.test.ts` asserts that no skill still
blames `area-of-effect`.

## Consequences

- A player's Fireball hits every enemy within 81 units of its target. A
  healer standing next to the person they heal shares their burns. The
  headless balance test moved its healer out of the splash to keep asking
  the question it was written for.
- Splash respects walls from the origin, not from the caster: a foe behind
  a pillar from the target is safe even if the caster can see them.
- Ground targeting is a separate decision. It needs a client intent carrying
  world coordinates, server-side validation of that new kind of input, a
  reticle and a `PROTOCOL_VERSION` bump, and it unlocks only Meteor Shower,
  which is blocked on two other mechanics anyway.

## Amendment (2026-10-27, #1013): the party area

Areas were centred on the caster or the target, with line of sight from
that origin. Heal Party's "heal entire party" is neither: it reaches the
caster and every living team-mate, at any distance and through walls.
`AreaRule` is now `RadiusArea | PartyArea`, and `PartyArea` is only
`{ origin: "party" }`. `resolveTargets` returns the caster first, so it
is the primary Divine Favor adds to, then the team-mates nearest first,
ties by id, the order every other cut uses. A party area sends no
`area` on the `combat` broadcast: there is no ring to draw.

An infinite radius was rejected. Line of sight would still be checked,
so a team-mate behind a wall would be missed. `Infinity` on the
broadcast's `area` would be written as `null` in JSON and drawn as a
ring, and the tooltip would print "within Infinity". `AREA_EARSHOT` would
turn the skill into a slow shout. A new `TargetRule` is what this ADR
already turned down for areas.
