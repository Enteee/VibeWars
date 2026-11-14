import type { Vec2 } from "@vibewars/game-core";

import type { MessageKey } from "../i18n/index.js";
import { codeLabel, type KeyAction, type Keymap } from "../input/keymap.js";

import type { Station, StationHighlight, TutorialView, TutorialWorldName } from "./stations.js";

/** After this long with the station not done, its hint is said again (playbook §0). */
export const HINT_REPEAT_MS = 10_000;
/** The tutor's reaction to a hit is said no more often than this (#3247). */
export const HIT_REPEAT_MS = 10_000;
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
  /** A ground mark beside a HUD highlight (#3302), or none. */
  readonly mark: Vec2 | undefined;
  /** The station running, or the next from its predecessor's praise on; none once finished. */
  readonly station: string | undefined;
  /** The last station is done: its praise is said and nothing comes after. */
  readonly finished: boolean;
  /**
   * The world the station now running, or praised and about to give way
   * to the next, plays in: the next's from its praise on, so the world
   * changes under that praise (#3247).
   */
  readonly world: TutorialWorldName;
}

/** Every key bound to `actions`, each action's first ones, then their second: W A S D ↑ ← ↓ →. */
function keysOf(actions: readonly KeyAction[], map: Keymap): string[] {
  const deepest = Math.max(0, ...actions.map((action) => map[action].length));
  return Array.from({ length: deepest }, (_, at) =>
    actions.flatMap((action) => map[action][at] ?? []),
  ).flat();
}

export interface TutorialRunner {
  tick(view: TutorialView, nowMs: number): TutorialBeat;
}

/**
 * The tutorial as a state machine over `stations` (#3218), with no screen
 * of its own: each station's intro, its hint again every `HINT_REPEAT_MS`
 * until it is done, a station's hit line when the player is hit, no more
 * than every `HIT_REPEAT_MS` (#3247), its reaction once, after which its
 * hint is not said again (#3302), each of its asides once (#3303), then
 * its praise and, after `PRAISE_MS`, the next.
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
  /** When the tutor last reacted to a hit. */
  let reactedAt: number | undefined;
  /** The station running has said its reaction. */
  let reacted = false;
  /** The station running's asides it has said, by index. */
  let asided = new Set<number>();
  const last = stations[stations.length - 1];
  if (last === undefined) {
    throw new Error("a tutorial of no stations");
  }
  const worldOf = (): TutorialWorldName => (stations[index] ?? last).world;

  const line = (station: Station, key: MessageKey): TutorLine => {
    const map = keymap();
    return {
      key,
      how: key === station.lines.praise ? undefined : station.lines.how,
      keys: keysOf(station.keys ?? [], map).map(label),
    };
  };
  const beat = (
    say: TutorLine | undefined,
    highlight: StationHighlight | undefined,
    mark?: Vec2,
  ): TutorialBeat => ({
    say,
    highlight,
    mark,
    finished,
    world: worldOf(),
    station: stations[index]?.id,
  });
  const quiet = (highlight: StationHighlight | undefined, mark?: Vec2): TutorialBeat =>
    beat(undefined, highlight, mark);

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
      const mark = station.mark?.(view);
      const highlight =
        typeof station.highlight === "function" ? station.highlight(view) : station.highlight;
      if (saidAt === undefined) {
        saidAt = nowMs;
        return beat(line(station, station.lines.intro), highlight, mark);
      }
      if (station.done(view)) {
        index += 1;
        saidAt = undefined;
        reacted = false;
        asided = new Set<number>();
        praisedAt = nowMs;
        finished = index >= stations.length;
        return beat(line(station, station.lines.praise), undefined);
      }
      const { reaction } = station;
      if (reaction !== undefined && !reacted && reaction.when(view)) {
        reacted = true;
        saidAt = nowMs;
        return beat(line(station, reaction.line), highlight, mark);
      }
      const aside = (station.asides ?? []).findIndex(
        (entry, at) => !asided.has(at) && entry.when(view),
      );
      const said = station.asides?.[aside];
      if (said !== undefined) {
        asided.add(aside);
        saidAt = nowMs;
        return beat(line(station, said.line), highlight, mark);
      }
      const { hit } = station.lines;
      if (
        hit !== undefined &&
        view.hitBy !== undefined &&
        (reactedAt === undefined || nowMs - reactedAt >= HIT_REPEAT_MS)
      ) {
        reactedAt = nowMs;
        saidAt = nowMs;
        return beat(line(station, hit), highlight, mark);
      }
      // Once it has reacted, the player is on it: no more nudging.
      if (!reacted && nowMs - saidAt >= HINT_REPEAT_MS) {
        saidAt = nowMs;
        return beat(line(station, station.lines.hint), highlight, mark);
      }
      return quiet(highlight, mark);
    },
  };
}
