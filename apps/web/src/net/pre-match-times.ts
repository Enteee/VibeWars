import { PRE_MATCH, PRE_MATCH_E2E, type PreMatchTimes } from "@vibewars/game-session";

/**
 * The wait a hosted match runs before its start (#3855): `PRE_MATCH_E2E`
 * in a build with `VITE_VIBEWARS_PRE_MATCH=short`, so e2e specs do not
 * spend their budget in a 10 s countdown, unless the host's URL has
 * `?pre-match=real`; else the real `PRE_MATCH`.
 */
export function preMatchTimes(env: string | undefined, search: string): PreMatchTimes {
  return env === "short" && new URLSearchParams(search).get("pre-match") !== "real"
    ? PRE_MATCH_E2E
    : PRE_MATCH;
}
