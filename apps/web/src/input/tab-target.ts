import type { ClientIntent } from "@vibewars/game-protocol";
import type { PlayerSnapshot } from "@vibewars/game-session";

/**
 * Living enemies of `selfId`, nearest first, ties by id so equal
 * distances always come in the same order. The one order Tab and C share.
 */
function foesByDistance(players: readonly PlayerSnapshot[], selfId: string): PlayerSnapshot[] {
  const self = players.find((player) => player.sessionId === selfId);
  if (self === undefined) {
    return [];
  }
  const distanceSquared = (player: PlayerSnapshot): number =>
    (player.x - self.x) ** 2 + (player.y - self.y) ** 2;
  return players
    .filter((player) => player.team !== self.team && !player.dead)
    .sort(
      (a, b) =>
        distanceSquared(a) - distanceSquared(b) ||
        (a.sessionId < b.sessionId ? -1 : a.sessionId > b.sessionId ? 1 : 0),
    );
}

/**
 * Tab and Shift-Tab: cycle through living enemies by distance (#55).
 *
 * Pure, and recomputed from the latest snapshot on every press rather
 * than remembered as a cycle, so the order is always the order the
 * player sees now. It only picks; the `target` intent it feeds is still
 * the server's to validate.
 */
export function nextTabTarget(
  players: readonly PlayerSnapshot[],
  selfId: string,
  currentTargetId: string | undefined,
  step: 1 | -1,
): string | undefined {
  const candidates = foesByDistance(players, selfId);
  if (candidates.length === 0) {
    return undefined;
  }

  const at = candidates.findIndex((player) => player.sessionId === currentTargetId);
  if (at === -1) {
    return (step === 1 ? candidates[0] : candidates[candidates.length - 1])?.sessionId;
  }
  return candidates[(at + step + candidates.length) % candidates.length]?.sessionId;
}

/** C (#1024): the closest living enemy, never cycling; `undefined` with none. */
export function closestTarget(
  players: readonly PlayerSnapshot[],
  selfId: string,
): string | undefined {
  return foesByDistance(players, selfId)[0]?.sessionId;
}

/**
 * G (#1028): yourself as your target, as a right click on your own body
 * sends; `undefined` when you are already your target, or not in `players`.
 */
export function selfTargetIntent(
  players: readonly PlayerSnapshot[],
  selfId: string,
): ClientIntent | undefined {
  const self = players.find((player) => player.sessionId === selfId);
  if (self === undefined || self.targetSessionId === selfId) {
    return undefined;
  }
  return { kind: "target", targetSessionId: selfId };
}
