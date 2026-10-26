import { isWeaponId, vec2, WEAPONS } from "@vibewars/game-core";
import type { CombatMessage, MatchSnapshot } from "@vibewars/game-session";

import { floatingCueFor, type FloatingCue } from "../ui/combat-readouts.js";
import {
  ACTOR_RADIUS,
  AREA_FLASH_SECONDS,
  FLOATING_TEXT_OFFSET_X,
  FLOATING_TEXT_OFFSET_Y,
  FLOATING_TEXT_SECONDS,
  SWING_FLASH_GAP,
  SWING_FLASH_SECONDS,
  teamColour,
  type AreaFlash,
  type FloatingText,
  type SwingFlash,
} from "./arena-snapshot.js";

/**
 * Combat events as floating text. Kept apart from the Phaser scene so it
 * can be tested without one: all it needs is somewhere to put the text.
 */

/** Where floating text and flashes go: the arena scene, or a test's recorder. */
export interface FloatingTextSink {
  addFloatingText(text: FloatingText): void;
  addAreaFlash(flash: AreaFlash): void;
  addSwingFlash(flash: SwingFlash): void;
  /** An actor's swing struck twice: its off hand stabs too (#561). */
  struckTwice(actorId: string): void;
}

const COLOURS: Record<FloatingCue["tone"], number> = {
  damage: 0xff7b72,
  heal: 0x7ee787,
  neutral: 0xffd866,
};

let nextFloatingId = 0;
let nextFlashId = 0;
let nextSwingId = 0;

/** Whether a weapon swings rather than shoots. An unknown one does neither. */
function isMelee(weaponId: string | undefined): boolean {
  return (
    weaponId !== undefined &&
    isWeaponId(weaponId) &&
    WEAPONS[weaponId].projectileSpeed === undefined
  );
}

/**
 * The arc a melee weapon event flashes (#161): around the attacker, toward
 * the target it swung at. Nothing for a ranged weapon, whose shot is the
 * feedback, or when either side is not in the snapshot.
 */
export function swingFlashFor(
  message: CombatMessage,
  snapshot: MatchSnapshot,
): Omit<SwingFlash, "id"> | undefined {
  if (message.cause !== "weapon") {
    return undefined;
  }
  const attacker = snapshot.players.find((p) => p.sessionId === message.casterSessionId);
  if (attacker === undefined || !isMelee(attacker.weaponId)) {
    return undefined;
  }
  // The first one hit is the target; a cleave's others come after it.
  const targetId = message.events.find((event) => event.targetId !== attacker.sessionId)?.targetId;
  const target = snapshot.players.find((p) => p.sessionId === targetId);
  if (target === undefined || (target.x === attacker.x && target.y === attacker.y)) {
    return undefined;
  }
  const self = snapshot.players.find((p) => p.sessionId === snapshot.selfSessionId);
  return {
    centre: vec2(attacker.x, attacker.y),
    angle: Math.atan2(target.y - attacker.y, target.x - attacker.x),
    radius: ACTOR_RADIUS + SWING_FLASH_GAP,
    colour: teamColour(attacker.team === self?.team ? "ally" : "enemy"),
    own: attacker.sessionId === snapshot.selfSessionId,
    remainingSeconds: SWING_FLASH_SECONDS,
  };
}

/** Turn server combat events into floating numbers above the right actor. */
export function showCombatFeedback(
  scene: FloatingTextSink,
  message: CombatMessage,
  snapshot: MatchSnapshot,
): void {
  const swing = swingFlashFor(message, snapshot);
  if (swing !== undefined) {
    nextSwingId += 1;
    scene.addSwingFlash({ id: nextSwingId, ...swing });
  }
  if (message.doubleStrike) {
    scene.struckTwice(message.casterSessionId);
  }

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
  // The health bar shows them, as GW1 does. A death by bleeding still says so.
  const ticking = message.cause === "degeneration";

  for (const event of message.events) {
    if (ticking && (event.kind === "damage" || event.kind === "heal")) {
      continue;
    }
    const subject = snapshot.players.find((p) => p.sessionId === event.targetId);
    if (subject === undefined) {
      continue;
    }

    const cue = floatingCueFor(
      event.kind,
      "amount" in event ? event.amount : undefined,
      event.kind === "damage" && event.critical,
    );
    if (cue === undefined) {
      continue;
    }

    nextFloatingId += 1;
    scene.addFloatingText({
      id: nextFloatingId,
      anchorId: subject.sessionId,
      text: cue.text,
      position: vec2(subject.x + FLOATING_TEXT_OFFSET_X, subject.y + FLOATING_TEXT_OFFSET_Y),
      colour: COLOURS[cue.tone],
      remainingSeconds: FLOATING_TEXT_SECONDS,
      weight: cue.critical ? "critical" : message.cause === "weapon" ? "light" : "normal",
    });
  }
}
