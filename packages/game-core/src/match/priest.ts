import { baseEnergyPipsFor } from "../equipment/armor.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import type { Vec2 } from "../vec2.js";
import type { Behaviour } from "./behaviour.js";
import type { ParticipantSpec } from "./simulation.js";

/**
 * Priest Annihilation's priest (#1186, GW1): a map's NPC that stands on
 * its team's Resurrection Shrine, heals with Heal Area, and raises the
 * team's dead every `PRIEST_WAVE_SECONDS`. GW1 publishes none of its
 * numbers, so these are the spec's.
 */

/** A team's Resurrection Shrine (#1186): where its priest stands and its dead come back. */
export interface Shrine {
  readonly team: number;
  readonly position: Vec2;
}

export const PRIEST_SKILL_ID = "monk.heal-area";
export const PRIEST_HEALTH = 480;
export const PRIEST_ARMOR = 60;
export const PRIEST_ENERGY = 30;
export const PRIEST_HEALING_PRAYERS = 14;

/** It heals whenever it, or an ally adjacent to it, is hurt. */
const PRIEST_BEHAVIOUR: Behaviour = { kind: "heal-when-hurt", skillId: PRIEST_SKILL_ID };

/** The id of `team`'s priest: no seat's id has a `/` in it. */
export function priestId(team: number): string {
  return `priest/${String(team)}`;
}

/** `shrine`'s priest, facing `facing`, as the simulation adds it. */
export function priestSpec(shrine: Shrine, facing: number): ParticipantSpec {
  return {
    id: priestId(shrine.team),
    team: shrine.team,
    skillBar: [PRIEST_SKILL_ID],
    attributeRanks: new Map([["monk.healing-prayers", PRIEST_HEALING_PRAYERS]]),
    equipment: unarmedResolvedEquipment(PRIEST_ARMOR),
    spawn: shrine.position,
    facing,
    maxHealth: PRIEST_HEALTH,
    maxEnergy: PRIEST_ENERGY,
    baseEnergyPips: baseEnergyPipsFor("monk"),
    behaviour: PRIEST_BEHAVIOUR,
    creature: {
      ownerId: undefined,
      kind: "priest",
      look: "priest",
      name: "Priest",
      expiresInSeconds: Number.POSITIVE_INFINITY,
      ageSeconds: 0,
      summonedAtTick: 0,
      skillId: undefined,
      aura: undefined,
      onDeath: "vanish",
      ownerDisableSeconds: 0,
      deathBurst: undefined,
      onDeathInRange: undefined,
      replacedBy: undefined,
      corpsesLeft: 0,
      companionSkillId: undefined,
      leaderId: undefined,
      mode: "guard",
    },
  };
}
