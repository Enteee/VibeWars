import type { SkillBar, TrainingScenario } from "@vibewars/game-core";

import type { KeyLabeller } from "../input/key-labels.js";
import { actionLabel, codeLabel, type KeyAction, type Keymap } from "../input/keymap.js";
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

const ARROW_CODES = ["ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"];

/**
 * The hint under an armed arena, from the keymap (#302): "arrows move ·
 * Q–F cast · …" by default, "WASD move · 1–8 cast · …" in Classic.
 */
export function armedHint(keymap: Keymap, label: KeyLabeller = codeLabel): string {
  const moves = (["move-up", "move-left", "move-down", "move-right"] as const).map(
    (action) => keymap[action][0],
  );
  const move = moves.every((code, index) => code === ARROW_CODES[index])
    ? "arrows"
    : moves.map((code) => (code === undefined ? "" : label(code))).join("");
  const first = actionLabel(keymap, "skill-1", label);
  const last = actionLabel(keymap, "skill-8", label);
  const key = (action: KeyAction): string => actionLabel(keymap, action, label).toLowerCase();
  return [
    `${move} move`,
    `${first}–${last} cast`,
    `${key("target-next")}/click to target`,
    `${key("attack")}/double-click attack`,
    "esc to release",
  ].join(" · ");
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

/**
 * What the arena overlay says, if anything covers it. An empty bar is a
 * hint only where skills are the point: a weapon drill is played with
 * Space, so it stays uncovered, or the Dodge drill would shoot at a
 * dimmed arena (#162).
 */
export function overlayMessage(
  problem: string | undefined,
  skillBar: SkillBar,
  scenario: Pick<TrainingScenario, "exercises">,
): string | undefined {
  if (problem !== undefined) {
    return `This build cannot be tested: ${problem}`;
  }
  const weaponDrill = scenario.exercises.some(
    (mechanic) => mechanic === "auto-attacks" || mechanic === "dodging",
  );
  if (skillBar.every((id) => id === null) && !weaponDrill) {
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
