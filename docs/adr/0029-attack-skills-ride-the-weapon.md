# ADR-0029: Attack skills ride the weapon

## Status

Accepted (2026-10-25). Epic #341, child 1: issue #414. Children 2 to 4
(walking into reach, arrows in flight, the weapon line in the UI) build on
this.

## Context

ADR-0026 gave every character a weapon auto-attack, and deferred one
simplification: attack skills kept their own damage, a spell-like number
applied at once, and counted as attacks only for blind and adrenaline. So
Swift Chop did 16 damage whatever you held, a sword skill worked with a
staff, and an attack skill took no time at all. In GW1 an attack skill is
a blow of your weapon: it needs that weapon, it takes the weapon's time,
and it hits for the weapon's damage plus a bonus.

The operator's answers on #341: an attack skill out of reach walks in
first (Q49, child 2); attack-speed effects get a hook now (Q50); and
otherwise, do what GW1 does (Q51).

## Decision

An attack skill is one attack of its weapon, plus the skill.

**Data.** `Skill.attack` is set exactly when `type === "attack"`:

```ts
interface AttackSkillRule {
  readonly weapon: AttackWeaponClass; // axe, sword, hammer, daggers, scythe, spear, bow, melee
  readonly bonusDamage: Magnitude | undefined;
}
```

`melee` is any of the six melee weapons, not fists; `bow` is any of the
five bows. `wieldsFor(weaponId, class)` is the one table. An attack skill
has no `damage` effect: its damage is the blow's, and the bonus is part of
it. Its other effects (a condition, an interrupt) are riders.

**Requirement.** Pressed with the wrong weapon, the skill is refused as
`wrong-weapon`, before its cost is checked, and the HUD says what it needs
("Needs an axe.").

**Timing.** From GW Wiki's _Attack skill_:

| Skill states             | Hit lands at          | Then recovery for |
| ------------------------ | --------------------- | ----------------- |
| no activation            | half the weapon swing | the same again    |
| an activation of _a_ sec | _a_ / 2               | the same again    |

Swift Chop on an axe (1.33 s) hits at 0.665 s and is done at 1.33 s;
Backbreaker on a hammer (1.75 s) hits at 0.875 s. The wind-up is a cast,
so it shows on the cast bar, an interrupt stops it, and moving cancels it.
The recovery is an aftercast of the wind-up's length, never #317's fixed
0.75 s. Dazed, a cast-speed effect, does not lengthen it.

Pressed mid-swing, the swing in progress is lost and the skill starts from
zero (community testing on _Talk:Attack skill_). Afterwards the
auto-attack carries on at the skill's target with a fresh swing.

**The blow.** At the hit, each victim (the target, or each one the skill's
area picks, as Barrage's) takes one blow: blind may miss it, and then it
gets none of the riders; otherwise the weapon's roll, times the attribute
multiplier, plus the bonus, is one damage packet of the weapon's type and
armor penetration, mitigated once. No double strike and no cleave on an
attack skill. Adrenaline as for any hit.

**Attack speed.** `StatusDefinition.attackDurationMultiplier` scales
swings and attack skills alike. As in GW1, only the strongest speed-up and
the strongest slow-down count, and they multiply. No status sets it yet.

**Out of reach.** An attack skill pressed out of range or out of sight
of its target is walked into, as Space is (Q49, #415). The press is
checked as any is, and accepted when range or sight is all that fails: the
attack turns on the target with the skill as `AttackState.pendingSkillSlot`,
and the approach walks to the skill's range rather than the weapon's, so
Barrage stops at its own. In reach and in sight, it goes off through the
same check as a press; nothing is paid, and no recharge starts, until then.
Refused on arrival, it is dropped and the attack carries on. Whatever drops
the attack drops it too (moving, Escape, a new target, the target dying or
proving unreachable), and another skill pressed replaces it.

**Interrupts.** An interrupted skill, attack or not, starts its recharge
as if it had been used, as in GW1. Before, it could be cast again at once.

## Considered and dropped

- **Keep attack skills instant with their own damage.** That is the gap
  this closes: a weapon that does not matter to its own skills.
- **A "next swing" slot in `AttackState`** instead of a cast. Rejected:
  the cast already gives the cast bar, interrupts and "moving cancels" for
  free, and a second wind-up mechanism would drift from the first.

## Simplifications

- A ranged attack skill lands at the hit, with no flight (child 3).
- No crits, block or evade; no per-skill aftercast overrides.

## Consequences

- An attack skill now does weapon damage plus its old number: at rank 12
  against reference armor, Swift Chop goes from 16 to 22 to 44, Backbreaker
  from 16 to 35 to 51, Opening Cut from 20 to 35 to 42 (and the bleed),
  Barrage from 12 to 27 to 40 per foe, and Broad Head Arrow from 0 to 15
  to 28. None kills a 500-health character in one hit, and each beats a
  plain swing of its weapon.
- Every attack skill takes time and stops a held walk, as a cast does.
- Whirlwind Attack still waits, now on `title-attribute`: it is PvE-only,
  and its attribute is a title track.
