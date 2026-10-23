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
    ...overrides,
  };
}
