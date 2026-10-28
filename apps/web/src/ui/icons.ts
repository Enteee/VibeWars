import {
  getOffhand,
  getSkill,
  getWeapon,
  type ChainRole,
  type CreatureLook,
  type OffhandId,
  type ProfessionId,
  type SkillType,
  type WeaponId,
} from "@vibewars/game-core";

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
  signet: "Signet",
  shout: "Shout",
  stance: "Stance",
  preparation: "Preparation",
  glyph: "Glyph",
  chant: "Chant",
  "weapon-spell": "Weapon Spell",
  "nature-ritual": "Nature Ritual",
  "binding-ritual": "Binding Ritual",
  ward: "Ward",
  well: "Well",
  trap: "Trap",
  "pet-attack": "Pet Attack",
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

const CREATURE_ICON: Readonly<Record<CreatureLook, string>> = {
  beast: iconUrl("creature", "beast"),
  "bone-minion": iconUrl("creature", "bone-minion"),
  "bone-horror": iconUrl("creature", "bone-horror"),
  spirit: iconUrl("creature", "spirit"),
  // Until the priest's own glyph is drawn (#1186): a spirit's.
  priest: iconUrl("creature", "spirit"),
  // Until the Guild Lord's own glyph is drawn (#1222): a Ranger's, for its bow.
  "guild-lord": iconUrl("profession", "ranger"),
  // Until the guards' own glyph is drawn (#1223): a Warrior's, for their plate.
  guard: iconUrl("profession", "warrior"),
};

/** The kind glyph on a creature's plate in the arena (#1162), drawn in ink and tinted there. */
export function creatureIcon(look: CreatureLook): string {
  return CREATURE_ICON[look];
}

const WEAPON_ICON: Readonly<Record<WeaponId, string>> = {
  unarmed: iconUrl("weapon", "unarmed"),
  sword: iconUrl("weapon", "sword"),
  axe: iconUrl("weapon", "axe"),
  hammer: iconUrl("weapon", "hammer"),
  daggers: iconUrl("weapon", "daggers"),
  scythe: iconUrl("weapon", "scythe"),
  spear: iconUrl("weapon", "spear"),
  wand: iconUrl("weapon", "wand"),
  staff: iconUrl("weapon", "staff"),
  flatbow: iconUrl("weapon", "flatbow"),
  shortbow: iconUrl("weapon", "shortbow"),
  longbow: iconUrl("weapon", "longbow"),
  "recurve-bow": iconUrl("weapon", "recurve-bow"),
  hornbow: iconUrl("weapon", "hornbow"),
};

const OFFHAND_ICON: Readonly<Record<OffhandId, string>> = {
  shield: iconUrl("offhand", "shield"),
  focus: iconUrl("offhand", "focus"),
};

/** A picture and the name a player reads for it, for `src`, `alt` and `title`. */
export interface GearIcon {
  readonly src: string;
  readonly name: string;
}

/**
 * A weapon's icon (#419): its arena silhouette, pointing up. An id this
 * client does not know gets none.
 */
export function weaponIcon(weaponId: string): GearIcon | undefined {
  const weapon = getWeapon(weaponId);
  return weapon === undefined ? undefined : { src: WEAPON_ICON[weapon.id], name: weapon.name };
}

/** An off-hand's icon (#419), as `weaponIcon`. */
export function offhandIcon(offhandId: string): GearIcon | undefined {
  const offhand = getOffhand(offhandId);
  return offhand === undefined ? undefined : { src: OFFHAND_ICON[offhand.id], name: offhand.name };
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
 * A skill's own icon (#719), by id: a profession plate, one glyph for its
 * effect, a modifier. An id this client does not know gets the bare plate.
 */
export function skillIcon(skillId: string): string {
  return iconUrl("skill", getSkill(skillId) === undefined ? "unknown" : skillId);
}

/** A skill's icon as markup, `size` px square. Decorative: the name sits beside it. */
export function skillIconHtml(skillId: string, size: number): string {
  return `<img class="skill-icon" src="${skillIcon(skillId)}" alt="" width="${String(size)}" height="${String(size)}">`;
}

/**
 * The badge for a skill on a bar, by id: the HUD and the Training Ground
 * both show it (#150). A skill this client does not know gets none.
 */
export function skillBadgeHtml(skillId: string): string {
  const type = getSkill(skillId)?.type;
  return type === undefined ? "" : skillTypeBadgeHtml(type);
}

/**
 * Whether a bar's skill wears the elite frame (#459), by id, beside its
 * badge. A skill this client does not know is not.
 */
export function isEliteSkill(skillId: string): boolean {
  return getSkill(skillId)?.elite === true;
}

/** The HUD's mute button (#112): what the sound is now, not what a click does. */
export function soundIcon(muted: boolean): string {
  return iconUrl("ui", muted ? "sound-off" : "sound-on");
}

/** The HUD's target panel while you auto-attack that target (#160). */
export function attackingIcon(): string {
  return iconUrl("ui", "attacking");
}

const CHAIN_MARK_ICON: Readonly<Record<ChainRole, string>> = {
  lead: iconUrl("ui", "chain-lead"),
  "off-hand": iconUrl("ui", "chain-off-hand"),
  dual: iconUrl("ui", "chain-dual"),
};

/** Your dagger chain mark on the target, by its target health (#916). */
export function chainMarkIcon(role: ChainRole): string {
  return CHAIN_MARK_ICON[role];
}

/** The music's own mute (#372), on the HUD's ♪ button. */
export function musicIcon(muted: boolean): string {
  return iconUrl("ui", muted ? "music-off" : "music-on");
}

/** The ⚙ that opens Options (#454), in the top bar and the HUD. */
export function settingsIcon(): string {
  return iconUrl("ui", "settings");
}

/** The [?] of the top bar and the HUD: the player docs (#1257). */
export function helpIcon(): string {
  return iconUrl("ui", "help");
}

/** The fullscreen toggle (#454): what the window is now, not what a click does. */
export function fullscreenIcon(fullscreen: boolean): string {
  return iconUrl("ui", fullscreen ? "fullscreen-exit" : "fullscreen");
}
