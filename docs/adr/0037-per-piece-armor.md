# ADR-0037: Insignia armor is per piece, and each hit rolls its piece

## Status

Accepted (2026-10-28). Issue #1135, the first of #488's children. It
amends [ADR-0012](0012-equipment.md), where armor was one number.

## Context

ADR-0012 gave a character one armor number, so insignia bonuses summed:
five Stalwart were +50 against physical damage. In GW1 each piece
protects its own location. GW Wiki, _Armor_: "only the armor worn there
is used"; _Insignia_: "armor rating bonuses (or penalties) only stack on
individual armor pieces". Five Stalwart are +10 on every hit.

## Decision

**Base and global armor stay one number.** Every max set within a
profession has the same base rating on every piece, so base armor stays
`baseArmor`. A shield or focus counts "regardless of the location hit"
(GW Wiki, _Armor rating_), and so do the profession's inherent armor,
Mysticism, Cracked Armor, statuses, penetration and Absorption.
`ResolvedEquipment.conditionalArmor` holds only these global bonuses.

**Insignia armor is held per piece.** `ResolvedEquipment.pieceArmor`
maps each `ArmorSlot` to its insignia's conditional armor. Health and
energy insignias were already per slot and do not change.

**Each armored packet rolls the piece it lands on.** `hitLocationOf`
draws one `nextFloat` from the simulation's RNG: the chest 3/8, the legs
2/8, the head, hands and feet 1/8 each (Q127; the wiki infers these from
crafting ratios). `mitigate` and `effectiveArmor` take the location as a
required argument, and add only that piece's insignia. A packet armor
never meets (`armored` 0: holy, shadow, typeless, degeneration, life
steal) gets `null` and draws nothing. Weapon blows roll after the crit
and damage rolls; skill damage rolls in `applyEffect`.

## Considered and dropped

- **Each insignia as a weighted average** (`3/8 × 10` on every hit).
  Not GW1, and fractional armor everywhere (Q127).
- **A per-piece base rating.** Every max set has equal base, so it adds
  arithmetic and no decision.
- **Rolling only when the pieces differ.** The RNG stream would then
  depend on gear, and a change of insignia would move every later roll.

## Consequences

- One more draw per armored packet. Seeded tests that pin exact health
  or crit counts changed once.
- No change to stored data or the wire: the snapshot's armor is
  `baseArmor`, and damage events carry no location.
- The gear editor's headline armor stays base. Insignia lines name their
  pieces and the average they add per hit.
- Headgear attributes and profession insignias (#488's later children)
  build on `pieceArmor`.
