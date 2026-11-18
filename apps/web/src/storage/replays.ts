import { parseReplay, type RecordedReplay } from "@vibewars/game-session";

import { REPLAY_STORE, type KeyValueStore } from "./repository.js";

/** How many replays a player keeps (#3572): the newest, by when they came. */
export const KEPT_REPLAYS = 50;

/** A replay as stored, under its hash: when it came, in ms, orders the pruning. */
interface StoredReplay {
  readonly keptAt: number;
  readonly replay: unknown;
}

/**
 * The replays of the matches this player played (#3572, ADR-0054), kept
 * for a dispute later. Nothing shows them yet. A record of the wrong
 * shape is deleted, as `repository.ts` does with characters (ADR-0016).
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
    const stored: StoredReplay = { keptAt: this.#now(), replay: recorded.replay };
    await this.#store.put(REPLAY_STORE, recorded.hash, stored);
    // By the envelope alone: parsing every replay on each keep would cost a
    // second of main thread after a match.
    const kept: { readonly key: string; readonly keptAt: number }[] = [];
    for (const { key, value } of await this.#store.list(REPLAY_STORE)) {
      const row = storedReplay(value);
      if (row === undefined) {
        await this.#store.delete(REPLAY_STORE, key);
      } else {
        kept.push({ key, keptAt: row.keptAt });
      }
    }
    kept.sort((a, b) => b.keptAt - a.keptAt || (a.key < b.key ? -1 : 1));
    for (const old of kept.slice(KEPT_REPLAYS)) {
      await this.#store.delete(REPLAY_STORE, old.key);
    }
  }

  /** Every kept replay, newest first; any that is not one is deleted. */
  async list(): Promise<RecordedReplay[]> {
    const rows: { readonly keptAt: number; readonly recorded: RecordedReplay }[] = [];
    for (const { key, value } of await this.#store.list(REPLAY_STORE)) {
      const stored = storedReplay(value);
      const replay = stored === undefined ? undefined : parseReplay(stored.replay);
      if (stored === undefined || replay === undefined) {
        await this.#store.delete(REPLAY_STORE, key);
        continue;
      }
      rows.push({ keptAt: stored.keptAt, recorded: { hash: key, replay } });
    }
    return rows
      .sort((a, b) => b.keptAt - a.keptAt || (a.recorded.hash < b.recorded.hash ? -1 : 1))
      .map(({ recorded }) => recorded);
  }
}

function storedReplay(value: unknown): StoredReplay | undefined {
  if (typeof value !== "object" || value === null || !("keptAt" in value) || !("replay" in value)) {
    return undefined;
  }
  return typeof value.keptAt === "number" && Number.isFinite(value.keptAt)
    ? { keptAt: value.keptAt, replay: value.replay }
    : undefined;
}
