/**
 * Whether a hosted match's bots stand still (#4146): only in a build with
 * `VITE_VIBEWARS_BOTS=hold`, and there only when the host's URL has
 * `?bots=hold`, so an e2e spec's idle humans outlive its slow checks.
 */
export function holdBots(env: string | undefined, search: string): boolean {
  return env === "hold" && new URLSearchParams(search).get("bots") === "hold";
}
