import { AREA_EARSHOT, findStatusDefinition, getSkill, groundReach } from "@vibewars/game-core";
import type { StatusCategory, Vec2 } from "@vibewars/game-core";
import type { CombatMessage, MatchSnapshot, PlayerSnapshot } from "@vibewars/game-session";

import { harmsViewer } from "../ground-harm.js";
import type { SoundId } from "./sound-ids.js";
import type { WorldPlaces } from "./world-places.js";

/**
 * Which sound plays for what (#104, #112). You hear only what concerns
 * you, never the whole arena: the table in docs/art/art-direction.md
 * §Sound. Pure, so the rules are tested without an AudioContext.
 */

/**
 * The sounds one combat message plays for `selfId`. An area skill that
 * hits five players lists its crack five times; the player throttles
 * that to one. The skill-type cues (#3297) play once a message each: an
 * area enchantment on five allies, you among them, chimes once.
 */
export function soundsForCombat(message: CombatMessage, selfId: string): SoundId[] {
  const mine = message.casterSessionId === selfId;
  const tick = isTick(message);
  const sounds: SoundId[] = [];
  for (const event of message.events) {
    if (tick && event.kind !== "death") {
      continue;
    }
    const onMe = event.targetId === selfId;
    switch (event.kind) {
      case "damage": {
        const hit = hitOn(message, event.targetId, selfId);
        if (hit !== undefined) {
          sounds.push(hit === "taken" ? "hit-taken" : "hit-dealt");
        }
        break;
      }
      case "heal":
        if (onMe) {
          sounds.push("heal");
        }
        break;
      case "interrupted":
      case "attack-interrupted":
        if (onMe || mine) {
          sounds.push("interrupt");
        }
        break;
      case "interrupt-missed":
        if (mine) {
          sounds.push("interrupt-missed");
        }
        break;
      case "death":
        sounds.push("death");
        break;
      default:
        break;
    }
  }
  return [...sounds, ...skillTypeSounds(message, selfId)];
}

/** The status categories whose landing on you has a cue of its own (#3297). */
const STATUS_SOUNDS: Partial<Record<StatusCategory, SoundId>> = {
  enchantment: "enchant-on",
  hex: "hex-on",
  stance: "stance-on",
};

/**
 * The skill-type cues of one message (#3297): an enchantment, hex or
 * stance landing on you, by the status's category; a shout or chant of
 * yours or an ally's reaching you, and a form you take, by the skill's
 * type. A shout aimed at a foe is no ally's and stays a hit.
 */
function skillTypeSounds(message: CombatMessage, selfId: string): SoundId[] {
  if (isTick(message)) {
    return [];
  }
  const skill = message.cause === "skill" ? getSkill(message.skillId) : undefined;
  const sounds = new Set<SoundId>();
  for (const event of message.events) {
    if (event.targetId !== selfId) {
      continue;
    }
    if (event.kind === "status-applied") {
      const category = findStatusDefinition(event.statusId)?.category;
      const sound = category === undefined ? undefined : STATUS_SOUNDS[category];
      if (sound !== undefined) {
        sounds.add(sound);
      }
    }
    if ((skill?.type === "shout" || skill?.type === "chant") && skill.target !== "single-enemy") {
      sounds.add("shout");
    }
    if (skill?.type === "form" && message.casterSessionId === selfId) {
      sounds.add("form-on");
    }
  }
  return [...sounds];
}

/**
 * A status tick (burning, Regeneration) comes up to 20 times a second: a
 * chime per tick drowns everything. Its health shows on the bar; only a
 * death it causes is worth a sound, and it is no new hit.
 */
function isTick(message: CombatMessage): boolean {
  return message.cause === "degeneration";
}

export type Hit = "dealt" | "taken";

/**
 * Whether something landing on `targetId` is a hit `selfId` took or
 * dealt, or neither. Hurting yourself is a hit you take, not one you deal.
 */
function hitOn(message: CombatMessage, targetId: string, selfId: string): Hit | undefined {
  if (targetId === selfId) {
    return "taken";
  }
  return message.casterSessionId === selfId ? "dealt" : undefined;
}

/**
 * The hostile hits in one combat message that concern `selfId` (#370),
 * classified as the sounds are: damage, an interrupt, or a condition or
 * hex landing. Heals, enchantments and status ticks are not hits.
 */
export function hitsForCombat(message: CombatMessage, selfId: string): Hit[] {
  if (isTick(message)) {
    return [];
  }
  const hits: Hit[] = [];
  for (const event of message.events) {
    const hostile =
      event.kind === "damage" ||
      event.kind === "interrupted" ||
      event.kind === "attack-interrupted" ||
      (event.kind === "status-applied" &&
        event.targetId !== message.casterSessionId &&
        findStatusDefinition(event.statusId)?.category !== "enchantment");
    const hit = hostile ? hitOn(message, event.targetId, selfId) : undefined;
    if (hit !== undefined) {
      hits.push(hit);
    }
  }
  return hits;
}

function playerById(snapshot: MatchSnapshot, id: string | undefined): PlayerSnapshot | undefined {
  return id === undefined ? undefined : snapshot.players.find((p) => p.sessionId === id);
}

/** Whether `id` started a cast between two snapshots: a new skill, or one where there was none. */
function startedCasting(prev: MatchSnapshot, next: MatchSnapshot, id: string): boolean {
  const after = playerById(next, id);
  if (after === undefined || after.dead || after.castingSkillId === undefined) {
    return false;
  }
  return playerById(prev, id)?.castingSkillId !== after.castingSkillId;
}

/**
 * The cast cues between two snapshots: `cast-self` when you start a cast,
 * `cast-target` when your target does, which is the moment to interrupt.
 *
 * Only a cast that starts while the caster is already your target counts,
 * so switching onto someone mid-cast stays silent. Without a `prev`, on
 * the first snapshot or after a reconnect, every running cast is old news.
 */
export function soundsForSnapshot(prev: MatchSnapshot | undefined, next: MatchSnapshot): SoundId[] {
  if (prev === undefined) {
    return [];
  }
  const selfId = next.selfSessionId;
  const sounds: SoundId[] = [];
  if (startedCasting(prev, next, selfId)) {
    sounds.push("cast-self");
  }
  const targetId = playerById(next, selfId)?.targetSessionId;
  if (
    targetId !== undefined &&
    targetId !== selfId &&
    targetId === playerById(prev, selfId)?.targetSessionId &&
    startedCasting(prev, next, targetId)
  ) {
    sounds.push("cast-target");
  }
  return sounds;
}

/** How far a gate or a falling wall is heard; a lever is a small thing, heard to `AREA_EARSHOT`. */
const LOUD_EARSHOT = 2 * AREA_EARSHOT;

/**
 * The world's cues between two snapshots (#3139): a lever flipping, a
 * stone gate or an energy barrier moving, a breakable wall crumbling,
 * each when near enough to `selfId`. Distance is on the ground, layers
 * ignored: sound carries over a ledge. Each id plays at most once, so a
 * lever that moves three gates grinds once. Without a `prev`, or
 * without a player of your own, nothing plays.
 */
export function soundsForWorld(
  prev: MatchSnapshot | undefined,
  next: MatchSnapshot,
  selfId: string,
  places: WorldPlaces,
): SoundId[] {
  const self = playerById(next, selfId);
  if (prev === undefined || self === undefined) {
    return [];
  }
  const near = (at: Vec2 | undefined, radius: number): boolean =>
    at !== undefined && Math.hypot(at.x - self.x, at.y - self.y) <= radius;
  const sounds = new Set<SoundId>();
  next.switches.forEach((up, at) => {
    const before = prev.switches[at];
    if (before !== undefined && before !== up && near(places.switches[at], AREA_EARSHOT)) {
      sounds.add("lever");
    }
  });
  next.gates.forEach((open, at) => {
    const before = prev.gates[at];
    const gate = places.gates[at];
    if (
      before !== undefined &&
      before !== open &&
      gate !== undefined &&
      near(gate.at, LOUD_EARSHOT)
    ) {
      sounds.add(gate.blocks === "all" ? "gate-stone" : "barrier");
    }
  });
  next.breakables.forEach((health, at) => {
    const before = prev.breakables[at];
    if (
      before !== undefined &&
      before > 0 &&
      health <= 0 &&
      near(places.breakables[at], LOUD_EARSHOT)
    ) {
      sounds.add("wall-crumble");
    }
  });
  return [...sounds];
}

/** How far past a harmful area's edge you are still warned of it (#3297). */
export const AREA_WARN_MARGIN = 100;
/** How far a spirit's summoning is heard, either side's (#3297). */
export const SPIRIT_EARSHOT = 700;

/**
 * The skill cues the ground and the spirits make between two snapshots
 * (#3297): `area-warn` when an area that can hurt you (`harmsViewer`)
 * lands with you inside it or within `AREA_WARN_MARGIN` of its edge, on
 * your layer, and `spirit-up` when a spirit of either side is summoned
 * within `SPIRIT_EARSHOT`. Only an area's landing warns, so one you
 * stay in warns once. The snapshot names an area's team, not its caster:
 * your own side's ground never warns you. Without a `prev`, or without
 * a player of your own, nothing plays.
 */
export function soundsForSkillsAround(
  prev: MatchSnapshot | undefined,
  next: MatchSnapshot,
  selfId: string,
): SoundId[] {
  const self = playerById(next, selfId);
  if (prev === undefined || self === undefined) {
    return [];
  }
  const away = (x: number, y: number): number => Math.hypot(x - self.x, y - self.y);
  const sounds = new Set<SoundId>();
  const landed = new Set(prev.groundEffects.map((effect) => effect.id));
  for (const effect of next.groundEffects) {
    if (
      !landed.has(effect.id) &&
      effect.team !== self.team &&
      effect.layer === self.layer &&
      harmsViewer(groundReach(effect.skillId), "enemy", false) &&
      away(effect.x, effect.y) <= effect.radius + AREA_WARN_MARGIN
    ) {
      sounds.add("area-warn");
    }
  }
  const before = new Set(prev.players.map((p) => p.sessionId));
  for (const spirit of next.players) {
    if (
      spirit.creature?.kind === "spirit" &&
      !spirit.dead &&
      !before.has(spirit.sessionId) &&
      away(spirit.x, spirit.y) <= SPIRIT_EARSHOT
    ) {
      sounds.add("spirit-up");
    }
  }
  return [...sounds];
}
