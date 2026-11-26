/**
 * The splash screen's clock (#2884), pure: what shows at `nowMs`, given
 * `armedAtMs`, the moment of the first input, and `meetAtMs`, the moment
 * the words meet, unknown until the music has said when it starts (#2936).
 */
export type SplashPhase = "waiting" | "armed" | "flying" | "flash" | "prompt";

/** After the first input, before the words fly. */
export const SPLASH_ARM_MS = 1000;
/** The first input to the words meeting. */
export const SPLASH_MEET_MS = 3000;
/** How long the white flash lasts. */
export const SPLASH_FLASH_MS = 250;
/** The words' flight, which ends as they meet. */
export const SPLASH_FLY_MS = 2000;
/** After the first input, how long the words wait for the music before flying without it. */
export const SPLASH_MUSIC_WAIT_MS = 4000;
/**
 * The start of `crash/0.mp3` to its attack (#2936). Measured from the file
 * decoded by `decodeAudioData`: the first sample over 10% of the peak.
 */
export const SPLASH_CRASH_OFFSET_MS = 3;

export function splashPhase(
  armedAtMs: number | undefined,
  meetAtMs: number | undefined,
  nowMs: number,
  reducedMotion: boolean,
): SplashPhase {
  if (armedAtMs === undefined) {
    return "waiting";
  }
  if (reducedMotion) {
    return nowMs - armedAtMs < SPLASH_ARM_MS ? "armed" : "prompt";
  }
  if (meetAtMs === undefined || nowMs < meetAtMs - SPLASH_FLY_MS) {
    return "armed";
  }
  if (nowMs < meetAtMs) {
    return "flying";
  }
  return nowMs < meetAtMs + SPLASH_FLASH_MS ? "flash" : "prompt";
}

/** The page's `performance` time of the flash, given when the host says the track is heard. */
export function meetFromHeard(heardAtEpochMs: number, nowEpochMs: number, nowMs: number): number {
  return nowMs + heardAtEpochMs - nowEpochMs + SPLASH_CRASH_OFFSET_MS;
}
