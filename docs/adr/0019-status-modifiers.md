# ADR-0019: Crippled, dazed and blind reach the match

## Status

Accepted (2026-10-24). Amends [ADR-0012](0012-equipment.md). Amended
(2026-10-26, #546): dazed interrupts spells, as in GW1; see the end.

## Context

`aggregateModifiers` computed three numbers nothing read: crippled's
`moveSpeedMultiplier`, dazed's `castTimeMultiplier` and blind's
`attackMissChance`. `attackMisses()` had no caller. `preventsSpellCasting`
was set by no status and read by nothing. Three conditions players could
be hit with did nothing at all, and the tooltips said they did.

Two more statements were false. The `status.ts` comment said dazed makes
casting interruptible "handled separately in interrupts"; nothing handled
it. The catalog said Armor of Earth carried "the real movement penalty";
`armor-boost` had none, so once armor went live it was a free +24.

## Decision

Three helpers in `skills/tick.ts`, so no game loop reads
`aggregateModifiers` directly:

- **`moveSpeedMultiplier(c)`**, clamped to [0.25, 1.33], scales the speed
  `MatchSimulation.advanceMovement` integrates. The clamp lives here and not
  in `aggregateModifiers`, so each status's own line ("moves at 50% speed")
  stays true. Nothing reaches either bound today.
- **`effectiveActivationSeconds(skill, c)`** is what `beginCast` gets.
  Dazed doubles it; an instant skill stays instant. The cast's total is
  synced as `castTotal`, so the cast bar fills over the real cast and not
  the skill's base time. That is a state schema change, so
  `PROTOCOL_VERSION` goes to 2.
- **`attackMissChanceOf(c)`** is read by `applySkillEffects`.

**Dazed doubles cast time.** In the reference it makes casting easy to
interrupt. Every cast here is already interruptible with no precondition,
so that rule would do nothing. The data already said double cast time, and
so did the gameplay docs; the comment was the outlier and is fixed. This is
a deliberate deviation, like those in ADR-0012.

**Blind makes attack skills miss.** There are no auto-attacks, but the
corpus marks attack skills, and `Skill.type` already carries that:
`"attack"` is Swift Chop, Backbreaker, Opening Cut, Barrage and Broad Head
Arrow. No separate `isAttack` flag, which would be a second source of truth
for the same fact. The roll happens at resolution, not activation: a
blinded attack swings and misses, paying its cost and recharge, and emits
`attack-missed` so the target shows "miss". One roll per cast, so Barrage's
volley misses as a whole. The draw is guarded by `chance > 0`, so nobody
unblinded draws, and no existing seed's stream moves. Spells are unaffected.

**Armor of Earth slows to 75%.** `armor-boost` gains
`moveSpeedMultiplier: 0.75`. The +24 armor now has its price.

**`preventsSpellCasting` is deleted** from `StatusDefinition`,
`StatusModifiers`, `aggregateModifiers` and `describe.ts`. No status set
it. It comes back with the first skill that needs it. None of the seven
unimplemented corpus skills does, so there is no `MissingMechanic` entry.

**Brawler's Insignia is removed.** Its `while-attacking` armor needed
`ArmorContext.isAttacking`, which only its own unit test ever set: nothing
is ever mid-attack. A permanently zero stat line is the reason ADR-0012
left out Sentry's Insignia. The insignia, the `while-attacking` condition
and `ArmorContext` go; `equipment/coverage.ts` records the gap as
`attack-state`.

## Consequences

- Crippled players cover half the ground. A crippled Armor of Earth
  caster moves at 37.5%.
- A dazed caster's 1 s Fireball takes 2 s, which is more time to
  interrupt it.
- A blinded warrior's Opening Cut is wasted 90% of the time. Blind still
  cannot deny auto-attack damage, because there is none.
- Saved builds with Brawler's Insignia no longer validate and fall back
  like any other illegal build.

## Amendment (2026-10-26, #546): dazed interrupts spells

The deviation in "Dazed doubles cast time" is reversed. Its premise, that
the reference's "easy to interrupt" would do nothing because every cast is
already interruptible and there are no auto-attacks, stopped being true
with [ADR-0026](0026-weapon-auto-attack.md): swings and arrows land all match
long, and in GW1 every one that lands on a dazed spell-caster interrupts
the spell. Decided in #468.

Dazed now also interrupts, through the one interrupt path, so every "if
interrupted" rule sees it:

- applying Dazed interrupts a spell being cast, even on a target already
  dazed;
- an attack that lands on a dazed target casting a spell interrupts it,
  before its damage: a swing, an attack skill or an arrow. A miss, a
  block or a dodge does not land, and does not interrupt.

Only spells, as `isSpell` says: a signet, a shout, a stance or an attack
skill is left alone. The cast-time half stands. Broad Head Arrow loses its
separate interrupt: its Daze interrupts by itself, now only a spell. The
data is one flag on the status definition, `interruptsSpells`.
