import { PRE_MATCH, PRE_MATCH_E2E, type PreMatchTimes } from "@vibewars/game-session";

/**
 * The wait a hosted match runs before its start (#3855): the e2e build's
 * short one when `VITE_VIBEWARS_PRE_MATCH` is `short`, unless the URL has
 * `?pre-match=real`, the spec that checks the real wait; the real one
 * otherwise. Only the host's choice counts: guests show what it sends.
 */
export function preMatchTimes(env: string | undefined, search: string): PreMatchTimes {
  if (env !== "short") {
    return PRE_MATCH;
  }
  return new URLSearchParams(search).get("pre-match") === "real" ? PRE_MATCH : PRE_MATCH_E2E;
}
