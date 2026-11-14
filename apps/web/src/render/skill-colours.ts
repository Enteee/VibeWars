import type { Skill, SkillType } from "@vibewars/game-core";

/**
 * A skill's colour by its type (#3320), from the skill visuals study's
 * palette (docs/art/3191-skill-visuals.md, visual-style.md §1): the glow
 * at a caster's hand, and the tint of an impact on a body. One table, so
 * a hex reads violet wherever it shows.
 */

const VIOLET = 0xa77bff;
const BRASS = 0xe8c27a;
const GREEN = 0x76c96f;
const COOL = 0x9fdcff;
const STEEL = 0xdfe7f1;
const WARM_GOLD = 0xffd23d;

const TYPE_COLOURS: Partial<Record<SkillType, number>> = {
  hex: VIOLET,
  well: VIOLET,
  enchantment: BRASS,
  "nature-ritual": GREEN,
  "binding-ritual": GREEN,
  shout: COOL,
  chant: COOL,
  echo: COOL,
  stance: STEEL,
};

/** A spell that lays an area on the ground (Chaos Storm): violet, as a well is. */
const isMagicArea = (skill: Skill): boolean =>
  skill.type === "spell" && skill.effects.some((effect) => effect.kind === "create-ground-effect");

/** `skill`'s colour: its type's, warm gold for every type the table leaves out. */
export function skillColour(skill: Skill): number {
  return isMagicArea(skill) ? VIOLET : (TYPE_COLOURS[skill.type] ?? WARM_GOLD);
}

/** The types whose impact on a body is tinted by the type rather than by what it did (#1139). */
const IMPACT_TINTED: ReadonlySet<SkillType> = new Set([
  "hex",
  "enchantment",
  "stance",
  "preparation",
  "glyph",
  "weapon-spell",
]);

/** The tint of `skill`'s impact; `undefined`: coloured by what it did. */
export function impactTypeColour(skill: Skill): number | undefined {
  return IMPACT_TINTED.has(skill.type) ? skillColour(skill) : undefined;
}
