import { getSkill, type SkillType } from "@vibewars/game-core";

/**
 * The casting skill's type badge beside a body's cast bar (#1125, #487,
 * docs/art/art-direction.md "Skill type badges"): the same badge the skill
 * slot and the target frame show, so you can tell a hex from a spell
 * before you read its name. Static: reduced motion changes nothing.
 *
 * No Phaser here, so the layout can be tested in Node.
 */

/** The badge's side, world units: it scales with the bar under zoom. */
export const CAST_BADGE_SIZE = 8;
/** Between the badge's right edge and the bar's left. */
export const CAST_BADGE_GAP = 1;
/** The cast bar's width and height, world units, as the health bar's. */
export const CAST_BAR_WIDTH = 34;
export const CAST_BAR_HEIGHT = 4;
/** The cast bar's top above the body's centre, past its radius. */
export const CAST_BAR_RISE = 19;

/** The badge `skillId` wears; none for no cast or a skill this client does not know. */
export function castBadgeType(skillId: string | undefined): SkillType | undefined {
  return skillId === undefined ? undefined : getSkill(skillId)?.type;
}

/** The badge's centre for a body of `radius` at (`x`, `y`): left of its cast bar, centred on it. */
export function castBadgeLayout(x: number, y: number, radius: number): { x: number; y: number } {
  const left = x - CAST_BAR_WIDTH / 2;
  const top = y - radius - CAST_BAR_RISE;
  return { x: left - CAST_BADGE_GAP - CAST_BADGE_SIZE / 2, y: top + CAST_BAR_HEIGHT / 2 };
}
