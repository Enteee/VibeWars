import type { ClientIntent } from "@vibewars/game-protocol";

import type { MatchSnapshot } from "../net/match-connection.js";

/**
 * Space and Esc, as pure functions of the latest snapshot (#160), shared
 * by the match and the Training Ground so both keys mean the same thing
 * in both places. They only ever ask: the server decides whether the
 * attack happens.
 */

/**
 * What Space sends: an attack on the current target. With none, the
 * nearest living enemy is selected first, by the rule an enemy skill cast
 * with no target uses (`nearestLiving` in game-core). Nothing, when there
 * is nobody to attack.
 */
export function attackKeyIntents(snapshot: MatchSnapshot): ClientIntent[] {
  const self = snapshot.players.find((player) => player.sessionId === snapshot.selfSessionId);
  if (self === undefined) {
    return [];
  }
  if (self.targetSessionId !== undefined) {
    return [{ kind: "attack", targetId: self.targetSessionId }];
  }

  let nearest: string | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const other of snapshot.players) {
    if (other.sessionId === self.sessionId || other.dead || other.team === self.team) {
      continue;
    }
    const d = Math.hypot(other.x - self.x, other.y - self.y);
    if (d < nearestDistance) {
      nearestDistance = d;
      nearest = other.sessionId;
    }
  }
  return nearest === undefined
    ? []
    : [
        { kind: "target", targetSessionId: nearest },
        { kind: "attack", targetId: nearest },
      ];
}

/** Whether this player is attacking someone, so Esc has an attack to cancel. */
export function isAttacking(snapshot: MatchSnapshot): boolean {
  const self = snapshot.players.find((player) => player.sessionId === snapshot.selfSessionId);
  return self?.attackTargetSessionId !== undefined;
}

/**
 * What a double-click on `hitId` sends (#298): the mouse twin of
 * `attackKeyIntents`. An attack, when it is a living enemy; nothing for
 * an ally, yourself, a corpse or empty ground, whose double-click is just
 * the target its single click already set.
 */
export function attackClickIntents(
  snapshot: MatchSnapshot,
  hitId: string | undefined,
): ClientIntent[] {
  const self = snapshot.players.find((player) => player.sessionId === snapshot.selfSessionId);
  const hit = snapshot.players.find((player) => player.sessionId === hitId);
  if (self === undefined || hit === undefined || hit.dead || hit.team === self.team) {
    return [];
  }
  return [{ kind: "attack", targetId: hit.sessionId }];
}
