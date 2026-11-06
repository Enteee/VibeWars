import type { PlayerBuild } from "./build.js";
import { PVX_SOLO, decodePvxBuilds } from "./pvx-builds.js";

/**
 * The starter builds (#852): what the host hands a player who brings no
 * legal build of their own, one picked at random. They are the PvX
 * wiki's well-rated PvP builds (#2554), decoded from their template
 * codes once, at load; a code that is not a legal build here is left
 * out (`PVX_SKIPPED`), never patched.
 */
export const STARTER_BUILDS: readonly PlayerBuild[] = decodePvxBuilds(PVX_SOLO).builds;

/**
 * A starter build by `random` ([0, 1), the host's own), never one with
 * `not`'s professions, so a reroll always changes it. By professions,
 * not name: a rolled character carries a name of its own (#1149).
 */
export function pickStarterBuild(random: () => number, not?: PlayerBuild): PlayerBuild {
  return pickBuildFrom(STARTER_BUILDS, random, not);
}

function sameProfessions(a: PlayerBuild, b: PlayerBuild): boolean {
  return (
    a.primaryProfession === b.primaryProfession && a.secondaryProfession === b.secondaryProfession
  );
}

/** `pickStarterBuild` over `builds`. With only `not` to pick, that is what it picks. */
export function pickBuildFrom(
  builds: readonly PlayerBuild[],
  random: () => number,
  not?: PlayerBuild,
): PlayerBuild {
  const others = builds.filter((build) => not === undefined || !sameProfessions(build, not));
  const pool = others.length > 0 ? others : builds;
  // Clamped: a `random` just under 1 must not index past the end.
  const picked = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
  if (picked === undefined) {
    throw new Error("no builds to pick from");
  }
  return picked;
}
