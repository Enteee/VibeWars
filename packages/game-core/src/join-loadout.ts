import {
  attributeRanksOf,
  defaultBuildEquipment,
  parsePlayerBuild,
  validatePlayerBuild,
  type BuildProblem,
  type PlayerBuild,
  type SkillBar,
} from "./build.js";
import { baseEnergyPipsFor, type BuildEquipment } from "./equipment/index.js";
import type { ProfessionId } from "./professions.js";
import type { AttributeRules } from "./ruleset.js";

/**
 * The skill bar a player gets when they bring no build of their own.
 *
 * Quick match and a first-time player both land here, so it is chosen to
 * be immediately playable: damage, a heal, a self-buff, an interrupt, a
 * hex, a condition and a cure — enough for a real fight with counterplay
 * on the very first join, without visiting the editor. Every attack skill
 * on it can be used with the house sword (ADR-0029).
 *
 * It is NOT a legal single-character build (no character has access to
 * all six of these professions' attributes), which is deliberate: it is
 * the house loadout, not a build anyone could make. A player who wants a
 * legal, tuned build makes one and brings it.
 */
export const DEFAULT_SKILL_BAR: SkillBar = [
  "elementalist.fireball",
  "monk.orison-of-healing",
  "warrior.sever-artery",
  "warrior.distracting-blow",
  "elementalist.armor-of-earth",
  "monk.mend-affliction",
  "necromancer.faintheartedness",
  "ranger.troll-unguent",
];

/** Attribute ranks that go with `DEFAULT_SKILL_BAR`. */
const DEFAULT_ATTRIBUTE_RANKS: ReadonlyMap<string, number> = new Map([
  ["elementalist.fire-magic", 12],
  ["monk.healing-prayers", 12],
  ["warrior.swordsmanship", 12],
  ["necromancer.curses", 12],
  ["ranger.wilderness-survival", 12],
]);

/**
 * The gear that goes with `DEFAULT_SKILL_BAR`.
 *
 * A warrior's kit, because the house bar is melee-capable and handing a
 * first-time player a wand to go with a sword skill would be a worse
 * first five seconds than any argument for neutrality.
 */
const DEFAULT_EQUIPMENT: BuildEquipment = defaultBuildEquipment("warrior");

/** What a joining player gets to play, after their claim has been checked. */
export interface JoinLoadout {
  readonly skillBar: SkillBar;
  readonly attributeRanks: ReadonlyMap<string, number>;
  readonly primaryProfession: ProfessionId;
  readonly secondaryProfession: ProfessionId | undefined;
  readonly equipment: BuildEquipment;
  /** Energy regeneration in pips, before effects (#502). */
  readonly baseEnergyPips: number;
}

export const HOUSE_LOADOUT: JoinLoadout = {
  skillBar: DEFAULT_SKILL_BAR,
  attributeRanks: DEFAULT_ATTRIBUTE_RANKS,
  primaryProfession: "warrior",
  secondaryProfession: undefined,
  equipment: DEFAULT_EQUIPMENT,
  // A caster's 4 pips, not the warrior's 2: five of the eight skills
  // are spells, and at 2 pips a first-time player gets one 10-energy
  // spell every 15 s once the opening energy is gone.
  baseEnergyPips: baseEnergyPipsFor("elementalist"),
};

/** Why a claimed build was turned down for the house loadout, for the host's log. */
export type JoinRefusal =
  | { readonly kind: "malformed" }
  | { readonly kind: "illegal"; readonly build: PlayerBuild; readonly problems: BuildProblem[] }
  | { readonly kind: "empty-bar"; readonly build: PlayerBuild };

/**
 * Decide what a joining player actually gets to play (brief §32), from
 * the build they claimed, `undefined` for none.
 *
 * The client sends a build; the host decides whether to honour it. An
 * illegal or malformed build is refused and replaced with the house
 * loadout rather than rejecting the join — being dropped at the door
 * because of a stale saved character is a miserable way to find out
 * something is wrong, and the player still gets a playable match.
 *
 * Nothing about the claimed build is trusted: not the attribute ranks
 * (which scale every skill), not the skill bar (which decides what can be
 * cast at all), and not the professions that gate both.
 */
export function resolveJoinLoadout(
  claimed: unknown,
  rules: AttributeRules,
): { readonly loadout: JoinLoadout; readonly refused: JoinRefusal | undefined } {
  if (claimed === undefined) {
    return { loadout: HOUSE_LOADOUT, refused: undefined };
  }
  const build = parsePlayerBuild(claimed);
  if (build === undefined) {
    return { loadout: HOUSE_LOADOUT, refused: { kind: "malformed" } };
  }
  const problems = validatePlayerBuild(build, rules);
  if (problems.length > 0) {
    return { loadout: HOUSE_LOADOUT, refused: { kind: "illegal", build, problems } };
  }
  if (build.skillBar.every((id) => id === null)) {
    return { loadout: HOUSE_LOADOUT, refused: { kind: "empty-bar", build } };
  }
  return {
    loadout: {
      // Gaps and all: the key of an empty slot does nothing (#347).
      skillBar: build.skillBar,
      attributeRanks: attributeRanksOf(build),
      primaryProfession: build.primaryProfession,
      secondaryProfession: build.secondaryProfession,
      equipment: build.equipment,
      baseEnergyPips: baseEnergyPipsFor(build.primaryProfession),
    },
    refused: undefined,
  };
}
