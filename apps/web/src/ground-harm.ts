import type { GroundReach } from "@vibewars/game-core";

/**
 * Whom skill-made ground reaches (#3283, Q75): which side it hurts or
 * helps, as the arena dashes its edge and the audio warns of it (#3297).
 * Phaser-free and sound-free, so both read the one rule.
 */

/** A side as the viewer reads it: the snapshot's `teamSide`. */
export type GroundSide = "ally" | "enemy" | "third";

/** Whether ground of `reach`, owned by `owner`, reaches a body of side `body`. */
export function groundReaches(reach: GroundReach, owner: GroundSide, body: GroundSide): boolean {
  switch (reach) {
    case "all":
      return true;
    case "allies":
      return body === owner;
    case "foes":
      return body !== owner;
  }
}

/**
 * Whether the ground can hurt the viewer's side (Q75 option A): it
 * reaches its owner's foes, or all, and the viewer's side among them;
 * ground that reaches allies alone only ever helps. A watcher has no
 * side, so it reads the skill's own reach.
 */
export function harmsViewer(reach: GroundReach, owner: GroundSide, watching: boolean): boolean {
  return reach !== "allies" && (watching || groundReaches(reach, owner, "ally"));
}
