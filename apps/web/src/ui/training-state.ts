import type { TrainingScenario } from "@vibewars/game-core";

import type { EscapeIntent } from "../input/attack-key.js";
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
    `${key("target-next")}/right-click to target`,
    `${key("attack")}/double right-click attack`,
    "esc to release",
  ].join(" · ");
}

/**
 * Whether an edit should hand the keyboard back to the arena.
 *
 * Only when the player had taken control and nothing else has taken
 * focus since: a click on something that cannot hold focus, such as a
 * skill box, leaves it on `<body>`, so "armed" is the intent and
 * `activeElement` is the evidence. A focused name field or button wins.
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

/** What Esc does on the stage: one step at a time, in this order (#495). */
export type EscapeStep = EscapeIntent | "collapse" | "release";

/**
 * The match's Esc comes first: a cast, an attack or a walk in progress is
 * cancelled (#160, #300, #342), else the target is cleared (#1151). Then
 * an expanded arena collapses, keeping control; then control is
 * released. Esc never navigates away from the editor.
 */
export function escapeStep(intent: EscapeIntent | undefined, expanded: boolean): EscapeStep {
  if (intent !== undefined) {
    return intent;
  }
  return expanded ? "collapse" : "release";
}

/**
 * What the arena overlay says, if anything covers it: only an illegal
 * build is parked behind it (ADR-0020). An empty bar is a legal build
 * and plays, since walking, targeting and the weapon need no skill (#360).
 */
export function overlayMessage(problem: string | undefined): string | undefined {
  return problem === undefined ? undefined : `This build cannot be tested: ${problem}`;
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

/**
 * Who `id` is in the Training log: the scenario's name for a dummy,
 * else the name the match shows, a summoned spirit's "Recuperation"
 * (#1064), and only then the id.
 */
export function logActorName(
  id: string,
  names: ReadonlyMap<string, string> | undefined,
  players: readonly { readonly sessionId: string; readonly name: string }[] | undefined,
): string {
  return names?.get(id) ?? players?.find((player) => player.sessionId === id)?.name ?? id;
}
