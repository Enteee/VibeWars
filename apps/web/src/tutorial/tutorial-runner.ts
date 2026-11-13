import type { MessageKey } from "../i18n/index.js";
import { codeLabel, type Keymap } from "../input/keymap.js";

import type { Station, StationHighlight, TutorialView } from "./stations.js";

/** After this long with the station not done, its hint is said again (playbook §0). */
export const HINT_REPEAT_MS = 10_000;
/** How long the praise stands before the next station's intro. */
export const PRAISE_MS = 2_500;

/**
 * A line the tutor says: its i18n key, the station's `how` under it
 * (none under a praise), and the keys that shows, as bound now.
 */
export interface TutorLine {
  readonly key: MessageKey;
  readonly how: MessageKey | undefined;
  readonly keys: readonly string[];
}

/** What one tick asks of the screen. */
export interface TutorialBeat {
  /** A line to say now, or none: the last one stands. */
  readonly say: TutorLine | undefined;
  /** What to point at, or nothing between stations. */
  readonly highlight: StationHighlight | undefined;
  /** The last station is done: its praise is said and nothing comes after. */
  readonly finished: boolean;
}

export interface TutorialRunner {
  tick(view: TutorialView, nowMs: number): TutorialBeat;
}

/**
 * The tutorial as a state machine over `stations` (#3218), with no screen
 * of its own: each station's intro, its hint again every `HINT_REPEAT_MS`
 * until it is done, then its praise and, after `PRAISE_MS`, the next.
 * The keys a line shows are read from `keymap()` as it is said, so a
 * rebind shows on the next line.
 */
export function createTutorialRunner(
  stations: readonly Station[],
  keymap: () => Keymap,
  label: (code: string) => string = codeLabel,
): TutorialRunner {
  let index = 0;
  /** When the last line was said, or `undefined` before the station's intro. */
  let saidAt: number | undefined;
  /** When the station before was praised, while that praise stands. */
  let praisedAt: number | undefined;
  let finished = false;

  const line = (station: Station, key: MessageKey): TutorLine => {
    const map = keymap();
    return {
      key,
      how: key === station.lines.praise ? undefined : station.lines.how,
      keys: (station.keys ?? []).flatMap((action) => map[action].map(label)),
    };
  };
  const quiet = (highlight: StationHighlight | undefined): TutorialBeat => ({
    say: undefined,
    highlight,
    finished,
  });

  return {
    tick(view, nowMs) {
      const station = stations[index];
      if (finished || station === undefined) {
        finished = true;
        return quiet(undefined);
      }
      if (praisedAt !== undefined) {
        if (nowMs - praisedAt < PRAISE_MS) {
          return quiet(undefined);
        }
        praisedAt = undefined;
      }
      if (saidAt === undefined) {
        saidAt = nowMs;
        return { say: line(station, station.lines.intro), highlight: station.highlight, finished };
      }
      if (station.done(view)) {
        index += 1;
        saidAt = undefined;
        praisedAt = nowMs;
        finished = index >= stations.length;
        return { say: line(station, station.lines.praise), highlight: undefined, finished };
      }
      if (nowMs - saidAt >= HINT_REPEAT_MS) {
        saidAt = nowMs;
        return { say: line(station, station.lines.hint), highlight: station.highlight, finished };
      }
      return quiet(station.highlight);
    },
  };
}
