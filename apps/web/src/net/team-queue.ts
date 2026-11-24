import type { LobbyMode } from "@vibewars/game-protocol";
import type { LobbySnapshot } from "@vibewars/game-session";

/**
 * A party's ticket under `nonce` is over (#1766): its lobby left the
 * queue, or queued again under another. Never while `parked` in its
 * match, which is its host's to put back, nor for a warmup (#3899),
 * which is still the same queueing.
 */
export function endsTeamQueue(
  nonce: string,
  parked: boolean,
  party: Pick<LobbySnapshot, "queueNonce">,
): boolean {
  return !parked && party.queueNonce !== nonce;
}

/** The mode Match history keeps a match under (#3848): none for a warmup (#3899), which counts for nothing. */
export function historyModeOf(mode: LobbyMode | undefined, warmup: boolean): LobbyMode | undefined {
  return warmup ? undefined : mode;
}
