import { vec2 } from "@vibewars/game-core";

import type { CombatMessage, MatchSnapshot } from "../net/match-client.js";
import {
  AREA_FLASH_SECONDS,
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

const DAMAGE_COLOUR = 0xff7b72;
const HEAL_COLOUR = 0x7ee787;
const NEUTRAL_COLOUR = 0xffd866;

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

  for (const event of message.events) {
    const subject = snapshot.players.find((p) => p.sessionId === event.targetId);
    if (subject === undefined) {
      continue;
    }

    let text: string | undefined;
    let colour = NEUTRAL_COLOUR;
    switch (event.kind) {
      case "damage":
        // The sign says damage or heal; the colour only backs it up, so a
        // player who cannot tell the two colours apart loses nothing.
        // U+2212, a real minus, as wide as the plus.
        text = `\u2212${String(Math.round(event.amount ?? 0))}`;
        colour = DAMAGE_COLOUR;
        break;
      case "heal":
        text = `+${String(Math.round(event.amount ?? 0))}`;
        colour = HEAL_COLOUR;
        break;
      case "interrupted":
        text = "interrupted!";
        break;
      case "death":
        text = "defeated";
        colour = DAMAGE_COLOUR;
        break;
      default:
        // Status applications/removals already show as markers on the
        // actor; adding text for them too would just be noise.
        continue;
    }

    nextFloatingId += 1;
    scene.addFloatingText({
      id: nextFloatingId,
      text,
      position: vec2(subject.x, subject.y - 24),
      colour,
      remainingSeconds: 1.2,
    });
  }
}
