import {
  IMPLEMENTED_SKILLS,
  PROFESSIONS,
  defaultEquipmentFor,
  getSkill,
  type ProfessionId,
  type Skill,
} from "@vibewars/game-core";

import type { ImportResult } from "./build-transfer.js";
import { SKILL_BAR_SLOTS, validateBuild } from "./build-validation.js";
import {
  CHARACTER_SCHEMA_VERSION,
  isStoredCharacter,
  type StoredAttribute,
  type StoredCharacter,
} from "./schema.js";

/**
 * GW1 skill template codes (#494): the `OQcTAywkTJ…` strings GW1 players
 * share builds as. They hold the professions, the bought attribute
 * ranks and the eight skills, never equipment or a name.
 *
 * The code is base64 read as one bit stream: each character is six bits,
 * and every field is read lowest bit first across it. The layout is the
 * GW1 wiki's *Skill template format*; the field widths are themselves
 * fields, so the decoder takes any width and the encoder writes the
 * smallest.
 */

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
/** The template type of a skill template; every code starts with it, so with an `O`. */
const TEMPLATE_TYPE = 14;
/** The only version there is. Any other is refused, never adapted (ADR-0016). */
const TEMPLATE_VERSION = 0;

/** GW1's profession ids; 0 is "none", a secondary's only. */
const PROFESSION_IDS: Readonly<Record<ProfessionId, number>> = {
  warrior: 1,
  ranger: 2,
  monk: 3,
  necromancer: 4,
  mesmer: 5,
  elementalist: 6,
  assassin: 7,
  ritualist: 8,
  paragon: 9,
  dervish: 10,
};

/** GW1's attribute ids, keyed by ours: exactly the attributes `PROFESSIONS` has. */
export const ATTRIBUTE_IDS: Readonly<Record<string, number>> = {
  "mesmer.fast-casting": 0,
  "mesmer.illusion-magic": 1,
  "mesmer.domination-magic": 2,
  "mesmer.inspiration-magic": 3,
  "necromancer.blood-magic": 4,
  "necromancer.death-magic": 5,
  "necromancer.soul-reaping": 6,
  "necromancer.curses": 7,
  "elementalist.air-magic": 8,
  "elementalist.earth-magic": 9,
  "elementalist.fire-magic": 10,
  "elementalist.water-magic": 11,
  "elementalist.energy-storage": 12,
  "monk.healing-prayers": 13,
  "monk.smiting-prayers": 14,
  "monk.protection-prayers": 15,
  "monk.divine-favor": 16,
  "warrior.strength": 17,
  "warrior.axe-mastery": 18,
  "warrior.hammer-mastery": 19,
  "warrior.swordsmanship": 20,
  "warrior.tactics": 21,
  "ranger.beast-mastery": 22,
  "ranger.expertise": 23,
  "ranger.wilderness-survival": 24,
  "ranger.marksmanship": 25,
  "assassin.dagger-mastery": 29,
  "assassin.deadly-arts": 30,
  "assassin.shadow-arts": 31,
  "ritualist.communing": 32,
  "ritualist.restoration-magic": 33,
  "ritualist.channeling-magic": 34,
  "assassin.critical-strikes": 35,
  "ritualist.spawning-power": 36,
  "paragon.spear-mastery": 37,
  "paragon.command": 38,
  "paragon.motivation": 39,
  "paragon.leadership": 40,
  "dervish.scythe-mastery": 41,
  "dervish.wind-prayers": 42,
  "dervish.earth-prayers": 43,
  "dervish.mysticism": 44,
};

const professionOfGw = new Map(
  Object.entries(PROFESSION_IDS).map(([id, gw]) => [gw, id as ProfessionId]),
);
const attributeOfGw = new Map(Object.entries(ATTRIBUTE_IDS).map(([id, gw]) => [gw, id]));
const skillOfGw = new Map(
  IMPLEMENTED_SKILLS.flatMap((skill): [number, Skill][] =>
    skill.gwId === undefined ? [] : [[skill.gwId, skill]],
  ),
);

const NOT_A_TEMPLATE = "This is not a GW1 skill template.";
const CUT_SHORT = "This GW1 code is cut short.";

/**
 * Whether pasted text is a GW1 template code, so a paste on the editor
 * imports it. The whole text, trimmed, must be one: a sentence with a
 * code in it is not.
 */
export function looksLikeTemplate(text: string): boolean {
  return /^O[A-Za-z0-9+/]{7,63}$/.test(stripped(text));
}

function stripped(text: string): string {
  return text.trim().replace(/=+$/, "");
}

/** The fewest bits `value` fits in. */
function bitsFor(value: number): number {
  return Math.max(1, Math.ceil(Math.log2(value + 1)));
}

class BitWriter {
  private readonly bits: number[] = [];

  write(value: number, width: number): void {
    for (let bit = 0; bit < width; bit += 1) {
      this.bits.push((value >> bit) & 1);
    }
  }

  toString(): string {
    let code = "";
    for (let start = 0; start < this.bits.length; start += 6) {
      let sextet = 0;
      for (let bit = 0; bit < 6; bit += 1) {
        sextet |= (this.bits[start + bit] ?? 0) << bit;
      }
      code += BASE64.charAt(sextet);
    }
    return code;
  }
}

/** Thrown, and caught in `decodeTemplate`, when a field runs past the end. */
class CutShort extends Error {}

class BitReader {
  private position = 0;
  private readonly bits: readonly number[];

  constructor(bits: readonly number[]) {
    this.bits = bits;
  }

  read(width: number): number {
    if (this.position + width > this.bits.length) {
      throw new CutShort();
    }
    let value = 0;
    for (let bit = 0; bit < width; bit += 1) {
      value |= (this.bits[this.position + bit] ?? 0) << bit;
    }
    this.position += width;
    return value;
  }
}

export type EncodeResult =
  { readonly ok: true; readonly code: string } | { readonly ok: false; readonly problem: string };

/**
 * `character` as a GW1 template code: professions, the ranks bought
 * (never rune or headgear bonuses, which are equipment) and the bar.
 * A skill GW1 does not have makes a code impossible.
 */
export function encodeTemplate(character: StoredCharacter): EncodeResult {
  const skillIds: number[] = [];
  for (const id of character.skillBar) {
    if (id === null) {
      skillIds.push(0);
      continue;
    }
    const skill = getSkill(id);
    if (skill?.gwId === undefined) {
      const name = skill?.name ?? id;
      return { ok: false, problem: `${name} is not a GW1 skill, so this build has no GW1 code.` };
    }
    skillIds.push(skill.gwId);
  }
  const attributes = character.attributes.flatMap((attribute) => {
    const gw = ATTRIBUTE_IDS[attribute.attributeId];
    return attribute.rank > 0 && gw !== undefined ? [{ gw, rank: attribute.rank }] : [];
  });

  const writer = new BitWriter();
  writer.write(TEMPLATE_TYPE, 4);
  writer.write(TEMPLATE_VERSION, 4);
  writer.write(0, 2);
  const professionWidth = 4;
  writer.write(PROFESSION_IDS[character.primaryProfession], professionWidth);
  writer.write(
    character.secondaryProfession === undefined ? 0 : PROFESSION_IDS[character.secondaryProfession],
    professionWidth,
  );
  writer.write(attributes.length, 4);
  const attributeWidth = Math.max(4, bitsFor(Math.max(0, ...attributes.map(({ gw }) => gw))));
  writer.write(attributeWidth - 4, 4);
  for (const { gw, rank } of attributes) {
    writer.write(gw, attributeWidth);
    writer.write(rank, 4);
  }
  const skillWidth = Math.max(8, bitsFor(Math.max(0, ...skillIds)));
  writer.write(skillWidth - 8, 4);
  for (const id of skillIds) {
    writer.write(id, skillWidth);
  }
  return { ok: true, code: writer.toString() };
}

/**
 * What a decoded code adds to an import: the GW1 skill ids it named that
 * this game does not have, each now an empty slot (#494).
 */
export type TemplateImportResult =
  | (Extract<ImportResult, { ok: true }> & { readonly missingSkills: readonly number[] })
  | Extract<ImportResult, { ok: false }>;

/**
 * Read a GW1 template code as a new character. Like a JSON build it is
 * untrusted text, so this never throws: a malformed code is refused with
 * the reason, and a well-formed one is validated as any build is.
 *
 * The one exception to "never half-applies": a skill this game does not
 * have becomes an empty slot, and `missingSkills` says which.
 */
export function decodeTemplate(text: string, id: string, now: number): TemplateImportResult {
  const code = stripped(text);
  const bits: number[] = [];
  for (const char of code) {
    const sextet = BASE64.indexOf(char);
    if (sextet < 0) {
      return { ok: false, problems: [NOT_A_TEMPLATE] };
    }
    for (let bit = 0; bit < 6; bit += 1) {
      bits.push((sextet >> bit) & 1);
    }
  }
  try {
    return readTemplate(new BitReader(bits), id, now);
  } catch (error) {
    if (error instanceof CutShort) {
      return { ok: false, problems: [CUT_SHORT] };
    }
    throw error;
  }
}

function readTemplate(reader: BitReader, id: string, now: number): TemplateImportResult {
  if (reader.read(4) !== TEMPLATE_TYPE || reader.read(4) !== TEMPLATE_VERSION) {
    return { ok: false, problems: [NOT_A_TEMPLATE] };
  }
  const professionWidth = reader.read(2) * 2 + 4;
  const primaryGw = reader.read(professionWidth);
  const secondaryGw = reader.read(professionWidth);
  const problems: string[] = [];
  const primary = professionOfGw.get(primaryGw);
  if (primary === undefined) {
    problems.push(
      primaryGw === 0
        ? "This GW1 code has no primary profession."
        : `This GW1 code's primary profession ${String(primaryGw)} is not one of the ten.`,
    );
  }
  const secondary = secondaryGw === 0 ? undefined : professionOfGw.get(secondaryGw);
  if (secondaryGw !== 0 && secondary === undefined) {
    problems.push(
      `This GW1 code's secondary profession ${String(secondaryGw)} is not one of the ten.`,
    );
  }

  const attributeCount = reader.read(4);
  const attributeWidth = reader.read(4) + 4;
  const attributes: StoredAttribute[] = [];
  for (let index = 0; index < attributeCount; index += 1) {
    const gw = reader.read(attributeWidth);
    const rank = reader.read(4);
    const attributeId = attributeOfGw.get(gw);
    if (attributeId === undefined) {
      problems.push(`GW1 attribute ${String(gw)} is not in VibeWars.`);
      continue;
    }
    attributes.push({ attributeId, rank });
  }

  const skillWidth = reader.read(4) + 8;
  const skillBar: (string | null)[] = [];
  const missingSkills: number[] = [];
  for (let slot = 0; slot < SKILL_BAR_SLOTS; slot += 1) {
    const gw = reader.read(skillWidth);
    const skill = gw === 0 ? undefined : skillOfGw.get(gw);
    if (gw !== 0 && skill === undefined) {
      missingSkills.push(gw);
    }
    skillBar.push(skill?.id ?? null);
  }
  // Whatever follows the eighth skill is padding to a whole character.

  if (problems.length > 0 || primary === undefined) {
    return { ok: false, problems };
  }
  const name = [primary, secondary]
    .flatMap((profession) => (profession === undefined ? [] : [PROFESSIONS[profession].name]))
    .join("/");
  const character: StoredCharacter = {
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    id,
    name: `${name} build`,
    primaryProfession: primary,
    secondaryProfession: secondary,
    attributes,
    skillBar,
    // The format has no equipment: the primary's own, as a new character gets.
    equipment: defaultEquipmentFor(primary),
    updatedAt: now,
  };
  const invalid = validateBuild(character);
  if (invalid.length > 0) {
    return { ok: false, problems: invalid.map((problem) => problem.message) };
  }
  if (!isStoredCharacter(character)) {
    return { ok: false, problems: ["Imported build does not match the storage schema."] };
  }
  return { ok: true, character, missingSkills };
}

/**
 * What an import's toast adds for the skills a code named that this game
 * does not have: their GW1 ids, since the library has no names for them
 * yet. Nothing when none are missing.
 */
export function missingSkillsNote(missing: readonly number[]): string {
  if (missing.length === 0) {
    return "";
  }
  const count = missing.length === 1 ? "1 skill is" : `${String(missing.length)} skills are`;
  return `. ${count} not in VibeWars yet: GW1 skill ${missing.join(", ")}.`;
}
