import { AREA_EARSHOT, AREA_IN_THE_AREA, AREA_NEARBY, RANGE_SPELL } from "../distances.js";
import { baseEnergyPipsFor } from "../equipment/armor.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, weaponDamageType } from "../equipment/weapons.js";
import { PRIEST_WAVE_SECONDS } from "../match-rules.js";
import { distance, type Vec2 } from "../vec2.js";
import { ALTAR_REACH_UNITS } from "./relics.js";
import type { Behaviour } from "./behaviour.js";
import type { ParticipantSpec } from "./simulation.js";

/**
 * King of the Hill's Ghostly Hero (#1377, GW1): a team's NPC that its
 * players lead about. Space on it, within a flag's reach, toggles it
 * between following that player and staying where it is. On the altar
 * it claims it by itself, through the simulation's cast path, so an
 * interrupt or a knockdown cuts the claim short. Dead, it rises at its
 * `ghost-spawn` at the priests' interval, staying put. GW1 publishes
 * none of its numbers, so these are the spec's.
 */

/** Where a team's Ghostly Hero starts and rises (#1377), from its map's `ghost-spawn`. */
export interface GhostSpawn {
  readonly team: number;
  readonly position: Vec2;
}

/** A King of the Hill map's objectives (#1377): one altar, one `ghost-spawn` per team. */
export interface HillField {
  readonly altar: Vec2;
  readonly spawns: readonly GhostSpawn[];
}

/** The skill a ghost claims the altar with: an `npcOnly` record, on no player's bar. */
export const CLAIM_SKILL_ID = "npc.claim-resource";
export const GHOST_HEALTH = 600;
export const GHOST_ARMOR = 60;
export const GHOST_ENERGY = 30;
export const GHOST_SWORDSMANSHIP = 12;

const SWORD = WEAPONS.sword;

/** The id of `team`'s Ghostly Hero: no seat's id has a `/` in it. */
export function ghostId(team: number): string {
  return `ghost/${String(team)}`;
}

/** Whether `id` names a team's Ghostly Hero. */
export function isGhostId(id: string): boolean {
  return /^ghost\/\d+$/.test(id);
}

/** Whether a ghost at `position` stands near enough the altar to claim it. */
export function onHill(field: HillField, position: Vec2): boolean {
  return distance(position, field.altar) <= ALTAR_REACH_UNITS;
}

/**
 * Following `leaderId`, as a minion follows its master: at its heel,
 * fighting what the leader attacks, else the nearest foe in earshot.
 */
export function followBehaviour(leaderId: string): Behaviour {
  return {
    kind: "follow-and-attack",
    leaderId,
    engage: "owner-target-then-nearest",
    aggroUnits: AREA_EARSHOT,
    leashUnits: RANGE_SPELL,
    heelUnits: AREA_IN_THE_AREA,
  };
}

/** Staying at `post`: it fights a foe that comes near, and walks back after. */
export function stayBehaviour(post: Vec2): Behaviour {
  return {
    kind: "guard",
    post,
    aggroUnits: AREA_NEARBY,
    leashUnits: AREA_IN_THE_AREA,
    rooted: false,
    thinkSeconds: 0.25,
  };
}

/** `spawn`'s ghost, facing `facing`, staying at its spawn, as the simulation adds it. */
export function ghostSpec(spawn: GhostSpawn, facing: number): ParticipantSpec {
  return {
    id: ghostId(spawn.team),
    team: spawn.team,
    skillBar: [CLAIM_SKILL_ID],
    attributeRanks: new Map([["warrior.swordsmanship", GHOST_SWORDSMANSHIP]]),
    equipment: {
      ...unarmedResolvedEquipment(GHOST_ARMOR),
      mainHand: {
        weapon: SWORD,
        attributeId: "warrior.swordsmanship",
        damageType: weaponDamageType(SWORD, "warrior.swordsmanship"),
        requirementMet: true,
        creatureDamageScale: undefined,
      },
    },
    spawn: spawn.position,
    facing,
    maxHealth: GHOST_HEALTH,
    maxEnergy: GHOST_ENERGY,
    baseEnergyPips: baseEnergyPipsFor("warrior"),
    behaviour: stayBehaviour(spawn.position),
    // It rises where it started, at the priests' interval (#1186).
    reset: { kind: "on-death", afterSeconds: PRIEST_WAVE_SECONDS },
    creature: {
      ownerId: undefined,
      kind: "ghostly-hero",
      look: "ghostly-hero",
      name: "Ghostly Hero",
      expiresInSeconds: Number.POSITIVE_INFINITY,
      ageSeconds: 0,
      summonedAtTick: 0,
      skillId: undefined,
      aura: undefined,
      onDeath: "rise",
      ownerDisableSeconds: 0,
      companionSkillId: undefined,
      mode: "guard",
    },
  };
}
