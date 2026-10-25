import type { PlayerSnapshot } from "../net/match-connection.js";

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
  const self = players.find((player) => player.sessionId === selfId);
  if (self === undefined) {
    return undefined;
  }
  const distanceSquared = (player: PlayerSnapshot): number =>
    (player.x - self.x) ** 2 + (player.y - self.y) ** 2;
  const candidates = players
    .filter((player) => player.team !== self.team && !player.dead)
    .sort(
      (a, b) =>
        distanceSquared(a) - distanceSquared(b) ||
        // Ties by id, so equal distances always come in the same order.
        (a.sessionId < b.sessionId ? -1 : a.sessionId > b.sessionId ? 1 : 0),
    );
  if (candidates.length === 0) {
    return undefined;
  }

  const at = candidates.findIndex((player) => player.sessionId === currentTargetId);
  if (at === -1) {
    return (step === 1 ? candidates[0] : candidates[candidates.length - 1])?.sessionId;
  }
  return candidates[(at + step + candidates.length) % candidates.length]?.sessionId;
}
