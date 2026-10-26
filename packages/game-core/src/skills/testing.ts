import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { CastState } from "./cast-state.js";
import {
  STATUS_DEFINITIONS,
  StatusSet,
  isStatusId,
  type StatusDefinition,
  type StatusId,
} from "./status.js";
import type { Combatant } from "./types.js";

/**
 * Test/benchmark helper for building combatants. Lives in `src/` rather
 * than a test file because headless simulation tooling (brief §15, §28)
 * will want it too.
 */
export function makeCombatant(overrides: Partial<Combatant> & { id: string }): Combatant {
  const statuses = overrides.statuses ?? new StatusSet();
  return {
    health: 500,
    maxHealth: 500,
    energy: 50,
    maxEnergy: 50,
    baseEnergyPips: 0,
    adrenaline: 0,
    attributeRanks: new Map(),
    team: 0,
    dead: false,
    statuses,
    cast: new CastState(overrides.id, statuses),
    attack: undefined,
    knockdownRemaining: 0,
    soulReapingTriggers: [],
    // Armor at the reference level, so an unconfigured test combatant
    // takes damage for exactly its stated amount. A test that wants to
    // exercise mitigation says so explicitly.
    equipment: unarmedResolvedEquipment(MINIMAL_GW_INSPIRED_PVP_V1.combat.armorReferenceLevel),
    ...overrides,
  };
}

/**
 * Run `fn` with these statuses speeding up or slowing down attacks. No
 * catalog status does yet (ADR-0029), so a test of the hook lends the
 * multiplier to an existing one for the length of `fn`.
 */
export function withAttackDuration<T>(
  multipliers: Partial<Record<StatusId, number>>,
  fn: () => T,
): T {
  const overrides: Partial<Record<StatusId, Partial<StatusDefinition>>> = {};
  for (const [id, multiplier] of Object.entries(multipliers)) {
    if (isStatusId(id)) {
      overrides[id] = { attackDurationMultiplier: multiplier };
    }
  }
  return withStatusDefinitions(overrides, fn);
}

/**
 * Run `fn` with these statuses' definitions changed: how a test reaches
 * a hook no catalog status uses yet, `preventsKnockdown` say, or makes
 * a chance certain.
 */
export function withStatusDefinitions<T>(
  overrides: Partial<Record<StatusId, Partial<StatusDefinition>>>,
  fn: () => T,
): T {
  const table: Record<StatusId, StatusDefinition> = STATUS_DEFINITIONS;
  const saved = { ...table };
  try {
    for (const [id, override] of Object.entries(overrides)) {
      if (isStatusId(id)) {
        table[id] = { ...table[id], ...override, id };
      }
    }
    return fn();
  } finally {
    Object.assign(table, saved);
  }
}
