import { MINIMAL_GW_INSPIRED_PVP_V1, resolveJoinLoadout } from "@vibewars/game-core";

import { t } from "../i18n/index.js";
import { toPlayerBuild } from "../storage/build-validation.js";
import type { StoredCharacter } from "../storage/schema.js";
import { blockingProblems } from "./editor-problems.js";

/**
 * What the player is told at match start when the host will swap their
 * build for a starter one (#3822), or `undefined` when it plays as
 * written. The host's own test, run here on the same build, so no wire
 * change is needed. A planned seat plays the build its lobby assigned,
 * whatever the player's own says, and is never replaced at join; no
 * character at all plays a starter build by choice, so neither says
 * anything.
 */
export function buildReplacedNotice(
  character: StoredCharacter | undefined,
  planned: boolean,
): string | undefined {
  if (planned || character === undefined) {
    return undefined;
  }
  const { refused } = resolveJoinLoadout(
    toPlayerBuild(character),
    MINIMAL_GW_INSPIRED_PVP_V1.attributes,
    // The starter it picks is the host's to pick: only `refused` is read.
    () => 0,
  );
  const problem = blockingProblems(character)[0]?.text;
  return refused === undefined || problem === undefined
    ? undefined
    : t("match.buildReplaced", { problem });
}
