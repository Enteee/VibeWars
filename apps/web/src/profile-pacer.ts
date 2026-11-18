import { PROFILE_INTERVAL_MS } from "@vibewars/game-session";

/**
 * Paces a lobby's set-profile to what its host takes (#3548): one per
 * PROFILE_INTERVAL_MS, the rest dropped there. A change inside the interval
 * waits for its end and is sent then, so the host never keeps an older name
 * than the one this tab believes it has.
 */
export interface ProfilePacer {
  /** Sends now if the interval allows, else once when it ends. */
  request(): void;
  /** A new lobby: its host has seen nothing yet; a waiting send is dropped. */
  reset(): void;
}

export interface ProfilePacerOptions {
  /** Reads the current name and guild and sends them if they changed: whether it sent. */
  readonly send: () => boolean;
}

/** Slack for the first send arriving late at the host and the second on time. */
export const PROFILE_SLACK_MS = 250;

export function createProfilePacer(options: ProfilePacerOptions): ProfilePacer {
  let lastSentAt: number | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const fire = (): void => {
    timer = undefined;
    if (options.send()) {
      lastSentAt = Date.now();
    }
  };
  return {
    request() {
      if (timer !== undefined) {
        // One already waits, and it reads the values when it goes.
        return;
      }
      const wait =
        lastSentAt === null ? 0 : lastSentAt + PROFILE_INTERVAL_MS + PROFILE_SLACK_MS - Date.now();
      if (wait <= 0) {
        fire();
        return;
      }
      timer = setTimeout(fire, wait);
    },
    reset() {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      lastSentAt = null;
    },
  };
}
