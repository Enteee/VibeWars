/**
 * The splash screen's clock (#2884), pure: what shows at `nowMs`, given
 * `armedAtMs`, the moment of the first input.
 */
export type SplashPhase = "waiting" | "armed" | "flying" | "flash" | "prompt";

/** After the first input, before the words fly. */
export const SPLASH_ARM_MS = 1000;
/** The first input to the words meeting. */
export const SPLASH_MEET_MS = 3000;
/** How long the white flash lasts. */
export const SPLASH_FLASH_MS = 250;

export function splashPhase(
  armedAtMs: number | undefined,
  nowMs: number,
  reducedMotion: boolean,
): SplashPhase {
  if (armedAtMs === undefined) {
    return "waiting";
  }
  const since = nowMs - armedAtMs;
  if (since < SPLASH_ARM_MS) {
    return "armed";
  }
  if (reducedMotion) {
    return "prompt";
  }
  if (since < SPLASH_MEET_MS) {
    return "flying";
  }
  return since < SPLASH_MEET_MS + SPLASH_FLASH_MS ? "flash" : "prompt";
}
