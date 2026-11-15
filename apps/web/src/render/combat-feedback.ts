import { getSkill, isWeaponId, vec2, WEAPONS } from "@vibewars/game-core";
import type { CombatMessage, MatchSnapshot } from "@vibewars/game-session";

import { floatingCueFor, type FloatingCue } from "../ui/combat-readouts.js";
import {
  ACTOR_RADIUS,
  AREA_FLASH_SECONDS,
  FLOATING_TEXT_OFFSET_X,
  FLOATING_TEXT_OFFSET_Y,
  FLOATING_TEXT_SECONDS,
  BEACON_BOLT_SECONDS,
  type BeaconBolt,
  SKILL_ARC_COLOUR,
  SKILL_ARC_SECONDS,
  SWING_FLASH_GAP,
  SWING_FLASH_SECONDS,
  teamColour,
  type AreaFlash,
  type FloatingText,
  type SwingFlash,
} from "./arena-snapshot.js";
import { impactsFor, type Impact } from "./body-impacts.js";
import { elevationOf } from "./render-order.js";
import { shoutMarksFor, type ShoutMark } from "./shout-marks.js";

/**
 * Combat events as floating text. Kept apart from the Phaser scene so it
 * can be tested without one: all it needs is somewhere to put the text.
 */

/** Where floating text and flashes go: the arena scene, or a test's recorder. */
export interface FloatingTextSink {
  addFloatingText(text: FloatingText): void;
  addAreaFlash(flash: AreaFlash): void;
  addSwingFlash(flash: SwingFlash): void;
  /** The Storm Beacon struck a body (#2694). */
  addBeaconBolt(bolt: BeaconBolt): void;
  /** An actor's swing struck twice: its off hand stabs too (#561). */
  struckTwice(actorId: string): void;
  /** A skill landed on these bodies (#1139). */
  addImpacts(impacts: readonly Impact[]): void;
  /** A shout or chant went out (#3301). */
  addShoutMarks(marks: readonly ShoutMark[]): void;
}

const COLOURS: Record<FloatingCue["tone"], number> = {
  damage: 0xff7b72,
  heal: 0x7ee787,
  energy: 0x79c0ff,
  neutral: 0xffd866,
};

let nextFloatingId = 0;
let nextFlashId = 0;
let nextSwingId = 0;
let nextBoltId = 0;

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
 * the target it swung at, and a melee attack skill's thick warm one
 * (#3292). Nothing for a ranged weapon or attack skill, whose shot is the
 * feedback, for any other skill, or when either side is not in the snapshot.
 */
export function swingFlashFor(
  message: CombatMessage,
  snapshot: MatchSnapshot,
): Omit<SwingFlash, "id"> | undefined {
  const skill = message.cause === "skill" ? getSkill(message.skillId) : undefined;
  if (message.cause !== "weapon" && skill?.type !== "attack") {
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
  const swung = {
    centre: vec2(attacker.x, attacker.y),
    layer: attacker.layer,
    angle: Math.atan2(target.y - attacker.y, target.x - attacker.x),
    radius: ACTOR_RADIUS + SWING_FLASH_GAP,
    own: attacker.sessionId === snapshot.selfSessionId,
  };
  return skill === undefined
    ? {
        ...swung,
        kind: "swing",
        colour: teamColour(attacker.team === self?.team ? "ally" : "enemy"),
        remainingSeconds: SWING_FLASH_SECONDS,
      }
    : { ...swung, kind: "skill", colour: SKILL_ARC_COLOUR, remainingSeconds: SKILL_ARC_SECONDS };
}

/** Turn server combat events into floating numbers above the right actor. */
/** The bolt a Storm Beacon's strike draws (#2694); nothing for any other message. */
export function beaconBoltFor(
  message: CombatMessage,
  snapshot: MatchSnapshot,
): Omit<BeaconBolt, "id"> | undefined {
  if (message.cause !== "beacon" || message.area === undefined) {
    return undefined;
  }
  const struck = snapshot.players.find((p) => p.sessionId === message.events[0]?.targetId);
  return struck === undefined
    ? undefined
    : {
        from: vec2(message.area.x, message.area.y),
        to: vec2(struck.x, struck.y),
        remainingSeconds: BEACON_BOLT_SECONDS,
      };
}

export function showCombatFeedback(
  scene: FloatingTextSink,
  message: CombatMessage,
  snapshot: MatchSnapshot,
  ground: number,
): void {
  const swing = swingFlashFor(message, snapshot);
  if (swing !== undefined) {
    nextSwingId += 1;
    scene.addSwingFlash({ id: nextSwingId, ...swing });
  }
  if (message.doubleStrike) {
    scene.struckTwice(message.casterSessionId);
  }
  const impacts = impactsFor(message);
  if (impacts.length > 0) {
    scene.addImpacts(impacts);
  }
  const shout = shoutMarksFor(message, (id) => {
    const player = snapshot.players.find((p) => p.sessionId === id);
    return player === undefined
      ? undefined
      : {
          team: player.team,
          position: vec2(player.x, player.y),
          layer: player.layer,
          radius: ACTOR_RADIUS,
        };
  });
  if (shout.length > 0) {
    scene.addShoutMarks(shout);
  }

  const bolt = beaconBoltFor(message, snapshot);
  if (bolt !== undefined) {
    nextBoltId += 1;
    scene.addBeaconBolt({ id: nextBoltId, ...bolt });
  }

  if (message.area !== undefined && message.cause !== "beacon") {
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
      position: vec2(
        subject.x + FLOATING_TEXT_OFFSET_X,
        subject.y + FLOATING_TEXT_OFFSET_Y - elevationOf(subject.layer, ground),
      ),
      lift: 0,
      colour: COLOURS[cue.tone],
      remainingSeconds: FLOATING_TEXT_SECONDS,
      weight: cue.critical ? "critical" : message.cause === "weapon" ? "light" : "normal",
    });
  }
}
