import { addCopyPool } from "./adrenaline.js";
import { copyKey } from "./cast-state.js";
import { getSkill } from "./catalog.js";
import { getStatusDefinition, type StatusId } from "./status.js";
import type { SkillBar } from "../build.js";
import type { Combatant, SkillEffect } from "./types.js";

/** Whether status `statusId` copies its bearer's next skill (#469). */
export function isEchoStatus(statusId: StatusId): boolean {
  return getStatusDefinition(statusId).triggers.some(({ effects }) =>
    effects.some(({ kind }) => kind === "echo"),
  );
}

/** Whether `effects`, or one nested in them, makes the skill a copier. */
function copies(effects: readonly SkillEffect[]): boolean {
  return effects.some((effect) =>
    effect.kind === "if"
      ? copies(effect.effects)
      : effect.kind === "copy-removed" ||
        effect.kind === "copy-disabled" ||
        effect.kind === "copy-elite" ||
        (effect.kind === "apply-status" && isEchoStatus(effect.statusId)),
  );
}

/**
 * Whether `skillId` puts another skill in a slot (#469, #1928): Arcane
 * Echo and Echo, which put an echo on their user, and Inspired
 * Enchantment's and Arcane Thievery's kind, which take one from the
 * target. The Mesmer's copy, not a Paragon's `"echo"` skill type (#1423).
 * One is never copied, and does not use up an echo already up.
 */
export function copiesSkill(skillId: string): boolean {
  return copies(getSkill(skillId)?.effects ?? []);
}

/**
 * What Arcane Mimicry copies off `bar` (#1965): its first elite from the
 * left that is not a form, as a Dervish's. `undefined`: none.
 */
export function mimickedElite(bar: SkillBar): string | undefined {
  return bar.find((skillId): skillId is string => {
    const skill = skillId === null ? undefined : getSkill(skillId);
    return skill?.elite === true && skill.type !== "form";
  });
}

/**
 * The slot of `ownSkillId` on `bearer`'s bar holds a copy of `skillId`,
 * under its own key, for `seconds`; then `ownSkillId` is back, and starts
 * its own recharge (#469, #1928). Not when `ownSkillId` is not on the bar,
 * or `skillId` is not in the game or is itself a copier.
 */
export function standIn(
  bearer: Combatant,
  ownSkillId: string,
  skillId: string,
  seconds: number,
): void {
  const own = getSkill(ownSkillId);
  const slot = bearer.skillBar.indexOf(ownSkillId);
  if (own === undefined || slot === -1 || getSkill(skillId) === undefined || copiesSkill(skillId)) {
    return;
  }
  const key = copyKey(skillId, slot);
  bearer.cast.override(slot, {
    skillId,
    key,
    remainingSeconds: seconds,
    restores: { skillId: ownSkillId, rechargeSeconds: own.rechargeSeconds },
  });
  addCopyPool(bearer, key);
}
