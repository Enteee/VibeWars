import { getSkill, type ProfessionId, type SkillType } from "@vibewars/game-core";

/**
 * Icon URLs for menus and the HUD (#75, docs/art/art-direction.md).
 *
 * Game-core says what a thing *is*; which picture shows it is this
 * client's business, so the mapping lives here and game-core stays free of
 * URLs. Every map is a `Record` over the game's own union, so a new skill
 * type or profession without an icon does not compile.
 */

function iconUrl(family: string, id: string): string {
  return `${import.meta.env.BASE_URL}icons/${family}/${id}.svg`;
}

/** The name a player reads, for `alt` and `title`. */
export const SKILL_TYPE_NAME: Readonly<Record<SkillType, string>> = {
  attack: "Attack",
  spell: "Spell",
  enchantment: "Enchantment",
  hex: "Hex",
  skill: "Skill",
};

export function skillTypeIcon(type: SkillType): string {
  return iconUrl("skill-type", type);
}

const PROFESSION_ICON: Readonly<Record<ProfessionId, string>> = {
  warrior: iconUrl("profession", "warrior"),
  ranger: iconUrl("profession", "ranger"),
  monk: iconUrl("profession", "monk"),
  necromancer: iconUrl("profession", "necromancer"),
  mesmer: iconUrl("profession", "mesmer"),
  elementalist: iconUrl("profession", "elementalist"),
  assassin: iconUrl("profession", "assassin"),
  ritualist: iconUrl("profession", "ritualist"),
  paragon: iconUrl("profession", "paragon"),
  dervish: iconUrl("profession", "dervish"),
};

export function professionIcon(profession: ProfessionId): string {
  return PROFESSION_ICON[profession];
}

/**
 * A skill's type badge, as markup. Named in `alt` and `title`, so a screen
 * reader and a hover both say what the shape means.
 */
export function skillTypeBadgeHtml(type: SkillType): string {
  const name = SKILL_TYPE_NAME[type];
  return `<img class="skill-type-badge" src="${skillTypeIcon(type)}" alt="${name}" title="${name}">`;
}

/**
 * The badge for a skill on a bar, by id: the HUD and the Training Ground
 * both show it (#150). A skill this client does not know gets none.
 */
export function skillBadgeHtml(skillId: string): string {
  const type = getSkill(skillId)?.type;
  return type === undefined ? "" : skillTypeBadgeHtml(type);
}

/** The HUD's mute button (#112): what the sound is now, not what a click does. */
export function soundIcon(muted: boolean): string {
  return iconUrl("ui", muted ? "sound-off" : "sound-on");
}

/** The HUD's target panel while you auto-attack that target (#160). */
export function attackingIcon(): string {
  return iconUrl("ui", "attacking");
}

/** The music's own mute (#372), in the jukebox and on the HUD's ♪ button. */
export function musicIcon(muted: boolean): string {
  return iconUrl("ui", muted ? "music-off" : "music-on");
}
