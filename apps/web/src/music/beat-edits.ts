import { STORAGE_NAMESPACE } from "../storage/namespace.js";

/**
 * The player's edits of the shipped tracks (#373, #366 §3.7), across
 * reloads: per track, the edited source and a hash of the shipped source
 * it was based on. An edit plays wherever its track would.
 *
 * A new build that ships a different source for a track makes its edit
 * stale. A stale edit is deleted, never merged or adapted (CLAUDE.md), and
 * the player is told once. Until `loadBeatEdits` has checked the hashes,
 * the store holds nothing, so a stale edit never plays.
 */

export interface BeatEdit {
  /** SHA-256 of the shipped source the edit was based on, hex. */
  readonly shippedHash: string;
  readonly source: string;
}

/** Longer sources are refused, which keeps `localStorage` sane. */
export const MAX_EDIT_BYTES = 64 * 1024;

const EDITS_KEY = `${STORAGE_NAMESPACE}.music.edits`;

/** Whether `source` is over the size an edit may have. */
export function tooLarge(source: string): boolean {
  return new TextEncoder().encode(source).length > MAX_EDIT_BYTES;
}

export function editRemovedNotice(title: string): string {
  return `Your edit of ${title} was based on an older version and was removed.`;
}

export function editStoppedNotice(title: string): string {
  return `Your edit of ${title} stopped the music and was removed.`;
}

/** SHA-256 of `source`, hex. */
export async function shippedHash(source: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isEdit(value: unknown): value is BeatEdit {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const { shippedHash: hash, source } = value as Record<string, unknown>;
  return typeof hash === "string" && /^[0-9a-f]{64}$/.test(hash) && typeof source === "string";
}

/** A stored map of edits, or none for anything that is not exactly one. */
export function parseBeatEdits(text: string | null): Map<string, BeatEdit> {
  if (text === null) {
    return new Map();
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return new Map();
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return new Map();
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.every(([, edit]) => isEdit(edit))) {
    return new Map();
  }
  return new Map(entries as [string, BeatEdit][]);
}

export interface BeatEditStore {
  get(trackId: string): BeatEdit | undefined;
  /** Keep `edit` of `trackId`, replacing any before it. */
  save(trackId: string, edit: BeatEdit): void;
  remove(trackId: string): void;
  /**
   * Read the saved edits, deleting every one that is stale or of a track
   * no longer shipped, and return a notice for each stale one.
   */
  load(
    tracks: readonly { readonly id: string; readonly title: string; readonly source: string }[],
  ): Promise<string[]>;
  /** Called after every change; returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
}

export function createBeatEditStore(
  storage: () => Pick<Storage, "getItem" | "setItem">,
  hash: (source: string) => Promise<string> = shippedHash,
): BeatEditStore {
  let edits = new Map<string, BeatEdit>();
  const listeners = new Set<() => void>();
  const changed = (): void => {
    for (const listener of listeners) {
      listener();
    }
  };
  const persist = (): void => {
    try {
      storage().setItem(EDITS_KEY, JSON.stringify(Object.fromEntries(edits)));
    } catch {
      // The edit still plays for this session; it just is not remembered.
    }
  };
  return {
    get: (trackId) => edits.get(trackId),
    save(trackId, edit) {
      edits.set(trackId, edit);
      persist();
      changed();
    },
    remove(trackId) {
      if (edits.delete(trackId)) {
        persist();
        changed();
      }
    },
    async load(tracks) {
      let saved: Map<string, BeatEdit>;
      try {
        saved = parseBeatEdits(storage().getItem(EDITS_KEY));
      } catch {
        // Private browsing can throw on localStorage access; nothing is edited.
        return [];
      }
      const kept = new Map<string, BeatEdit>();
      const notices: string[] = [];
      for (const [trackId, edit] of saved) {
        const track = tracks.find((candidate) => candidate.id === trackId);
        if (track === undefined) {
          continue;
        }
        if ((await hash(track.source)) === edit.shippedHash) {
          kept.set(trackId, edit);
        } else {
          notices.push(editRemovedNotice(track.title));
        }
      }
      // Edits made while the hashes were checked win over the saved ones.
      edits = new Map([...kept, ...edits]);
      persist();
      changed();
      return notices;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** The page's edits. */
export const beatEdits: BeatEditStore = createBeatEditStore(() => localStorage);
