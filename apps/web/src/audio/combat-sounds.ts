import { AREA_EARSHOT, findStatusDefinition, getSkill, groundReach } from "@vibewars/game-core";
import type { Vec2 } from "@vibewars/game-core";
import type { CombatMessage, MatchSnapshot, PlayerSnapshot } from "@vibewars/game-session";

import { harmsViewer } from "../render/ground-effect-look.js";
import { teamSide } from "../render/arena-snapshot.js";
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
 * that to one.
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
      case "status-applied": {
        const applied = onMe ? statusCue(event.statusId) : undefined;
        if (applied !== undefined && !sounds.includes(applied)) {
          sounds.push(applied);
        }
        break;
      }
      default:
        break;
    }
  }
  const skillCue = skillTypeCue(message, selfId);
  if (skillCue !== undefined) {
    sounds.push(skillCue);
  }
  return sounds;
}

/** The cue for a status landing on you: an enchantment, a hex or a stance, nothing else. */
function statusCue(statusId: string): SoundId | undefined {
  switch (findStatusDefinition(statusId)?.category) {
    case "enchantment":
      return "enchant-on";
    case "hex":
      return "hex-on";
    case "stance":
      return "stance-on";
    default:
      return undefined;
  }
}

/**
 * What the skill's own type adds (#3297): a shout or chant that reaches
 * you, or a form you take. Once a message, however many it touches.
 */
function skillTypeCue(message: CombatMessage, selfId: string): SoundId | undefined {
  if (message.cause !== "skill" || isTick(message)) {
    return undefined;
  }
  switch (getSkill(message.skillId)?.type) {
    case "shout":
    case "chant":
      return message.events.some((event) => event.targetId === selfId) ? "shout" : undefined;
    case "form":
      return message.casterSessionId === selfId ? "form-on" : undefined;
    default:
      return undefined;
  }
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

/** How close to an area's edge it still warns you, world units. */
const AREA_WARN_MARGIN = 100;
/** How far a summoned spirit is heard, world units. */
const SPIRIT_EARSHOT = 700;

/**
 * The cues the skills' ground and creatures make between two snapshots
 * (#3297): `area-warn` when an area that can hurt you (`harmsViewer`)
 * lands with you inside or within 100 of its edge, and `spirit-up` when
 * a spirit, either side's, is summoned within 700 of you. Distance is on
 * the ground, layers ignored. Your own team's areas never warn, and an
 * area warns once, the snapshot it appears in. Without a `prev`, or a
 * player of your own, nothing plays.
 */
export function soundsForSkillWorld(
  prev: MatchSnapshot | undefined,
  next: MatchSnapshot,
  selfId: string,
): SoundId[] {
  const self = playerById(next, selfId);
  if (prev === undefined || self === undefined) {
    return [];
  }
  const sounds: SoundId[] = [];
  const known = new Set(prev.groundEffects.map((effect) => effect.id));
  const warned = next.groundEffects.some((effect) => {
    const owner = teamSide(effect.team, self.team);
    return (
      !known.has(effect.id) &&
      owner !== "ally" &&
      harmsViewer(groundReach(effect.skillId), owner, false) &&
      Math.hypot(effect.x - self.x, effect.y - self.y) <= effect.radius + AREA_WARN_MARGIN
    );
  });
  if (warned) {
    sounds.push("area-warn");
  }
  const before = new Set(prev.players.map((player) => player.sessionId));
  const summoned = next.players.some(
    (player) =>
      player.creature?.kind === "spirit" &&
      !player.dead &&
      !before.has(player.sessionId) &&
      Math.hypot(player.x - self.x, player.y - self.y) <= SPIRIT_EARSHOT,
  );
  if (summoned) {
    sounds.push("spirit-up");
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
