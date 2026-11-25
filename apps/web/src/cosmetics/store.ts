/**
 * This browser's cosmetics (ADR-0056), kept beside its player key and so
 * shared by all its characters: what is picked per slot, and the key's
 * last known leaderboard facts, so a failed fetch still draws your own.
 * A stored record of any other shape is deleted, not read (ADR-0016):
 * the picks start empty.
 */

import { STORAGE_NAMESPACE } from "../storage/namespace.js";

import { COSMETIC_SLOTS, cosmeticById, type CosmeticSlot } from "./catalog.js";
import type { CosmeticChoice } from "./selection.js";
import type { UnlockFacts } from "./unlocks.js";

const COSMETICS_KEY = `${STORAGE_NAMESPACE}.cosmetics`;

interface Stored {
  readonly choice: CosmeticChoice;
  readonly facts: UnlockFacts | null;
}

const EMPTY: Stored = { choice: {}, facts: null };

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

function isFacts(value: unknown): value is UnlockFacts {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const { wins, streak, rank } = value as Record<string, unknown>;
  return isCount(wins) && isCount(streak) && (rank === null || (isCount(rank) && rank > 0));
}

/** `raw` as the stored record, or `undefined` for any other shape. */
export function parseStored(raw: unknown): Stored | undefined {
  if (typeof raw !== "object" || raw === null) {
    return undefined;
  }
  const { choice, facts } = raw as Record<string, unknown>;
  if (typeof choice !== "object" || choice === null || (facts !== null && !isFacts(facts))) {
    return undefined;
  }
  const picked: Partial<Record<CosmeticSlot, string>> = {};
  for (const [slot, id] of Object.entries(choice)) {
    // An id this build no longer has is a wrong record, not one to adapt.
    if (typeof id !== "string" || cosmeticById(id)?.slot !== slot) {
      return undefined;
    }
    picked[slot] = id;
  }
  return { choice: picked, facts };
}

export interface CosmeticsStore {
  /** What is picked, per slot. */
  readonly choice: () => CosmeticChoice;
  /** Pick `id` for `slot`, or nothing for `undefined`. Applies at once. */
  readonly pick: (slot: CosmeticSlot, id: string | undefined) => void;
  /** The key's leaderboard facts as last seen; `undefined` before any. */
  readonly lastFacts: () => UnlockFacts | undefined;
  /** Remember `facts` from a fetched leaderboard. */
  readonly rememberFacts: (facts: UnlockFacts | undefined) => void;
  /** Called on every change; returns its unsubscribe. */
  readonly onChange: (handler: () => void) => () => void;
}

/** The cosmetics kept in `storage`; storage that throws keeps them for this page alone. */
export function createCosmeticsStore(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
): CosmeticsStore {
  const handlers = new Set<() => void>();
  const read = (key: string): string | null => {
    try {
      return storage.getItem(key);
    } catch {
      // Private browsing can throw on access: nothing stored.
      return null;
    }
  };
  const write = (key: string, value: string): void => {
    try {
      storage.setItem(key, value);
    } catch {
      // Still applies for this page; it just is not remembered.
    }
  };
  const load = (): Stored => {
    const raw = read(COSMETICS_KEY);
    if (raw === null) {
      return EMPTY;
    }
    let parsed: Stored | undefined;
    try {
      parsed = parseStored(JSON.parse(raw));
    } catch {
      parsed = undefined;
    }
    if (parsed === undefined) {
      try {
        storage.removeItem(COSMETICS_KEY);
      } catch {
        // Gone for this page anyway.
      }
      return EMPTY;
    }
    return parsed;
  };
  let stored = load();
  const save = (next: Stored): void => {
    stored = next;
    write(COSMETICS_KEY, JSON.stringify(next));
    for (const handler of handlers) {
      handler();
    }
  };
  return {
    choice: () => stored.choice,
    pick: (slot, id) => {
      const choice: Partial<Record<CosmeticSlot, string>> = {};
      for (const each of COSMETIC_SLOTS) {
        const kept = each === slot ? id : stored.choice[each];
        if (kept !== undefined) {
          choice[each] = kept;
        }
      }
      save({ ...stored, choice });
    },
    lastFacts: () => stored.facts ?? undefined,
    rememberFacts: (facts) => {
      const next =
        facts === undefined ? null : { wins: facts.wins, streak: facts.streak, rank: facts.rank };
      if (JSON.stringify(next) !== JSON.stringify(stored.facts)) {
        save({ ...stored, facts: next });
      }
    },
    onChange: (handler) => {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
  };
}

/** This page's cosmetics, in its localStorage. */
export const cosmeticsStore: CosmeticsStore = createCosmeticsStore({
  getItem: (key) => globalThis.localStorage.getItem(key),
  setItem: (key, value) => {
    globalThis.localStorage.setItem(key, value);
  },
  removeItem: (key) => {
    globalThis.localStorage.removeItem(key);
  },
});
