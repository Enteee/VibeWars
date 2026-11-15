import type { CombatMessage } from "@vibewars/game-session";

/** What station 8 has seen so far (#3316): every field latches, it only grows. */
export interface RatTally {
  /** The rats the player has struck, with a skill or the plain attack. */
  readonly hitByPlayer: ReadonlySet<string>;
  /** The skill ids from the player's bar that have landed on a rat. */
  readonly skillsOnRats: ReadonlySet<string>;
  /** The rats a knockdown has thrown. */
  readonly knockedDown: ReadonlySet<string>;
}

export interface RatWatch {
  /** One combat message, as the connection delivers it. */
  observe(message: CombatMessage): void;
  /** A rat placed after the watch was made: the station's extra one. */
  watch(ratId: string): void;
  readonly tally: () => RatTally;
}

/** What counts as landing: a blow that hurt, a knockdown, a status put on. */
const LANDED: ReadonlySet<string> = new Set(["damage", "knocked-down", "status-applied"]);

/**
 * Station 8's watch (#3316), over the combat messages: which of `ratIds`
 * `selfId` has struck, and which of `skillBar`'s skills landed on one. A
 * miss, a block or a stance on the player's own body lands on no rat, so
 * it counts for nothing. A knockdown is counted whoever threw it.
 */
export function createRatWatch(
  selfId: string,
  ratIds: readonly string[],
  skillBar: readonly (string | null)[],
): RatWatch {
  const rats = new Set(ratIds);
  const hitByPlayer = new Set<string>();
  const skillsOnRats = new Set<string>();
  const knockedDown = new Set<string>();
  return {
    observe(message) {
      const { cause, casterSessionId, skillId, events } = message;
      for (const event of events) {
        if (!("targetId" in event) || !rats.has(event.targetId) || !LANDED.has(event.kind)) {
          continue;
        }
        if (event.kind === "knocked-down") {
          knockedDown.add(event.targetId);
        }
        if (casterSessionId !== selfId) {
          continue;
        }
        hitByPlayer.add(event.targetId);
        if (cause === "skill" && skillBar.includes(skillId)) {
          skillsOnRats.add(skillId);
        }
      }
    },
    watch(ratId) {
      rats.add(ratId);
    },
    tally: () => ({ hitByPlayer, skillsOnRats, knockedDown }),
  };
}
