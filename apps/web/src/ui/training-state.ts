import type { TrainingScenario } from "@vibewars/game-core";

import type { StoredCharacter } from "../storage/schema.js";

/**
 * The Training Ground panel's decisions, as pure functions (#2 §6.3,
 * §6.4), so they are testable without a DOM.
 */

/**
 * Everything about a character that changes how it fights, as one
 * string: equal signatures mean the arena has nothing to re-arm.
 *
 * Attributes are sorted, because `setRank` appends the attribute it
 * changed, and a mere reordering must not reset the meter. Name and
 * `updatedAt` are left out: renaming is not re-arming.
 */
export function buildSignature(character: StoredCharacter): string {
  const attributes = [...character.attributes]
    .filter((attribute) => attribute.rank > 0)
    .sort((a, b) => a.attributeId.localeCompare(b.attributeId))
    .map((attribute) => `${attribute.attributeId}=${String(attribute.rank)}`);
  return JSON.stringify([
    character.primaryProfession,
    character.secondaryProfession ?? null,
    attributes,
    character.skillBar,
    character.equipment,
  ]);
}

/** The bar slot a key casts, or `undefined` for any other key. 1–8, as in a match. */
export function slotForKey(key: string, barLength: number): number | undefined {
  if (!/^[1-8]$/.test(key)) {
    return undefined;
  }
  const slot = Number.parseInt(key, 10) - 1;
  return slot < barLength ? slot : undefined;
}

/**
 * Whether a re-render should hand the keyboard back to the arena.
 *
 * Only when the player had taken control and nothing else has taken
 * focus since: re-rendering detaches the stage, and Chromium moves focus
 * to `<body>` without reliably firing `blur`, so "armed" is the intent
 * and `activeElement` is the evidence. A focused name field wins.
 */
export function shouldRestoreFocus(armed: boolean, activeIsBodyOrNone: boolean): boolean {
  return armed && activeIsBodyOrNone;
}

/** The scenario to open with: the one last chosen, if it still exists, else the first. */
export function resolveScenarioId(
  stored: string | undefined,
  scenarios: readonly TrainingScenario[],
): string | undefined {
  if (stored !== undefined && scenarios.some((scenario) => scenario.id === stored)) {
    return stored;
  }
  return scenarios[0]?.id;
}

/** What the arena overlay says, if anything covers it. */
export function overlayMessage(
  problem: string | undefined,
  skillBar: readonly string[],
): string | undefined {
  if (problem !== undefined) {
    return `This build cannot be tested: ${problem}`;
  }
  if (skillBar.length === 0) {
    return "Equip a skill to start testing.";
  }
  return undefined;
}

export const SCENARIO_STORAGE_KEY = "vibewars.training.scenario";

/**
 * The last scenario this viewer picked. A per-viewer convenience: storage
 * may be missing or throw (private mode, blocked site data), and the
 * panel opens on the first scenario then.
 */
export function loadScenarioChoice(storage: () => Storage): string | undefined {
  try {
    return storage().getItem(SCENARIO_STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function saveScenarioChoice(storage: () => Storage, id: string): void {
  try {
    storage().setItem(SCENARIO_STORAGE_KEY, id);
  } catch {
    // Not remembering the choice costs one click next time; nothing else.
  }
}
