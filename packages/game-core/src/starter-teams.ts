import type { PlayerBuild } from "./build.js";
import { PVX_TEAMS, type PvxTeam } from "./pvx-builds.js";
import { STARTER_BUILDS, decodePvxCode } from "./starter-builds.js";

/**
 * The starter teams (#2555): what Team Builder's random card rerolls
 * through, one picked at random. Each is a PvX wiki PvP team build whose
 * every member decodes to a legal build here, serving the team size equal
 * to its member count. A size no such team serves gets PvX solo builds
 * put together instead (`pickStarterTeam`).
 *
 * A team's name is PvX's and a member's its slot and professions, never
 * random: a player reads them on the card.
 */

export interface StarterTeamMember {
  /** Shown as its character's name: "HA Balanced 3 (Mo/Me)". */
  readonly name: string;
  readonly build: PlayerBuild;
}

export interface StarterTeam {
  /** PvX's name for it: "HA Balanced". */
  readonly name: string;
  /** In slot order; how many is the team's size (#2109), 1, 2, 4 or 8. */
  readonly members: readonly StarterTeamMember[];
}

/** The team sizes there are (#2109); a PvX team of any other serves none. */
const TEAM_SIZES: readonly number[] = [1, 2, 4, 8];

/** How a PvX team is named in `PVX_SKIPPED`: the PvX file's name, its rating left out. */
export function pvxTeamKey(team: PvxTeam): string {
  return `Team ${team.name}`;
}

/**
 * `list`'s teams whose every member decodes to a legal build, at a team
 * size there is, and every other one by `pvxTeamKey` with why it is not:
 * its size, or its first member that does not decode. Never a part team.
 */
export function decodePvxTeams(list: readonly PvxTeam[]): {
  readonly teams: readonly StarterTeam[];
  readonly skipped: Readonly<Record<string, string>>;
} {
  const teams: StarterTeam[] = [];
  const skipped: Record<string, string> = {};
  for (const pvx of list) {
    if (!TEAM_SIZES.includes(pvx.members.length)) {
      skipped[pvxTeamKey(pvx)] =
        `${String(pvx.members.length)} members: no team size has that many.`;
      continue;
    }
    const members: StarterTeamMember[] = [];
    for (const [index, code] of pvx.members.entries()) {
      const decoded = decodePvxCode(`${pvx.name} ${String(index + 1)}`, code);
      if (!decoded.ok) {
        skipped[pvxTeamKey(pvx)] = `Member ${String(index + 1)}: ${decoded.reason}`;
        break;
      }
      members.push({ name: decoded.build.name, build: decoded.build });
    }
    if (members.length === pvx.members.length) {
      teams.push({ name: pvx.name, members });
    }
  }
  return { teams, skipped };
}

export const STARTER_TEAMS: readonly StarterTeam[] = decodePvxTeams(PVX_TEAMS).teams;

function sameProfessions(a: PlayerBuild, b: PlayerBuild): boolean {
  return (
    a.primaryProfession === b.primaryProfession && a.secondaryProfession === b.secondaryProfession
  );
}

/** `[0, n)` by `random`, clamped: a `random` just under 1 must not index past the end. */
function indexBy(random: () => number, n: number): number {
  return Math.min(n - 1, Math.floor(random() * n));
}

/**
 * `size` PvX solo builds as a team, no two of one profession pair, its
 * first member `STARTER_BUILDS[first]` and the rest by `random`; named
 * `"<A> + <B>"`, a lone build by its own name.
 */
function soloTeam(random: () => number, size: number, first: number): StarterTeam | undefined {
  const builds: PlayerBuild[] = [];
  let pool = STARTER_BUILDS;
  let next: number = first;
  while (builds.length < size) {
    const build = pool[next];
    if (build === undefined) {
      return undefined;
    }
    builds.push(build);
    pool = pool.filter((other) => !sameProfessions(other, build));
    next = indexBy(random, pool.length);
  }
  return {
    name: builds.map((build) => build.name).join(" + "),
    members: builds.map((build) => ({ name: build.name, build })),
  };
}

/**
 * A starter team of `size` members by `random` ([0, 1)), never the one
 * named like `not`, so a reroll always changes it; `undefined` when there
 * is none of that size (#2109). A size no PvX team serves gets
 * `pickSoloTeam`.
 */
export function pickStarterTeam(
  random: () => number,
  size: number,
  not?: Pick<StarterTeam, "name">,
): StarterTeam | undefined {
  const ofSize = STARTER_TEAMS.filter((team) => team.members.length === size);
  if (ofSize.length > 0) {
    const pool = ofSize.filter((team) => team.name !== not?.name);
    return pool[indexBy(random, pool.length)];
  }
  return TEAM_SIZES.includes(size) ? pickSoloTeam(random, size, not) : undefined;
}

/**
 * `size` PvX solo builds put together (#2555), for a size no PvX team
 * serves: never named like `not`, its first member walked on past one
 * that would make it again.
 */
export function pickSoloTeam(
  random: () => number,
  size: number,
  not?: Pick<StarterTeam, "name">,
): StarterTeam | undefined {
  const first = indexBy(random, STARTER_BUILDS.length);
  for (let step = 0; step < STARTER_BUILDS.length; step++) {
    const team = soloTeam(random, size, (first + step) % STARTER_BUILDS.length);
    if (team !== undefined && team.name !== not?.name) {
      return team;
    }
  }
  return undefined;
}
