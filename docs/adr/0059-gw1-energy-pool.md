# ADR-0059: The energy pool is GW1's, per profession

## Status

Accepted (2026-11-25). Issue #3986, part of the GW1 mechanics audit
(epic #3973), operator answer Q182: "Yes, per-profession like GW1."
Replaces the flat 50-energy pool and its threshold scaling from #1395.

## Context

Every character's maximum energy started from a flat 50, whatever its
profession and weapon. GW1 starts every character at 20 and lets the armor
and the weapon in hand add the rest (wiki, "Energy").

The larger pool had a cost of its own. Skill costs and gains are GW1's, but
a few skills cap energy at a number written for GW1's pool: Warrior's
Endurance "cannot raise your Energy above 10...25". #1395 scaled such caps
by 50/20 (`gw1EnergyScaled`), so a cap sat where it had sat against 20.
Every new cap had to remember to be scaled, and every cost read as cheaper
than it is in GW1. The audit found the pool, not the caps, was the thing
that differed.

## Decision

**Maximum energy is 20, plus the primary profession's armor energy, plus
the weapon set's inherent energy, plus everything that added to it before.**

- Armor energy by primary profession (`ARMOR_ENERGY_BY_PROFESSION`, the
  "(Profession) armor" wiki pages): Warrior 0; Ranger, Assassin and Dervish
  5; Monk, Necromancer, Mesmer, Elementalist, Ritualist and Paragon 10.
- A staff holds an inherent +10 (`Weapon.energy`). It belongs to the weapon
  set, as a focus's bonus does, so a swap moves the maximum (ADR-0036,
  ADR-0047). Wands and martial weapons have none.
- Insignias, runes, Energy Storage, a focus and weapon mods add as before;
  morale applies to the base 20, as it did to the base 50.
- `gw1EnergyScaled` and `GW1_BASE_ENERGY` are gone: with GW1's pool, a GW1
  cap is used as written. Warrior's Endurance's cap scales with Strength,
  10...25, as the skill says.

## Consequences

- At rank 0 with no gear: Warrior 20, Ranger, Assassin and Dervish 25,
  everyone else 30. A rank-12 Elementalist with a staff has 76. Casters run
  tighter and warriors much tighter, as in GW1. Costs are unchanged.
- A participant spec with no `maxEnergy` (a training dummy, a headless
  fighter, a test) has the bare 20.
- Individual skills may now feel off; that is watched in playtests and
  filed one by one, not retuned here.
