import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { CastState } from "./cast-state.js";
import { StatusSet } from "./status.js";
import type { Combatant } from "./types.js";

/**
 * Test/benchmark helper for building combatants. Lives in `src/` rather
 * than a test file because headless simulation tooling (brief §15, §28)
 * will want it too.
 */
export function makeCombatant(overrides: Partial<Combatant> & { id: string }): Combatant {
  return {
    health: 500,
    maxHealth: 500,
    energy: 50,
    maxEnergy: 50,
    adrenaline: 0,
    attributeRanks: new Map(),
    team: 0,
    dead: false,
    statuses: new StatusSet(),
    cast: new CastState(),
    attack: undefined,
    // Armor at the reference level, so an unconfigured test combatant
    // takes damage for exactly its stated amount. A test that wants to
    // exercise mitigation says so explicitly.
    equipment: unarmedResolvedEquipment(MINIMAL_GW_INSPIRED_PVP_V1.combat.armorReferenceLevel),
    ...overrides,
  };
}
