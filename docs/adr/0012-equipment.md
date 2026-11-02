# ADR-0012: Equipment — weapons, off-hands, armor, runes and insignias

## Status

Accepted (2026-10-24). Data model and build format land in this change;
the damage pipeline, auto-attacks, projectiles and area of effect follow
in later phases of the same work.

The "a missing `equipment` key is not an error" clause is superseded by
[ADR-0016](0016-no-backwards-compatibility.md). The rest stands.

Amended (#759): the physical/untyped split is replaced by GW1's damage
types (physical, elemental, and chaos, dark, holy, shadow, typeless),
now that a Warrior's +20 vs physical and a Ranger's +30 vs elemental
consume them.

Amended (#489): a build carries up to four weapon sets, and which one is
in hand is simulation state. Every set is still resolved once, at join
([ADR-0036](0036-weapon-sets.md)).

## Context

The game shipped without any weapon system at all. Not a partial one —
nothing. There was no weapon entity, no equipment slot, no damage range,
no attack speed, no auto-attack, and no armor to attack against. Three
separate things made it look otherwise:

- Weapon-named attributes (Axe Mastery, Swordsmanship, Marksmanship)
  existed in `professions.ts`, but ranking one only fed a number into a
  skill's damage formula. It did not mean you held an axe.
- "Attack skills" — Swift Chop, Backbreaker, Opening Cut, Barrage — had
  the identical shape to Fireball in `skills/catalog.ts`. Reach was a
  per-skill constant, not a property of a weapon, and nothing checked
  what you were wielding.
- `StatusDefinition.armorModifier` existed and was summed by
  `aggregateModifiers`, but `applyDamage` had no armor term. Armor of
  Earth was a complete mechanical no-op.

Two consequences mattered enough to force the work. Adrenaline was
half-built: granted only when one of your _skills_ landed damage, so the
classic source was missing and adrenaline skills were gated behind
spending energy first. And every profession was effectively a caster
with differently-named spells, because auto-attack damage is the
baseline the energy and adrenaline economy is meant to be balanced
against.

The master brief does not help here. It never mentions weapons, armor
values, attack rates or auto-attacks — the closest it comes is
"ModifyAttackSpeed" in §6's effect vocabulary and "attack-speed
modifiers" in Sprint 15, both modifiers to a thing that did not exist.
This is unspecified territory, which is why it needs a decision record
rather than just an implementation.

## Decision

**A weapon is a class, not an item.** You pick "axe" and you get the axe
numbers. There is no inventory, no drop table, no upgrade component and
no inscription. A build stores ids and nominations only — never a cached
damage range, because a build that told the server what its weapon does
would be the one thing a client must never do (brief §32).

**The full set of classes ships, with no half-members.** Nine main-hand
classes (sword, axe, hammer, daggers, scythe, spear, wand, staff, bow)
with the bow split into its five real variants, plus two off-hands
(shield, focus) and an `unarmed` fallback. Bows differ only in interval,
reach and flight time, which is the entire reason there are five.

**Weapons are gated by attribute requirement, never by profession.**
Anyone may hold anything; an unmet requirement costs two thirds of base
damage. This needs zero new data — the requirement attribute already
encodes the gate and `accessibleAttributeIds` already encodes who may
raise it — and it avoids a profession whitelist that would contradict
itself the moment a secondary profession was involved. A Mesmer with a
hammer has made a bad build, not an illegal one.

**Runes and insignias are resolved, never mutated.** `Combatant`'s
`maxHealth` and `attributeRanks` are `readonly` by design — they are
the character sheet, not simulation state. Gear is **resolved** at
join, every weapon set with it, so the correct seam is _before_ the
combatant is constructed. Which resolved weapon set is in hand is
simulation state ([ADR-0036](0036-weapon-sets.md)): a swap picks
another, and nothing is recomputed. No risk of applying a rune twice.

**Off-hands require a free hand.** A two-handed weapon excludes a shield
or focus. That single rule is the trade the whole system turns on: a
one-hander plus a shield gets +16 armor (about ×0.76 damage taken); a
two-hander gets 19–35 instead of 15–22. The tension falls out of the
numbers with no extra tuning.

**Distances are rescaled, not transcribed.** The reference game measures
in its own unit. This one has shipped, playtested constants
(`RANGE_MELEE = 40`, `RANGE_SPELL = 420`) and arenas roughly 900 units
across. The _ratios_ are adopted, anchored on spellcasting range — with
melee pinned to 40 rather than its arithmetic 48, so that weapon reach
equals melee-skill reach. An eight-unit band where you can auto-attack
someone you cannot Swift Chop reads to a player as the game being
broken, not as a rule.

**Projectile speed is derived, not stored.** The reference publishes a
flight _time_ measured at maximum range; storing that directly would
make a point-blank arrow as slow as one across the arena.

**Armor is profession-locked, so it is not a choice.** Armor rating
comes from the primary profession alone, as one number rather than a
rating per piece. That matches the reference at max armor — every max
set within a profession has the same rating, and what used to separate
them became insignias. It also means there is deliberately no armor
picker: a light profession wearing heavy armor is not a trade-off being
withheld from the player, it is a rule the genre does not have. The
five pieces are therefore insignia-and-rune carriers, which is the half
that carries the actual decisions.

**Nothing ships that cannot fire.** The reference has a "while in a
stance" insignia. This game had no stances, so rather than ship a stat
line that is permanently zero, it was omitted and recorded as a gap
(Sentry's shipped once stances existed, #1206). Damage types
followed the same rule: at first only the physical split (slashing,
piercing, blunt) plus `untyped` existed, because only Stalwart and
Absorption consulted it, and fire, cold, lightning and holy came only
once something reacted to them. Now they all exist and armor reads
them: a Ranger's +30 vs elemental, Sentinel's, and the -mancer and
-bound insignias (#1206). Rune of
Purity covered Burning in place of the reference's Disease until Disease
existed; it covers Poison and Disease, as in GW1, since #765.

**A missing `equipment` key is not an error.** A build saved or shared
before weapons existed is _old_, not malformed. It receives its
profession's default loadout — and that loadout must pass
`validatePlayerBuild` untouched, because a migration that hands someone
an invalid character has destroyed it just as surely as deleting it.
A test asserts this for all ten professions.

**Changing profession keeps the weapon but drops what became illegal.**
Attributes and skills are gated by profession and are cleared, as they
already were. Gear joins the same rule for nominations and runes, but
the weapon class survives — deleting a deliberate choice would be the
editor overruling the player. The one exception (#614, operator Q72): a
weapon that no attribute of the new professions can govern, such as a
Sword on an Assassin, becomes the new primary's default weapon, so the
new primary's weapon attribute works at once. A weapon that is still
reachable stays.

## Consequences

Easier: martial attributes finally cost something real; shields, damage
types and armor have somewhere to matter; `attackMisses` and
`armorModifier` — both written, both with zero callers — get their first
consumers; adrenaline gets its missing source.

Harder, and worth stating plainly:

- **Turning armor on will retroactively change all twelve shipped
  skills.** Their numbers came from a corpus balanced _against_ an armor
  system; removing it was the approximation and restoring it is the
  correction, but the fights will not feel the same. The mitigation
  curve is calibrated so a 60-armor target takes exactly today's damage,
  which keeps the existing tests honest and confines the change to
  armored targets.
- Two more version numbers now move together (see ADR-0013).
- `PlayerBuild` gained a required field, so every construction site had
  to be updated. That is the compiler doing its job, but it is churn.
- Fifteen catalog entries are a tuning surface nobody has playtested.
  The headless runner is the tool for that, and it is not wired to
  weapons yet.
- Deriving armor from the profession cost one real mechanic:
  **attribute headgear**, the reference's `+1` to a chosen attribute on
  the head slot. It was recorded as a gap in `equipment/coverage.ts`,
  and is closed now (armor parity, issue 488): the head piece names an
  attribute of the primary or the secondary, its +1 stacks with any rune,
  and ranks cap at 16.

## Alternatives Considered

**A per-piece armor rating, or an armor-type picker.** Rejected on
fidelity, not effort: armor is profession-locked, and at max armor the
sets within a profession do not differ. A picker would be inventing a
decision rather than exposing one.

**Weapons as items with mods and inscriptions.** Rejected: it needs an
item model, a loot or vendor source, and storage for inventories, in a
game with no database that shares builds as a line of text. Mods
without items superseded by [ADR-0047](0047-weapon-upgrades-without-items.md)
(operator, 2026-11-01).

**Profession-gated weapons.** Rejected: a second source of truth that
disagrees with the attribute rule as soon as a secondary profession
exists, and it would force clear-on-profession-change logic for weapons.

**Mutable `maxHealth` with a `recomputeDerived()` step.** Rejected: an
ordering hazard against a value that is already live and fractional, and
deep wound's `maxHealthMultiplier` already occupies the
"temporary max-health change" slot. Two mechanisms competing for one
number is how you get a heal that over-caps.

**Shipping Sentry's insignia inert, and the full elemental damage
spread.** Rejected on the same grounds: brief §9 forbids faking
coverage, and a stat that can never trigger is a lie with a tooltip.

**Copying the reference's distance units.** Rejected: it would break
every map and every existing skill range.
