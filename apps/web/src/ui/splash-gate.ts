/** What decides whether a tab opens on the splash screen (#2884). */
export interface SplashGate {
  /** `?splash` in the URL: shown regardless, the one rule e2e needs. */
  readonly forced: boolean;
  /** Already shown in this tab session. */
  readonly seen: boolean;
  /** An invite or relay link: they came to join something. */
  readonly joining: boolean;
  readonly framed: boolean;
  /** `VITE_VIBEWARS_SPLASH=off`. */
  readonly disabled: boolean;
}

export function shouldShowSplash(gate: SplashGate): boolean {
  return gate.forced || !(gate.seen || gate.joining || gate.framed || gate.disabled);
}
