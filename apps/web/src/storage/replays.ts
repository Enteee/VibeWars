import { parseReplay, type RecordedReplay } from "@vibewars/game-session";

import { REPLAY_DATE_STORE, REPLAY_STORE, type KeyValueStore } from "./repository.js";

/** How many replays a player keeps (#3572): the newest, by when they came. */
export const KEPT_REPLAYS = 50;

/**
 * The replays of the matches this player played (#3572, ADR-0054), kept
 * for a dispute later. Nothing shows them yet. Each is stored under its
 * hash, and when it came, in ms, under the same hash in a store of its
 * own: pruning reads those dates and never a replay, which can be
 * megabytes. A record of the wrong shape is deleted, as `repository.ts`
 * does with characters (ADR-0016).
 */
export class ReplayStore {
  readonly #store: KeyValueStore;
  readonly #now: () => number;

  constructor(store: KeyValueStore, now: () => number = Date.now) {
    this.#store = store;
    this.#now = now;
  }

  /** Keeps `recorded`, then drops the oldest past `KEPT_REPLAYS`. */
  async keep(recorded: RecordedReplay): Promise<void> {
    await this.#store.put(REPLAY_STORE, recorded.hash, recorded.replay);
    await this.#store.put(REPLAY_DATE_STORE, recorded.hash, this.#now());
    const kept: { readonly key: string; readonly keptAt: number }[] = [];
    for (const { key, value } of await this.#store.list(REPLAY_DATE_STORE)) {
      const at = keptAt(value);
      if (at === undefined) {
        await this.#drop(key);
      } else {
        kept.push({ key, keptAt: at });
      }
    }
    for (const old of newestFirst(kept).slice(KEPT_REPLAYS)) {
      await this.#drop(old.key);
    }
  }

  /** Every kept replay, newest first; any that is not one, or has no date, is deleted. */
  async list(): Promise<RecordedReplay[]> {
    const dates = new Map<string, number>();
    for (const { key, value } of await this.#store.list(REPLAY_DATE_STORE)) {
      const at = keptAt(value);
      if (at !== undefined) {
        dates.set(key, at);
      }
    }
    const rows: {
      readonly key: string;
      readonly keptAt: number;
      readonly recorded: RecordedReplay;
    }[] = [];
    for (const { key, value } of await this.#store.list(REPLAY_STORE)) {
      const at = dates.get(key);
      const replay = parseReplay(value);
      if (at === undefined || replay === undefined) {
        await this.#drop(key);
        continue;
      }
      rows.push({ key, keptAt: at, recorded: { hash: key, replay } });
    }
    return newestFirst(rows).map(({ recorded }) => recorded);
  }

  async #drop(key: string): Promise<void> {
    await this.#store.delete(REPLAY_STORE, key);
    await this.#store.delete(REPLAY_DATE_STORE, key);
  }
}

function keptAt(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function newestFirst<Row extends { readonly key: string; readonly keptAt: number }>(
  rows: Row[],
): Row[] {
  return rows.sort((a, b) => b.keptAt - a.keptAt || (a.key < b.key ? -1 : 1));
}
