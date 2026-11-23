import type { MatchSnapshot } from "@vibewars/game-session";

import { t } from "../i18n/index.js";

/**
 * The centre line before a match starts (#3818): who is in while it
 * waits, that it starts anyway once a late player has had long enough,
 * then the countdown. `undefined` once it has started.
 */
export function preMatchLine(match: Pick<MatchSnapshot, "phase" | "preMatch">): string | undefined {
  const pre = match.preMatch;
  if (pre === null || (match.phase !== "waiting" && match.phase !== "countdown")) {
    return undefined;
  }
  if (match.phase === "countdown") {
    return t("hud.preMatchStartsIn", { seconds: pre.secondsLeft ?? 0 });
  }
  const { joined, expected, secondsLeft } = pre;
  return secondsLeft === null
    ? t("hud.preMatchWaiting", { joined, expected })
    : t("hud.preMatchStartingAnyway", { joined, expected, seconds: secondsLeft });
}
