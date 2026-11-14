import { AREA_EARSHOT, SKILLS_BY_ID, findStatusDefinition, getSkill } from "@vibewars/game-core";
import type { Skill, SkillProfession, SkillType, StatusCategory, Vec2 } from "@vibewars/game-core";
import type { CombatMessage, MatchSnapshot, PlayerSnapshot } from "@vibewars/game-session";

import { toRenderableGroundEffect } from "../render/arena-snapshot.js";

import type { SoundId } from "./sound-ids.js";
import type { WorldPlaces } from "./world-places.js";

/**
 * Which sound plays for what (#104, #112). You hear only what concerns
 * you, never the whole arena: the table in docs/art/art-direction.md
 * §Sound. Pure, so the rules are tested without an AudioContext.
 */

/** The cue a status landing on you plays, by its category (#3297). */
const STATUS_CUES: Partial<Record<StatusCategory, SoundId>> = {
  enchantment: "enchant-on",
  hex: "hex-on",
  stance: "stance-on",
};

/**
 * The sounds one combat message plays for `selfId`. An area skill that
 * hits five players lists its crack five times; the player throttles
 * that to one. A skill type's cue (#3297) plays once per message, however
 * many of its events land on you. `latest`, the newest snapshot, tells
 * whose side the caster is on: only your own side's shout is a `shout`.
 */
export function soundsForCombat(
  message: CombatMessage,
  selfId: string,
  latest: MatchSnapshot | undefined,
): SoundId[] {
  const mine = message.casterSessionId === selfId;
  const tick = isTick(message);
  const sounds: SoundId[] = [];
  const once = (id: SoundId): void => {
    if (!sounds.includes(id)) {
      sounds.push(id);
    }
  };
  if (!tick && message.events.some(({ targetId }) => targetId === selfId)) {
    const type = message.cause === "skill" ? getSkill(message.skillId)?.type : undefined;
    if ((type === "shout" || type === "chant") && alliedCaster(message, selfId, latest)) {
      once("shout");
    } else if (type === "form") {
      once("form-on");
    }
  }
  for (const event of message.events) {
    if (tick && event.kind !== "death") {
      continue;
    }
    const onMe = event.targetId === selfId;
    switch (event.kind) {
      case "status-applied": {
        const category = findStatusDefinition(event.statusId)?.category;
        const cue = category === undefined ? undefined : STATUS_CUES[category];
        if (onMe && cue !== undefined) {
          once(cue);
        }
        break;
      }
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
  return sounds;
}

/**
 * Whether `message`'s caster stands on `selfId`'s side in `latest`. A
 * caster not in it, or no snapshot yet, is not known to be an ally.
 */
function alliedCaster(
  message: CombatMessage,
  selfId: string,
  latest: MatchSnapshot | undefined,
): boolean {
  if (latest === undefined) {
    return false;
  }
  const self = playerById(latest, selfId);
  const caster = playerById(latest, message.casterSessionId);
  return self !== undefined && caster?.team === self.team;
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
 * The cast cue between two snapshots: `cast-target` when your target
 * starts a cast, which is the moment to interrupt. Your own cast and
 * everyone else's are voices (#3298), from `castVoices`.
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

/** How near a harmful area's edge you are warned of it (#3297). */
export const AREA_WARN_REACH = 100;
/** How far a spirit's summoning is heard (#3297). */
export const SPIRIT_EARSHOT = 700;

/**
 * The skill cues the snapshot carries (#3297): `area-warn` when a skill
 * area that can hurt you (`harmsViewer`, as its dashed edge shows)
 * appears on your layer with you inside it or within `AREA_WARN_REACH`
 * of its edge, and `spirit-up` when a spirit of either side is summoned
 * within `SPIRIT_EARSHOT`. Only a new area or spirit counts, so each
 * plays once for it. Without a `prev`, or without a player of your own,
 * nothing plays.
 */
export function soundsForSkillGround(
  prev: MatchSnapshot | undefined,
  next: MatchSnapshot,
  selfId: string,
): SoundId[] {
  const self = playerById(next, selfId);
  if (prev === undefined || self === undefined) {
    return [];
  }
  const away = (x: number, y: number): number => Math.hypot(x - self.x, y - self.y);
  const sounds: SoundId[] = [];
  const known = new Set(prev.groundEffects.map(({ id }) => id));
  const warns = next.groundEffects.some(
    (effect) =>
      !known.has(effect.id) &&
      effect.layer === self.layer &&
      away(effect.x, effect.y) - effect.radius <= AREA_WARN_REACH &&
      toRenderableGroundEffect(effect, self.team).dashed,
  );
  if (warns) {
    sounds.push("area-warn");
  }
  const there = new Set(prev.players.map(({ sessionId }) => sessionId));
  const summoned = next.players.some(
    (p) =>
      p.creature?.kind === "spirit" && !there.has(p.sessionId) && away(p.x, p.y) <= SPIRIT_EARSHOT,
  );
  if (summoned) {
    sounds.push("spirit-up");
  }
  return sounds;
}

/** How far a cast is heard (#3298). */
export const CAST_EARSHOT = 700;
/** Nearer than this, a cast is at its full loudness. */
const CAST_FULL_REACH = 200;
/** How much quieter a cast at `CAST_EARSHOT` is than one at `CAST_FULL_REACH`. */
const CAST_FAR_DB = -12;
/** An ally's cast under a foe's: foes are who you interrupt. */
const ALLY_DB = -3;
/** Your own cast: about −16 dBFS for both layers, as `cast-self` was. */
const SELF_DB = -7;
/** At most this many cast voices sound at once; the rest are dropped or cut. */
export const CAST_VOICE_LIMIT = 3;
/** A skill's motif is pitched in quarter-tones, 24 to the octave. */
const STEPS_PER_OCTAVE = 24;
/** Its lowest step, −5 semitones, and how many there are, up to +6. */
const LOWEST_STEP = -10;
const PITCH_STEPS = 23;

/** Each profession's low base layer (#3298), so the ear knows who casts. */
const CAST_BASES: Record<SkillProfession, SoundId> = {
  warrior: "cast-base-warrior",
  ranger: "cast-base-ranger",
  monk: "cast-base-monk",
  necromancer: "cast-base-necromancer",
  mesmer: "cast-base-mesmer",
  elementalist: "cast-base-elementalist",
  assassin: "cast-base-assassin",
  ritualist: "cast-base-ritualist",
  paragon: "cast-base-paragon",
  dervish: "cast-base-dervish",
  common: "cast-base-common",
};

/** Each skill type's high motif (#3298): eight, the rarer types folded into the nearest. */
const CAST_MOTIFS: Record<SkillType, SoundId> = {
  spell: "cast-motif-spell",
  "item-spell": "cast-motif-spell",
  "weapon-spell": "cast-motif-spell",
  glyph: "cast-motif-spell",
  hex: "cast-motif-hex",
  enchantment: "cast-motif-enchantment",
  signet: "cast-motif-signet",
  stance: "cast-motif-signet",
  form: "cast-motif-signet",
  skill: "cast-motif-signet",
  shout: "cast-motif-shout",
  chant: "cast-motif-shout",
  echo: "cast-motif-shout",
  attack: "cast-motif-attack",
  "pet-attack": "cast-motif-attack",
  preparation: "cast-motif-attack",
  "nature-ritual": "cast-motif-ritual",
  "binding-ritual": "cast-motif-ritual",
  well: "cast-motif-ward",
  ward: "cast-motif-ward",
  trap: "cast-motif-ward",
};

/** A stable 32-bit hash of `text` (FNV-1a). */
function hashOf(text: string): number {
  let hash = 0x811c9dc5;
  for (let at = 0; at < text.length; at += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(at), 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Each skill's pitch step, `LOWEST_STEP` up. The skills that share a base
 * and a motif are ordered by the hash of their id and dealt round the
 * steps in turn, so no step holds more than its share of them: a hash
 * alone piles eight Elementalist spells on one note. The same catalog
 * always deals the same steps.
 */
function dealSteps(skills: Iterable<Skill>): ReadonlyMap<string, number> {
  const buckets = new Map<string, Skill[]>();
  for (const skill of skills) {
    const bucket = `${CAST_BASES[skill.profession]} ${CAST_MOTIFS[skill.type]}`;
    buckets.set(bucket, [...(buckets.get(bucket) ?? []), skill]);
  }
  const steps = new Map<string, number>();
  for (const bucket of buckets.values()) {
    const ordered = bucket
      .map(({ id }) => ({ id, hash: hashOf(id) }))
      .sort((a, b) => a.hash - b.hash || (a.id < b.id ? -1 : 1));
    // Dealt from the step the lowest hash picks, so a small bucket does
    // not always start at the bottom.
    const first = (ordered[0]?.hash ?? 0) % PITCH_STEPS;
    ordered.forEach(({ id }, rank) => {
      steps.set(id, LOWEST_STEP + ((first + rank) % PITCH_STEPS));
    });
  }
  return steps;
}

let pitchSteps: ReadonlyMap<string, number> | undefined;

/** `skillId`'s pitch step, in quarter-tones from the motif's own: −10 to +12. */
export function castPitchStep(skillId: string): number {
  pitchSteps ??= dealSteps(SKILLS_BY_ID.values());
  return pitchSteps.get(skillId) ?? 0;
}

/** The playback rate `skillId`'s motif plays at: the same for the same skill, always. */
export function castPitch(skillId: string): number {
  return 2 ** (castPitchStep(skillId) / STEPS_PER_OCTAVE);
}

/** One cast, heard (#3298): its two layers, played together, as one voice. */
export interface CastVoice {
  /** The caster's profession, low. */
  readonly base: SoundId;
  /** The skill type's motif, high, at `rate`. */
  readonly motif: SoundId;
  /** The motif's playback rate: the skill's own pitch. */
  readonly rate: number;
  /** Linear gain on both layers. */
  readonly gain: number;
  /**
   * Lower sounds first and is cut last: your target 0, you 1, a foe 2,
   * an ally 3, the nearer first within each.
   */
  readonly priority: number;
}

/** Who hears the casts: the player's seat, or a watcher's camera at `at` (#3298). */
export interface CastListener {
  readonly selfId: string;
  /** Where the camera is; a seat hears from its own body when absent. */
  readonly at: Vec2 | undefined;
}

const decibels = (db: number): number => 10 ** (db / 20);

/** `skill`'s two layers: its profession's base, its type's motif at its own pitch. */
export function castLayers(skill: Skill): Pick<CastVoice, "base" | "motif" | "rate"> {
  return {
    base: CAST_BASES[skill.profession],
    motif: CAST_MOTIFS[skill.type],
    rate: castPitch(skill.id),
  };
}

/** `caster`'s cast of `skill`, as `listener` hears it in `snapshot`, or none out of earshot. */
function castVoice(
  snapshot: MatchSnapshot,
  caster: PlayerSnapshot,
  skill: Skill,
  listener: CastListener,
): CastVoice | undefined {
  const self = playerById(snapshot, listener.selfId);
  const at = listener.at ?? self;
  const layers = castLayers(skill);
  if (caster.sessionId === self?.sessionId) {
    return { ...layers, gain: decibels(SELF_DB), priority: 1 };
  }
  if (caster.sessionId === self?.targetSessionId) {
    return { ...layers, gain: 1, priority: 0 };
  }
  if (at === undefined) {
    return undefined;
  }
  const away = Math.hypot(caster.x - at.x, caster.y - at.y);
  if (away > CAST_EARSHOT) {
    return undefined;
  }
  const far = Math.max(0, away - CAST_FULL_REACH) / (CAST_EARSHOT - CAST_FULL_REACH);
  const ally = caster.team === self?.team;
  return {
    ...layers,
    gain: decibels(far * CAST_FAR_DB + (ally ? ALLY_DB : 0)),
    priority: (ally ? 3 : 2) + away / (10 * CAST_EARSHOT),
  };
}

/** The `CAST_VOICE_LIMIT` that matter most of `voices`. */
function loudest(voices: readonly CastVoice[]): CastVoice[] {
  return [...voices].sort((a, b) => a.priority - b.priority).slice(0, CAST_VOICE_LIMIT);
}

/**
 * The casts that started between two snapshots, as voices (#3298): your
 * own, your target's, and anyone's within `CAST_EARSHOT` of the listener,
 * foe or ally. Distance is on the ground: sound carries over a ledge.
 * Without a `prev`, every running cast is old news.
 */
export function castVoices(
  prev: MatchSnapshot | undefined,
  next: MatchSnapshot,
  listener: CastListener,
): CastVoice[] {
  if (prev === undefined) {
    return [];
  }
  const voices = next.players.flatMap((caster) => {
    const skill = startedCasting(prev, next, caster.sessionId)
      ? getSkill(caster.castingSkillId ?? "")
      : undefined;
    const voice = skill === undefined ? undefined : castVoice(next, caster, skill, listener);
    return voice === undefined ? [] : [voice];
  });
  return loudest(voices);
}

/**
 * An instant skill's voice (#3298): it has no cast for a snapshot to show,
 * so it is heard when its combat message comes, at its activation. An
 * attack skill takes its weapon's time and is heard as a cast.
 */
export function instantCastVoice(
  message: CombatMessage,
  latest: MatchSnapshot | undefined,
  listener: CastListener,
): CastVoice | undefined {
  const skill = message.cause === "skill" ? getSkill(message.skillId) : undefined;
  if (
    latest === undefined ||
    skill === undefined ||
    skill.activationSeconds > 0 ||
    skill.attack !== undefined
  ) {
    return undefined;
  }
  const caster = playerById(latest, message.casterSessionId);
  return caster === undefined || caster.dead
    ? undefined
    : castVoice(latest, caster, skill, listener);
}
