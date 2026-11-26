import { getProfession, type ProfessionId } from "./professions.js";
import { STARTER_BUILDS, pickBuildFrom } from "./starter-builds.js";
import type { PlayerBuild } from "./build.js";

/** The map every Heroes' Ascent run starts on (#2692). */
export const ELITE_ZAISHEN_MAP = "elite-zaishen-battle";

const FIXED: readonly ProfessionId[] = ["monk", "monk", "elementalist"];
const DRAWN: readonly ProfessionId[] = ["warrior", "ranger", "mesmer", "necromancer"];
/** How many of `DRAWN` a battle has. */
const DRAWN_COUNT = 3;

/** Under `seconds`, the party's morale boost in percent, best first. */
const BOOSTS: readonly { readonly seconds: number; readonly morale: number }[] = [
  { seconds: 30, morale: 10 },
  { seconds: 60, morale: 8 },
  { seconds: 80, morale: 6 },
  { seconds: 100, morale: 4 },
  { seconds: 120, morale: 2 },
];

/** The morale the party starts its run with (#2692) for killing all six in `seconds`. */
export function zaishenMoraleBoost(seconds: number): number {
  return BOOSTS.find((boost) => seconds < boost.seconds)?.morale ?? 0;
}

export interface Zaishen {
  readonly name: string;
  readonly build: PlayerBuild;
}

/**
 * The six Zaishen (#2692), by `random` ([0, 1), the host's own): 2 Monks,
 * an Elementalist and 3 of Warrior, Ranger, Mesmer and Necromancer, each
 * on a house build of its profession. A second of a profession is numbered.
 */
export function drawZaishen(random: () => number): readonly Zaishen[] {
  const pool = [...DRAWN];
  const drawn = Array.from({ length: DRAWN_COUNT }, () => {
    const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
    const [picked = "warrior"] = pool.splice(index, 1);
    return picked;
  });
  const seen = new Map<ProfessionId, number>();
  return [...FIXED, ...drawn].map((profession) => {
    const count = (seen.get(profession) ?? 0) + 1;
    seen.set(profession, count);
    const base = `Zaishen ${getProfession(profession).name}`;
    return {
      name: count === 1 ? base : `${base} ${String(count)}`,
      build: pickBuildFrom(
        STARTER_BUILDS.filter((build) => build.primaryProfession === profession),
        random,
      ),
    };
  });
}
