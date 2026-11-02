import { pickStarterTeam, STARTER_TEAMS, type StarterTeam } from "@vibewars/game-core";

import { newTeam } from "../ui/team-builder.js";
import { fromPlayerBuild } from "./build-validation.js";
import { STORAGE_NAMESPACE } from "./namespace.js";
import type { TeamRepository } from "./repository.js";
import type { StoredTeam, TeamCharacter, TeamBuildSize } from "./schema.js";

/**
 * The Team Build a browser's first start rolls (#2036), as it rolls a
 * starter character (#853): one of the curated `STARTER_TEAMS` (#2035) at
 * random for each team size that has one (#2147), saved as a Team Build
 * like any other, once per browser, under the team's archetype name and
 * its members' job names. Which one it is, is remembered by id for its
 * size, so its card alone has Clone and Reroll.
 */

/** Where the rolled team's id is kept: set means "rolled already". */
export interface StarterTeamKey {
  readonly load: () => string | undefined;
  readonly save: (id: string) => void;
}

function starterTeamStorageKey(size: TeamBuildSize): string {
  return `${STORAGE_NAMESPACE}.starterTeamId.${String(size)}`;
}

/** The id of the starter team rolled at `size` (#2147), if any. */
export function loadStarterTeamId(size: TeamBuildSize): string | undefined {
  try {
    return localStorage.getItem(starterTeamStorageKey(size)) ?? undefined;
  } catch {
    return undefined;
  }
}

export function saveStarterTeamId(size: TeamBuildSize, id: string): void {
  try {
    localStorage.setItem(starterTeamStorageKey(size), id);
  } catch {
    // Unset, the next start rolls again: a second team, not a failure.
  }
}

export interface RollStarterTeamOptions {
  readonly teams: Pick<TeamRepository, "save">;
  readonly key: StarterTeamKey;
  /** [0, 1), `Math.random` in the browser. */
  readonly random: () => number;
  /** The team size picked (#2109): the starter rolled is one of it. */
  readonly size: TeamBuildSize;
  readonly id: string;
  /** A fresh id for each member. */
  readonly newId: () => string;
  /** ms since the epoch. */
  readonly now: number;
}

/** `starter` as a Team Build under `id`, its members under their job names. */
function storedStarterTeam(
  starter: StarterTeam,
  size: TeamBuildSize,
  id: string,
  newId: () => string,
  now: number,
): StoredTeam {
  const members = starter.members.map(({ name, build }) => {
    const {
      schemaVersion: _version,
      updatedAt: _updated,
      ...character
    } = fromPlayerBuild(build, newId(), now);
    const member: TeamCharacter = { ...character, name };
    return { character: member };
  });
  return { ...newTeam(id, size), name: starter.name, members, updatedAt: now };
}

/** The curated team `team` is, by its name; `undefined` once renamed. */
function shownStarterTeam(team: StoredTeam): StarterTeam | undefined {
  return STARTER_TEAMS.find((starter) => starter.name === team.name);
}

/**
 * Roll and save a starter team, unless this browser rolled one already:
 * the Team Builds are never read, so a deleted one does not come back. A
 * save that fails leaves the key unset, to be tried again next start. The
 * new team, or `undefined` when there is none.
 */
export async function rollStarterTeam(
  options: RollStarterTeamOptions,
): Promise<StoredTeam | undefined> {
  const { teams, key, random, size, id, newId, now } = options;
  const starter = pickStarterTeam(random, size);
  if (key.load() !== undefined || starter === undefined) {
    return undefined;
  }
  const team = storedStarterTeam(starter, size, id, newId, now);
  try {
    await teams.save(team);
  } catch (error) {
    console.warn("[web] could not save the starter team", error);
    return undefined;
  }
  key.save(id);
  return team;
}

/**
 * `current` as another curated team, never the one shown: the same id,
 * under that team's names, at its size; `current` itself when there is
 * no other of its size.
 */
export async function rerollStarterTeam(
  teams: Pick<TeamRepository, "save">,
  current: StoredTeam,
  random: () => number,
  newId: () => string,
  now: number,
): Promise<StoredTeam> {
  const starter = pickStarterTeam(random, current.size, shownStarterTeam(current));
  if (starter === undefined) {
    return current;
  }
  const team = storedStarterTeam(starter, current.size, current.id, newId, now);
  await teams.save(team);
  return team;
}
