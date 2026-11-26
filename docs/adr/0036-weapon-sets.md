# ADR-0036: Weapon sets are resolved at join and swapped by index

## Status

Accepted (2026-10-28). Issue #1069, the first of #489's children. It
amends [ADR-0012](0012-equipment.md), where gear was fixed at join.

## Context

GW1 lets a character carry up to four weapon sets and swap between them
mid-match with F1-F4. A set is a main hand and an optional off-hand.
Armor, runes and insignias stay one set. Without weapon mods (epic #489,
option (a); `weapon-upgrades` in `equipment/coverage.ts`), the sets
still matter for two things: the weapon class an attack skill needs,
and a shield against a focus, which trades armor for energy.

ADR-0012 resolved gear once, before the `Combatant` exists, so that a
rune can never be applied twice. A swap must not reopen that.

## Decision

**Every set is resolved at join, and a swap only picks another one.**
`BuildEquipment.weaponSets` is a four-tuple: set 1 always, sets 2-4 a
set or `null`. `resolveLoadout` adds up the runes, insignias, attribute
ranks and Energy Storage once. It then resolves each set to a
`ResolvedWeaponSet`: a `ResolvedEquipment` with that set's weapon and
shield, and a maximum energy with that set's focus. Nothing is resolved
in a match. The simulation's only new state is the index in hand and a
queued index.

**`Combatant.equipment` is the set in hand.** It loses `readonly`, and
the simulation's `#swapWeapons` is its one writer. Every reader follows
a swap without a change: weapon attacks, the `wrong-weapon` check, the
weapon conditions in effects, the host's wire snapshot and the arena's
weapon marks. The spare sets live on the participant record, so
`Combatant` and the skill test harness do not grow.

**A swap is an action, queued behind the one in progress.** GW1:
"Equipment in general cannot be equipped or changed during the
activation of a skill or the swing of an attack" (GW Wiki), and "You
can however 'preswap' during cast or attack" (GWGuru, _Weapon
Swapping_). `requestWeaponSet` swaps at once if nothing is in progress.
It queues behind a cast, an aftercast, a swing begun or a knockdown, and
the swap happens the tick that ends: before a skill queued behind the
same cast goes off, and right after a blow lands with the old weapon.
Moving or Esc ends the action, so the swap with it happens at once.
Another key replaces the queued set, and the active set's key drops it.
Death drops it too. The set in hand stays through respawn.

**Energy moves with the maximum, below 0 if it must.** The new set's
maximum energy replaces the old one, and current energy moves by the
same amount. GW Wiki, _Energy_: "it is possible for characters to have
negative energy, although the UI will still indicate 0 energy".
`moraleMaximum` is linear, so the amount is the sets' difference at any
morale. The floors that used to read `Math.max(0, …)` (regeneration,
morale and overcast) now keep energy that is already below 0, through
`energyFloor`. Costs already refuse below the cost, so hidden energy
must be climbed out of. This is GW1's energy hiding, the caster's
counterplay against drain.

**No cooldown.** No GW1 source has one. The 10 s swap cooldown people
quote is Guild Wars 2's.

## Considered and dropped

- **Re-resolve the gear on a swap.** It reopens rune double-application
  and puts the resolver in the tick loop, for no gain: each set is known
  at join.
- **A getter over the record in place of `Combatant.equipment`.** That is
  forty-odd read sites, plus the skill harness, rewritten for the same
  value.
- **Swap at once, losing the swing in progress.** That is not GW1. It
  also needs a rule for an attack skill's wind-up, which queuing does
  not.
- **Floor energy at 0 on a swap.** That punishes swapping where GW1 does
  not, and takes away energy hiding.

## Consequences

- The stored build shape changed: `CHARACTER_SCHEMA_VERSION` and
  `BUILD_FORMAT_VERSION` went to 3. Older characters and build strings
  are discarded or refused (ADR-0016). `SEMANTICS_REVISION` went to 2,
  so a stale tab is refused at join rather than quietly playing the
  house loadout.
- Child 2 of #489 adds the intent, the active set on the wire, the HUD
  and the keys. Child 3 adds the editor's set tabs. Until then, the
  build editor edits set 1.
