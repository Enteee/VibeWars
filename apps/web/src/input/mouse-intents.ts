import type { Vec2 } from "@vibewars/game-core";
import type { ClientIntent } from "@vibewars/game-protocol";
import type { MatchSnapshot } from "@vibewars/game-session";

import { actorAtPoint, type ArenaSnapshot } from "../render/arena-snapshot.js";
import { attackClickIntents } from "./attack-key.js";
import type { DoubleClick } from "./double-click.js";

/**
 * What a right click sends (#438), shared by the match and the Training
 * Ground so it means the same in both. The left button only ever walks;
 * the right one picks.
 *
 * A body under `world` is targeted, and a second right click on the same
 * enemy within the double-click window attacks it, as Space would (#298).
 * The ground sends nothing: a missed right click costs nothing, and keeps
 * the target. `doubleClick` is pressed either way, so a click on the
 * ground breaks a double.
 */
export function secondaryClickIntents(
  snapshot: MatchSnapshot,
  arena: ArenaSnapshot,
  world: Vec2,
  doubleClick: DoubleClick,
  nowMs: number,
): ClientIntent[] {
  const hit = actorAtPoint(arena, world);
  const double = doubleClick.press(hit?.id, nowMs);
  if (hit === undefined) {
    return [];
  }
  return [
    { kind: "target", targetSessionId: hit.id },
    ...(double ? attackClickIntents(snapshot, hit.id) : []),
  ];
}
