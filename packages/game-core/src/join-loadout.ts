import {
  attributeRanksOf,
  parsePlayerBuild,
  validatePlayerBuild,
  type BuildProblem,
  type PlayerBuild,
  type SkillBar,
} from "./build.js";
import type { BuildEquipment } from "./equipment/index.js";
import type { ProfessionId } from "./professions.js";
import type { AttributeRules } from "./ruleset.js";
import { pickStarterBuild } from "./starter-builds.js";

/** What a joining player gets to play, after their claim has been checked. */
export interface JoinLoadout {
  readonly skillBar: SkillBar;
  readonly attributeRanks: ReadonlyMap<string, number>;
  readonly primaryProfession: ProfessionId;
  readonly secondaryProfession: ProfessionId | undefined;
  readonly equipment: BuildEquipment;
}

/** What `build` plays as. */
export function loadoutOf(build: PlayerBuild): JoinLoadout {
  return {
    // Gaps and all: the key of an empty slot does nothing (#347).
    skillBar: build.skillBar,
    attributeRanks: attributeRanksOf(build),
    primaryProfession: build.primaryProfession,
    secondaryProfession: build.secondaryProfession,
    equipment: build.equipment,
  };
}

/** Why a claimed build was turned down for a starter build, for the host's log. */
export type JoinRefusal =
  | { readonly kind: "malformed" }
  | { readonly kind: "illegal"; readonly build: PlayerBuild; readonly problems: BuildProblem[] };

/**
 * Decide what a joining player actually gets to play (brief §32), from
 * the build they claimed, `undefined` for none.
 *
 * The client sends a build; the host decides whether to honour it. With
 * none, or an illegal or malformed one, the player gets a starter build
 * picked by `random` (#852) rather than being turned away: being dropped
 * at the door because of a stale saved character is a miserable way to
 * find out something is wrong, and the player still gets a playable match.
 *
 * Nothing about the claimed build is trusted: not the attribute ranks
 * (which scale every skill), not the skill bar (which decides what can be
 * cast at all), and not the professions that gate both.
 */
export function resolveJoinLoadout(
  claimed: unknown,
  rules: AttributeRules,
  random: () => number,
): { readonly loadout: JoinLoadout; readonly refused: JoinRefusal | undefined } {
  const starter = (): JoinLoadout => loadoutOf(pickStarterBuild(random));
  if (claimed === undefined) {
    return { loadout: starter(), refused: undefined };
  }
  const build = parsePlayerBuild(claimed);
  if (build === undefined) {
    return { loadout: starter(), refused: { kind: "malformed" } };
  }
  const problems = validatePlayerBuild(build, rules);
  if (problems.length > 0) {
    return { loadout: starter(), refused: { kind: "illegal", build, problems } };
  }
  return { loadout: loadoutOf(build), refused: undefined };
}
