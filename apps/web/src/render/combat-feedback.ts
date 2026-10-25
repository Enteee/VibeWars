import { vec2 } from "@vibewars/game-core";

import type { CombatMessage, MatchSnapshot } from "../net/match-connection.js";
import { floatingCueFor, type FloatingCue } from "../ui/combat-readouts.js";
import {
  AREA_FLASH_SECONDS,
  FLOATING_TEXT_SECONDS,
  teamColour,
  type AreaFlash,
  type FloatingText,
} from "./arena-snapshot.js";

/**
 * Combat events as floating text. Kept apart from the Phaser scene so it
 * can be tested without one: all it needs is somewhere to put the text.
 */

/** Where floating text and area flashes go: the arena scene, or a test's recorder. */
export interface FloatingTextSink {
  addFloatingText(text: FloatingText): void;
  addAreaFlash(flash: AreaFlash): void;
}

const COLOURS: Record<FloatingCue["tone"], number> = {
  damage: 0xff7b72,
  heal: 0x7ee787,
  neutral: 0xffd866,
};

let nextFloatingId = 0;
let nextFlashId = 0;

/** Turn server combat events into floating numbers above the right actor. */
export function showCombatFeedback(
  scene: FloatingTextSink,
  message: CombatMessage,
  snapshot: MatchSnapshot,
): void {
  if (message.area !== undefined) {
    // In the caster's side's colour, from where you stand: never the
    // yellow that means "your target".
    const self = snapshot.players.find((p) => p.sessionId === snapshot.selfSessionId);
    const caster = snapshot.players.find((p) => p.sessionId === message.casterSessionId);
    nextFlashId += 1;
    scene.addAreaFlash({
      id: nextFlashId,
      position: vec2(message.area.x, message.area.y),
      radius: message.area.radius,
      colour: teamColour(caster !== undefined && caster.team === self?.team ? "ally" : "enemy"),
      remainingSeconds: AREA_FLASH_SECONDS,
    });
  }

  // A degeneration tick lands every sim tick, about a point each: as
  // numbers they would fill the stack and push out the hits that matter.
  // The health bar shows them, as GW1 does.
  if (message.cause === "degeneration") {
    return;
  }

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
      anchorId: subject.sessionId,
      text: cue.text,
      position: vec2(subject.x, subject.y - 24),
      colour: COLOURS[cue.tone],
      remainingSeconds: FLOATING_TEXT_SECONDS,
      weight: message.cause === "weapon" ? "light" : "normal",
    });
  }
}
