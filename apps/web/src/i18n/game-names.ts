import {
  INSIGNIAS,
  OFFHANDS,
  PROFESSIONS,
  SKILLS_BY_ID,
  STATUS_DEFINITIONS,
  UNIVERSAL_RUNES,
  WEAPONS,
  WEAPON_MODS,
  type EquippedRune,
  type RuneTier,
  type SkillProfession,
} from "@vibewars/game-core";

import { ARENA_MAPS } from "../net/maps.js";
import { TRAINING_MAPS } from "../training/maps.js";
import { t, type MessageKey } from "./index.js";

/**
 * The names of game data in one language (#2663, ADR-0050), each kind
 * keyed by id. English is not a file: it is read from the game data
 * itself, so there is no English copy to keep in step. Other languages
 * ship one as `locales/<code>/game.ts`, loaded with their `ui.ts`.
 *
 * Only what is drawn goes through here. Ids, and the English the data
 * holds, stay what is stored, sent and signed.
 */
export interface GameNames {
  readonly skills: Readonly<Record<string, string>>;
  readonly statuses: Readonly<Record<string, string>>;
  readonly professions: Readonly<Record<string, string>>;
  readonly attributes: Readonly<Record<string, string>>;
  readonly items: Readonly<Record<string, string>>;
  readonly maps: Readonly<Record<string, string>>;
}

const byId = (entries: Iterable<{ readonly id: string; readonly name: string }>) =>
  Object.fromEntries([...entries].map((entry) => [entry.id, entry.name]));

/** The English names, straight from the game data. */
export const ENGLISH_NAMES: GameNames = {
  skills: byId(SKILLS_BY_ID.values()),
  statuses: byId(Object.values(STATUS_DEFINITIONS)),
  // "common" is the skills no profession owns: a profession to the library.
  professions: { ...byId(Object.values(PROFESSIONS)), common: "Common" },
  attributes: byId(Object.values(PROFESSIONS).flatMap((profession) => profession.attributes)),
  items: byId([
    ...Object.values(WEAPONS),
    ...Object.values(OFFHANDS),
    ...Object.values(INSIGNIAS),
    ...Object.values(UNIVERSAL_RUNES),
    ...WEAPON_MODS,
  ]),
  maps: byId([...ARENA_MAPS, ...TRAINING_MAPS.values()]),
};

let names: GameNames = ENGLISH_NAMES;

/** Draw game data with `table` from now on: the picked language's `game.ts`. */
export function setGameNames(table: GameNames): void {
  names = table;
}

// An id the data lacks is wrong data: its id is more use shown than hidden.
// Only the table's own keys: `constructor` is no name (#2786).
const lookup = (kind: keyof GameNames, id: string): string => {
  const table = names[kind];
  return Object.hasOwn(table, id) ? (table[id] ?? id) : id;
};

export const skillName = (id: string): string => lookup("skills", id);
export const statusName = (id: string): string => lookup("statuses", id);
export const professionName = (id: SkillProfession): string => lookup("professions", id);
export const attributeName = (id: string): string => lookup("attributes", id);
/** A weapon, off-hand, insignia, universal rune or weapon mod. */
export const itemName = (id: string): string => lookup("items", id);
export const mapName = (id: string): string => lookup("maps", id);

const TIER: Readonly<Record<RuneTier, MessageKey>> = {
  minor: "gearEditor.tierMinor",
  major: "gearEditor.tierMajor",
  superior: "gearEditor.tierSuperior",
};

/** An equipped rune with its tier: "Superior Rune of Vigor". */
export function runeName(rune: EquippedRune): string {
  if (rune.kind === "attribute") {
    return t("gearEditor.runeOfAttribute", {
      tier: t(TIER[rune.tier]),
      attribute: attributeName(rune.attributeId),
    });
  }
  const name = itemName(rune.runeId);
  return UNIVERSAL_RUNES[rune.runeId].tiered
    ? t("gearEditor.tieredRune", { tier: t(TIER[rune.tier]), rune: name })
    : name;
}
