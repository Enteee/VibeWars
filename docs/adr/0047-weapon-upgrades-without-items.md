# ADR-0047: Weapon upgrades without items

## Status

Accepted (2026-11-01). Issue #2007, part 1 of the weapon mods
(#2007-#2011), requested by the operator: "weapon mods are essential".
It supersedes the "Weapons as items with mods and inscriptions"
rejection in [ADR-0012](0012-equipment.md), and amends
[ADR-0036](0036-weapon-sets.md): health and regeneration become per set.

## Context

ADR-0012 rejected weapon mods because they seemed to need an item model:
loot or a vendor to get them from, and an inventory to keep them in. This
game has neither, and shares a build as one line of text.

GW1 PvP never needed the item either. A PvP character picks any weapon
and any upgrade it has unlocked, at its perfect value, from a panel. What
it carries is a list of choices, the same as a skill bar.

## Decision

**A mod is an id on an equipped item.** `EquippedWeapon` and
`EquippedOffhand` carry `upgrades: { prefix, suffix, inscription }`, each
a `ModId` or `null`. Every item has all three keys; "no mod" is `null`,
never an absent key, and fists carry none. The catalog is
`equipment/mods.ts`: each mod's slot, the items it fits, its effects and
its tooltip line. `MOD_SLOTS` says which slots an item has: a wand, a
shield and a focus take no prefix.

**Always perfect, picked in the builder.** There is no rarity, no roll,
no inventory and no drop. A mod is a choice in a build, validated like a
rune: the wrong slot, an item without that slot, or an item the mod is
not made for is a problem. Changing an item drops the mods that no
longer fit, as a profession change drops runes.

**A set's mods are that set's.** They resolve at join with everything
else (ADR-0036), into the set that holds the item: an off-hand's only
where the off-hand counts. So `maxHealth` and `baseEnergyPips` move from
`ResolvedLoadout` into `ResolvedWeaponSet`, next to `maxEnergy`. Runes
and insignias still count once, in every set.

**A swap moves health like energy, but never below 1.** Current health
moves by the change in maximum, as ADR-0036 moves energy. Unlike energy,
it stops at 1: a weapon swap is not a way to die.

## Consequences

- `BUILD_FORMAT_VERSION`, `CHARACTER_SCHEMA_VERSION`,
  `TEAM_SCHEMA_VERSION` and `TEAM_FORMAT_VERSION` go up. Saved characters,
  teams and shared codes from before are refused, not adapted
  (ADR-0016).
- `ModEffect` is a closed union. Each later card widens it with a kind
  that fires (ADR-0012, "Nothing ships that cannot fire"): on-hit
  prefixes (#2009), conditional inscriptions (#2010) and caster chance
  mods (#2011). Until they land, `weapon-upgrades` in
  `equipment/coverage.ts` is a gap.
- GW1 template codes carry no equipment, so they import with no mods.

## Alternatives considered

**An item model.** Rejected, as in ADR-0012: an item is a weapon plus
its mods plus where it came from, and only the first two matter here.

**Mods resolved on swap.** Rejected: ADR-0036 resolves every set at join
so nothing is resolved twice, and a mod is no reason to reopen that.
