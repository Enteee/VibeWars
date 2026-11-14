import type { CombatMessage } from "@vibewars/game-session";

/** What station 6 has seen so far (#3303): both latch, once true they stay true. */
export interface HealTally {
  /** A zone's strike has hurt the tutor. */
  readonly tutorHit: boolean;
  /** The player's heal has landed on the tutor after that hit. */
  readonly healedTutor: boolean;
}

export interface HealWatch {
  /** One combat message, as the connection delivers it. */
  observe(message: CombatMessage): void;
  readonly tally: () => HealTally;
}

/**
 * Station 6's watch (#3303), over the combat messages: a zone's strike
 * that hurts `tutorId`, then `selfId`'s `healSkill` that heals it. A heal
 * before the hit is not counted, and stays not counted after it. A heal
 * counts when it gives the tutor health back: the tutor bleeds until it
 * does, so it always has some to give.
 */
export function createHealWatch(selfId: string, tutorId: string, healSkill: string): HealWatch {
  let tutorHit = false;
  let healedTutor = false;
  return {
    observe(message) {
      const { cause, casterSessionId, skillId, events } = message;
      if (
        cause === "zone" &&
        events.some((event) => event.kind === "damage" && event.targetId === tutorId)
      ) {
        tutorHit = true;
        return;
      }
      healedTutor ||=
        tutorHit &&
        cause === "skill" &&
        casterSessionId === selfId &&
        skillId === healSkill &&
        events.some(
          (event) => event.kind === "heal" && event.targetId === tutorId && event.amount > 0,
        );
    },
    tally: () => ({ tutorHit, healedTutor }),
  };
}
