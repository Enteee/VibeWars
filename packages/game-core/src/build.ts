import type { AttributeAllocation } from "./attributes.js";
import {
  CharacterValidationError,
  accessibleAttributeIds,
  validateCharacter,
  type Character,
} from "./character.js";
import {
  defaultEquipmentFor,
  parseBuildEquipment,
  validateEquipment,
  type BuildEquipment,
} from "./equipment/index.js";
import { PROFESSIONS, skillProfessionName, type ProfessionId } from "./professions.js";
import type { AttributeRules } from "./ruleset.js";
import { IMPLEMENTED_SKILLS, getSkill } from "./skills/catalog.js";
import type { Skill } from "./skills/types.js";

/**
 * A playable build: a character plus the skill bar they take into a match
 * (brief §5, §17).
 *
 * `character.ts` deliberately left the skill bar out until the skill
 * engine existed. It does now, and the build has to live in `game-core`
 * rather than in the web client, because the **server** is the thing that
 * must validate it (brief §32: validate build validity, attribute
 * validity, skill ownership). A build the client vouches for is not
 * validated at all.
 */

export const SKILL_BAR_SLOTS = 8;

/**
 * Skill ids by slot: index i is the skill under key `skill-(i+1)`, `null`
 * an empty slot. Nothing closes the gaps up, so a key always means its
 * slot (#347).
 */
export type SkillBar = readonly (string | null)[];

export interface PlayerBuild {
  readonly name: string;
  readonly primaryProfession: ProfessionId;
  readonly secondaryProfession: ProfessionId | undefined;
  readonly attributes: readonly AttributeAllocation[];
  /** Skill ids by slot; `null` is an empty slot. Always `SKILL_BAR_SLOTS` long. */
  readonly skillBar: SkillBar;
  /** Weapon, off-hand and armor (ADR-0012). */
  readonly equipment: BuildEquipment;
}

/** GW1's elite rule (#459), as `validatePlayerBuild` reports it. */
export const ONE_ELITE_PER_BAR = "Only one elite skill per bar";

export interface BuildProblem {
  readonly field: string;
  readonly message: string;
}

export function isProfessionId(value: unknown): value is ProfessionId {
  return typeof value === "string" && Object.hasOwn(PROFESSIONS, value);
}

/** "an Elementalist", "a Monk". */
function article(word: string): string {
  return `${/^[AEIOU]/.test(word) ? "an" : "a"} ${word}`;
}

/** The character half of a build, for `validateCharacter`. */
export function toCharacter(build: PlayerBuild, id: string): Character {
  return {
    id,
    name: build.name,
    primaryProfession: build.primaryProfession,
    secondaryProfession: build.secondaryProfession,
    attributes: build.attributes,
  };
}

/**
 * May a character of these professions equip `skill`? Only if it is a
 * skill of its primary or secondary: the same rule the attribute
 * allocator enforces, and the one that covers a "No Attribute" skill.
 * A Common skill (#474) any character may equip.
 */
function hasProfessionOf(skill: Skill, build: PlayerBuild): boolean {
  return (
    skill.profession === "common" ||
    skill.profession === build.primaryProfession ||
    skill.profession === build.secondaryProfession
  );
}

/** Skills this build may equip: those of a profession it has. */
export function equippableSkills(build: PlayerBuild): typeof IMPLEMENTED_SKILLS {
  return IMPLEMENTED_SKILLS.filter((skill) => hasProfessionOf(skill, build));
}

/**
 * Every problem with a build, as a list rather than a thrown first error —
 * an editor should show everything that is wrong at once, and a server
 * log should name every reason it refused.
 */
export function validatePlayerBuild(build: PlayerBuild, rules: AttributeRules): BuildProblem[] {
  const problems: BuildProblem[] = [];

  try {
    validateCharacter(toCharacter(build, "validation"), rules);
  } catch (error) {
    if (error instanceof CharacterValidationError) {
      // `validateCharacter` formats one problem per line; split them back
      // out so each can be attributed to a field.
      for (const line of error.message.split("\n").slice(1)) {
        problems.push({ field: "character", message: line.replace(/^\s*-\s*/, "") });
      }
    } else {
      throw error;
    }
  }

  if (build.skillBar.length !== SKILL_BAR_SLOTS) {
    problems.push({
      field: "skillBar",
      message: `skill bar must have exactly ${String(SKILL_BAR_SLOTS)} slots, found ${String(
        build.skillBar.length,
      )}`,
    });
  }

  const accessible = new Set(
    accessibleAttributeIds(build.primaryProfession, build.secondaryProfession),
  );

  problems.push(
    ...validateEquipment(build.equipment, {
      primaryProfession: build.primaryProfession,
      secondaryProfession: build.secondaryProfession,
      accessibleAttributeIds: accessible,
    }),
  );

  const seen = new Set<string>();
  const elites = new Set<string>();
  build.skillBar.forEach((skillId, index) => {
    if (skillId === null) {
      return;
    }
    const skill = getSkill(skillId);
    if (skill === undefined) {
      problems.push({
        field: `skillBar[${String(index)}]`,
        message: `unknown or not-yet-implemented skill ${skillId}`,
      });
      return;
    }
    // Skill ownership (brief §32). Filtering the editor's dropdown is a
    // UI convenience; this is the rule. A build can also arrive from an
    // import, from older storage, or from a client that simply made it up.
    if (!hasProfessionOf(skill, build)) {
      problems.push({
        field: `skillBar[${String(index)}]`,
        message: `${skill.name} is ${article(skillProfessionName(skill.profession))} skill, which this character cannot access`,
      });
    }
    if (seen.has(skillId)) {
      problems.push({
        field: `skillBar[${String(index)}]`,
        message: `${skillId} appears more than once on the bar`,
      });
    }
    seen.add(skillId);
    if (skill.elite) {
      elites.add(skillId);
    }
  });
  // Counted by id, so the same elite twice is the duplicate above and
  // not an elite problem as well.
  if (elites.size > 1) {
    problems.push({ field: "skillBar", message: ONE_ELITE_PER_BAR });
  }

  return problems;
}

/** Attribute ranks as the simulation wants them. */
export function attributeRanksOf(build: PlayerBuild): ReadonlyMap<string, number> {
  return new Map(build.attributes.map((a) => [a.attributeId, a.rank]));
}

/**
 * Parse a build off the wire.
 *
 * Returns `undefined` rather than throwing for anything malformed: this
 * runs on join, and a hostile or stale client must not be able to take
 * the room down (brief §27). Structure only — whether the build is
 * *legal* is `validatePlayerBuild`'s job, kept separate so the server can
 * report "that is not a build" and "that build is illegal" differently.
 */
export function parsePlayerBuild(value: unknown): PlayerBuild | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const record = value as Record<string, unknown>;

  if (typeof record.name !== "string" || !isProfessionId(record.primaryProfession)) {
    return undefined;
  }
  const secondaryRaw = record.secondaryProfession ?? null;
  if (secondaryRaw !== null && !isProfessionId(secondaryRaw)) {
    return undefined;
  }

  if (!Array.isArray(record.attributes)) {
    return undefined;
  }
  const attributes: AttributeAllocation[] = [];
  for (const entry of record.attributes as readonly unknown[]) {
    if (typeof entry !== "object" || entry === null) {
      return undefined;
    }
    const allocation = entry as Record<string, unknown>;
    // Integer-and-finite: NaN and Infinity would poison the point
    // arithmetic, and both can reach here from a non-JS encoder.
    if (typeof allocation.attributeId !== "string" || !Number.isInteger(allocation.rank)) {
      return undefined;
    }
    attributes.push({ attributeId: allocation.attributeId, rank: allocation.rank as number });
  }

  if (!Array.isArray(record.skillBar) || record.skillBar.length !== SKILL_BAR_SLOTS) {
    return undefined;
  }
  const skillBar: (string | null)[] = [];
  for (const entry of record.skillBar as readonly unknown[]) {
    if (entry !== null && typeof entry !== "string") {
      return undefined;
    }
    skillBar.push(entry);
  }

  const equipment = parseBuildEquipment(record.equipment);
  if (equipment === undefined) {
    return undefined;
  }

  return {
    name: record.name,
    primaryProfession: record.primaryProfession,
    secondaryProfession: isProfessionId(secondaryRaw) ? secondaryRaw : undefined,
    attributes,
    skillBar,
    equipment,
  };
}

/**
 * The gear a profession starts with, re-exported here so callers that
 * only know about builds do not have to reach into `equipment/`.
 */
export function defaultBuildEquipment(profession: ProfessionId): BuildEquipment {
  return defaultEquipmentFor(profession);
}
