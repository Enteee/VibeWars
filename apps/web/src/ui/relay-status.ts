import type { KeyedPlayer } from "./player-label.js";

/**
 * What this page's lobby says about relays (#2531), for Options → Relay
 * to show (#2981): the lobby and queue screens no longer do.
 */
export interface RelayStatus {
  /** Whose relay carries this page to its host: `undefined` direct. */
  readonly sharedBy: KeyedPlayer | undefined;
  /** How many players this page's shared relay holds a login for: 0 when it shares none. */
  readonly sharingWith: number;
}

const NONE: RelayStatus = { sharedBy: undefined, sharingWith: 0 };

let status = NONE;
const listeners = new Set<() => void>();

/** Replaces the status and tells every listener. */
export function setRelayStatus(next: RelayStatus): void {
  status = next;
  for (const listener of [...listeners]) {
    listener();
  }
}

export function relayStatus(): RelayStatus {
  return status;
}

/** Calls `listener` on every `setRelayStatus`; the returned function stops it. */
export function onRelayStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
