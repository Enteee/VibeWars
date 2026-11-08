/**
 * Tracks lobby members shared with this player (#2745): the latest from
 * each, in memory for the lobby's life and never stored. One row a
 * current member at most, so nothing here grows with the messages that
 * arrive. The source is someone else's code: it is kept to hand to the
 * music host on Play, and shown nowhere.
 */

import { MAX_SHARED_SOURCE_BYTES, sharedSourceBytes } from "@vibewars/game-protocol";

export interface SharedTrack {
  /** The sender's member id, the host's word. */
  readonly from: string;
  /** The sender's name, from the lobby state this player already has. */
  readonly name: string;
  readonly trackId: string;
  readonly source: string;
  /** Whether the ♪ popover was open since it came. */
  readonly heard: boolean;
}

export interface SharedTracks {
  /** `share` from its sender, replacing theirs: unheard again, and not the one playing. */
  add(share: Omit<SharedTrack, "heard">): void;
  /** One a sender, oldest sender first. */
  rows(): readonly SharedTrack[];
  /** How many came since the ♪ popover was last open: its badge. */
  unheard(): number;
  /** The ♪ popover opened: every share is heard. */
  hearAll(): void;
  /** The sender whose share is playing, or `null`. */
  readonly playing: string | null;
  /** `from`'s share is playing now, or none with `null`. */
  setPlaying(from: string | null): void;
  /** Only these senders are still members: the rest of the rows go. */
  keep(memberIds: ReadonlySet<string>): void;
  /** Out of the lobby: every row goes. */
  clear(): void;
  /**
   * Where this player's own shares go: a coded lobby with another human
   * in it, or `null`, nowhere (a matchmade lobby, or none).
   */
  setSender(send: ShareSender | null): void;
  /** Whether `share` sends anywhere. */
  readonly canShare: boolean;
  /** Share `source`, this player's `trackId`, with the lobby: whether it was sent. */
  share(trackId: string, source: string): boolean;
  /** Called after anything changed; returns the unsubscribe. */
  onChange(listener: () => void): () => void;
}

/** Sends this player's share to their lobby. */
export type ShareSender = (trackId: string, source: string) => void;

export function createSharedTracks(): SharedTracks {
  const shares = new Map<string, SharedTrack>();
  let playing: string | null = null;
  let sender: ShareSender | null = null;
  const listeners = new Set<() => void>();
  const changed = (): void => {
    for (const listener of [...listeners]) {
      listener();
    }
  };
  return {
    add(share) {
      // A newer share from the same sender is a new row, at the end.
      shares.delete(share.from);
      shares.set(share.from, { ...share, heard: false });
      if (playing === share.from) {
        playing = null;
      }
      changed();
    },
    rows() {
      return [...shares.values()];
    },
    unheard() {
      return [...shares.values()].filter((share) => !share.heard).length;
    },
    hearAll() {
      if ([...shares.values()].every((share) => share.heard)) {
        return;
      }
      for (const [from, share] of shares) {
        shares.set(from, { ...share, heard: true });
      }
      changed();
    },
    get playing() {
      return playing;
    },
    setPlaying(from) {
      const next = from !== null && shares.has(from) ? from : null;
      if (next !== playing) {
        playing = next;
        changed();
      }
    },
    keep(memberIds) {
      const gone = [...shares.keys()].filter((from) => !memberIds.has(from));
      if (gone.length === 0) {
        return;
      }
      for (const from of gone) {
        shares.delete(from);
      }
      if (playing !== null && !shares.has(playing)) {
        playing = null;
      }
      changed();
    },
    clear() {
      if (shares.size === 0 && playing === null) {
        return;
      }
      shares.clear();
      playing = null;
      changed();
    },
    setSender(send) {
      if (send !== sender) {
        sender = send;
        changed();
      }
    },
    get canShare() {
      return sender !== null;
    },
    share(trackId, source) {
      if (sender === null || sharedSourceBytes(source) > MAX_SHARED_SOURCE_BYTES) {
        return false;
      }
      sender(trackId, source);
      return true;
    },
    onChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** The page's shared tracks. */
export const sharedTracks = createSharedTracks();
