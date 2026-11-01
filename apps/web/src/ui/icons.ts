import {
  PROFESSIONS,
  getInsignia,
  getOffhand,
  getSkill,
  getUniversalRune,
  getWeapon,
  type ChainRole,
  type CreatureLook,
  type EquippedRune,
  type OffhandId,
  type ProfessionId,
  type RuneTier,
  type SkillType,
  type WeaponId,
  runeDisplayName,
} from "@vibewars/game-core";

import { CREATURE_GLYPH } from "../render/arena-atlas.js";

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
  echo: "Echo",
  "weapon-spell": "Weapon Spell",
  "nature-ritual": "Nature Ritual",
  "binding-ritual": "Binding Ritual",
  ward: "Ward",
  well: "Well",
  "item-spell": "Item Spell",
  trap: "Trap",
  "pet-attack": "Pet Attack",
  form: "Form",
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

/** The kind glyph on a creature's plate in the arena (#1162), drawn in ink and tinted there. */
export function creatureIcon(look: CreatureLook): string {
  const { family, name } = CREATURE_GLYPH[look];
  return iconUrl(family, name);
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
  /** A rune's tier, drawn as pips by the stylesheet (#2058). */
  readonly tier?: RuneTier;
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

/** An insignia's icon (#2058): the shield plate with its emblem. An id this client does not know gets none. */
export function insigniaIcon(insigniaId: string): GearIcon | undefined {
  const insignia = getInsignia(insigniaId);
  return insignia === undefined
    ? undefined
    : { src: iconUrl("insignia", insignia.id), name: insignia.name };
}

/**
 * A rune's icon (#2058): a stone with its emblem, or with its profession's
 * glyph for an attribute rune. The tier is the caller's pips, from `data-tier`;
 * a rune whose name carries no tier has none.
 * An attribute rune of no known profession gets none.
 */
export function runeIcon(rune: EquippedRune): GearIcon | undefined {
  const name = runeDisplayName(rune);
  if (rune.kind === "universal") {
    const src = iconUrl("rune", rune.runeId);
    return getUniversalRune(rune.runeId)?.tiered === false
      ? { src, name }
      : { src, name, tier: rune.tier };
  }
  const profession = rune.attributeId.split(".")[0] ?? "";
  return Object.hasOwn(PROFESSIONS, profession)
    ? { src: iconUrl("rune", `attribute-${profession}`), name, tier: rune.tier }
    : undefined;
}

/** A weapon, off-hand, insignia or rune icon, named for a screen reader and a hover; a rune's tier goes in `data-tier`. */
export function gearIconImg(icon: GearIcon | undefined): HTMLImageElement | undefined {
  if (icon === undefined) {
    return undefined;
  }
  const img = document.createElement("img");
  img.className = "gear-icon";
  img.src = icon.src;
  img.alt = icon.name;
  img.title = icon.name;
  if (icon.tier !== undefined) {
    img.dataset.tier = icon.tier;
  }
  return img;
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
  // A map NPC's own skill (#1377), as Claim Resource, has no icon of its own.
  const skill = getSkill(skillId);
  return iconUrl("skill", skill === undefined || skill.npcOnly === true ? "unknown" : skillId);
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
