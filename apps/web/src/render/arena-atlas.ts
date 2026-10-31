import {
  IMPLEMENTED_SKILLS,
  type CreatureLook,
  type ProfessionId,
  type Skill,
} from "@vibewars/game-core";

/**
 * The arena's icon sheet (#1671): every icon the scene draws, packed into
 * one SVG that Vite composes from the committed icons at build and dev
 * time (`plugins/arena-atlas.ts`), so a match starts by rasterising one
 * texture, not hundreds.
 *
 * The sizes and frame names live here, and the plugin imports this file,
 * so the sheet and the scene cannot disagree on a size or on which skills
 * leave a ward. No Phaser and no `import.meta.env`, so the Vite config can
 * load it.
 */

/** Where the sheet and its frame map are, under the public dir. */
export const ARENA_ATLAS_SVG = "icons/atlas/arena.svg";
export const ARENA_ATLAS_JSON = "icons/atlas/arena.json";

/** One frame of the sheet, px. */
export interface AtlasFrame {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** The frame map served next to the sheet. */
export interface AtlasMap {
  readonly frames: Readonly<Record<string, AtlasFrame>>;
}

/** Drawn size of one status icon, in world pixels. */
export const STATUS_ICON_SIZE = 16;
/** The profession glyph before a name, screen px: the name's own 11 px (#281, #456). */
export const PROFESSION_GLYPH_SIZE = 11;
/**
 * The body glyph's texture size, px: 13 world units at the Close zoom
 * (1080 / 640) on a 2x display is about 44 px, so it stays crisp there.
 */
export const BODY_GLYPH_TEXTURE_SIZE = 48;
/** The cast badge's texture size, px: 8 world units at the Close zoom on a 2x display, and then some. */
export const CAST_BADGE_TEXTURE_SIZE = 32;
/** A ward's icon texture size, px, as the body glyph's (#1087). */
export const GROUND_ICON_TEXTURE_SIZE = 48;
/** The projectile sprites' grid, pointing along +x. */
export const PROJECTILE_WIDTH = 32;
export const PROJECTILE_HEIGHT = 12;

/**
 * The icon file each creature look shows, here so the menus and the sheet
 * agree. A look without its own glyph yet borrows one.
 */
export const CREATURE_GLYPH: Readonly<
  Record<CreatureLook, { readonly family: "creature" | "profession"; readonly name: string }>
> = {
  beast: { family: "creature", name: "beast" },
  "bone-minion": { family: "creature", name: "bone-minion" },
  "bone-horror": { family: "creature", name: "bone-horror" },
  "vampiric-horror": { family: "creature", name: "vampiric-horror" },
  "flesh-golem": { family: "creature", name: "flesh-golem" },
  "shambling-horror": { family: "creature", name: "shambling-horror" },
  spirit: { family: "creature", name: "spirit" },
  // Until the priest's own glyph is drawn (#1186): a spirit's.
  priest: { family: "creature", name: "spirit" },
  // Until the Guild Lord's own glyph is drawn (#1222): a Ranger's, for its bow.
  "guild-lord": { family: "profession", name: "ranger" },
  // Until the guards' own glyph is drawn (#1223): a Warrior's, for their plate.
  guard: { family: "profession", name: "warrior" },
  // Until the Ghostly Hero's own glyph is drawn (#1377): the priest's, tinted pale in the arena.
  "ghostly-hero": { family: "creature", name: "spirit" },
};

/** Whether `skill` leaves a ground effect (#1087), whose icon shows at the ward's centre. */
export function leavesGroundEffect(skill: Skill): boolean {
  return skill.effects.some((effect) => effect.kind === "create-ground-effect");
}

/** Every skill that leaves a ground effect: each has a frame on the sheet. */
export const GROUND_EFFECT_SKILLS: readonly string[] = IMPLEMENTED_SKILLS.filter(
  leavesGroundEffect,
).map((skill) => skill.id);

export function statusFrame(id: string): string {
  return `status/${id}`;
}

/** The glyph before a name. */
export function professionFrame(profession: ProfessionId): string {
  return `profession/${profession}`;
}

/** The glyph inside the body (#1037), larger than the name's: it is world sized. */
export function bodyProfessionFrame(profession: ProfessionId): string {
  return `body-profession/${profession}`;
}

/** A creature's kind glyph on its plate (#1162), at the body glyph's size. */
export function creatureFrame(look: CreatureLook): string {
  return `creature/${look}`;
}

/** Every file in `icons/skill-type/` is one, so the sheet takes the name as a string. */
export function skillTypeFrame(type: string): string {
  return `skill-type/${type}`;
}

export function projectileFrame(sprite: string): string {
  return `projectile/${sprite}`;
}

export function groundFrame(skillId: string): string {
  return `ground/${skillId}`;
}
