import { ARMOR_SLOTS, type BuildProblem } from "@vibewars/game-core";

import { runeName, skillName } from "../i18n/game-names.js";
import { t } from "../i18n/index.js";
import { validateBuild } from "../storage/build-validation.js";
import type { StoredCharacter } from "../storage/schema.js";

/**
 * A build's problems in the player's words (#566, #3822): what the
 * editor's chip lists, what the test area shows instead of starting, and
 * what a match's toast names when it swaps the build out.
 */

/** The part of the editor a problem is about, which its line jumps to. */
export type ProblemCause =
  | { readonly kind: "name" }
  | { readonly kind: "professions" }
  | { readonly kind: "attributes" }
  | { readonly kind: "bar" }
  | { readonly kind: "slot"; readonly slot: number }
  | { readonly kind: "gear"; readonly field: string };

/** One line of the problems chip, before it knows the page (#566). */
export interface EditorProblem {
  readonly text: string;
  readonly blocking: boolean;
  readonly cause: ProblemCause;
}

/** A message as a sentence: capitalised, with a full stop. */
function sentence(message: string): string {
  const capitalised = message.charAt(0).toUpperCase() + message.slice(1);
  return /[.!?]$/.test(capitalised) ? capitalised : `${capitalised}.`;
}

const SLOT_FIELD = /^skillBar\[(\d+)\]$/;
const DUPLICATE = " appears more than once on the bar";

/** A gear problem in words: a duplicate rune in the player's language (#3822), the rest as the validator says it. */
function gearProblemText(character: StoredCharacter, problem: BuildProblem): string {
  const slot = /^equipment\.armor\.(\w+)$/.exec(problem.field)?.[1];
  const piece = ARMOR_SLOTS.find((armorSlot) => armorSlot === slot);
  const rune = piece === undefined ? null : character.equipment.armor[piece].rune;
  if (rune === null || problem.code === undefined) {
    return sentence(problem.message);
  }
  const key =
    problem.code === "duplicate-rune"
      ? "buildEditor.duplicateRune"
      : "buildEditor.duplicateAttributeRune";
  return t(key, { rune: runeName(rune) });
}

/** What stops `character` saving, as plain sentences that say where. */
export function blockingProblems(character: StoredCharacter): EditorProblem[] {
  return validateBuild(character).map((problem): EditorProblem => {
    const slotMatch = SLOT_FIELD.exec(problem.field);
    if (slotMatch !== null) {
      const slot = Number(slotMatch[1]);
      const duplicate = problem.message.endsWith(DUPLICATE)
        ? problem.message.slice(0, -DUPLICATE.length)
        : undefined;
      const text =
        duplicate === undefined
          ? t("buildEditor.slotProblem", { slot: slot + 1, problem: sentence(problem.message) })
          : t("buildEditor.duplicateSkill", { skill: skillName(duplicate) });
      return { text, blocking: true, cause: { kind: "slot", slot } };
    }
    if (problem.field.startsWith("equipment")) {
      return {
        text: gearProblemText(character, problem),
        blocking: true,
        cause: { kind: "gear", field: problem.field },
      };
    }
    if (problem.field === "character" && problem.message === "name must not be empty") {
      return { text: t("buildEditor.nameMissing"), blocking: true, cause: { kind: "name" } };
    }
    if (problem.field === "character" && problem.message.startsWith("secondary profession")) {
      return { text: sentence(problem.message), blocking: true, cause: { kind: "professions" } };
    }
    if (problem.field === "character") {
      return { text: sentence(problem.message), blocking: true, cause: { kind: "attributes" } };
    }
    return { text: sentence(problem.message), blocking: true, cause: { kind: "bar" } };
  });
}
