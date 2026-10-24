import { vec2 } from "@vibewars/game-core";

import type { CombatMessage, MatchSnapshot } from "../net/match-connection.js";
import { floatingCueFor, type FloatingCue } from "../ui/combat-readouts.js";
import type { FloatingText } from "./arena-snapshot.js";

/**
 * Combat events as floating text. Kept apart from the Phaser scene so it
 * can be tested without one: all it needs is somewhere to put the text.
 */

/** Where floating text goes: the arena scene, or a test's recorder. */
export interface FloatingTextSink {
  addFloatingText(text: FloatingText): void;
}

const COLOURS: Record<FloatingCue["tone"], number> = {
  damage: 0xff7b72,
  heal: 0x7ee787,
  neutral: 0xffd866,
};

let nextFloatingId = 0;

/** Turn server combat events into floating numbers above the right actor. */
export function showCombatFeedback(
  scene: FloatingTextSink,
  message: CombatMessage,
  snapshot: MatchSnapshot,
): void {
  for (const event of message.events) {
    const subject = snapshot.players.find((p) => p.sessionId === event.targetId);
    if (subject === undefined) {
      continue;
    }

    const cue = floatingCueFor(event.kind, event.amount);
    if (cue === undefined) {
      continue;
    }

    nextFloatingId += 1;
    scene.addFloatingText({
      id: nextFloatingId,
      text: cue.text,
      position: vec2(subject.x, subject.y - 24),
      colour: COLOURS[cue.tone],
      remainingSeconds: 1.2,
    });
  }
}
