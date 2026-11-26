import { RANGE_MELEE } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import type { DamageType } from "../equipment/types.js";
import type { Vec2 } from "../vec2.js";
import type { Behaviour } from "./behaviour.js";
import type { ParticipantSpec } from "./simulation.js";

/**
 * A critter (#3315): a small, weak, hostile animal any world can place,
 * the tutorial's rats first (#3316). Nobody owns it and it counts for
 * nobody, as a base guard; it holds its post with the `guard` behaviour,
 * biting with no skills and spending no energy, and vanishes when killed.
 */
export interface CritterTemplate {
  readonly name: string;
  readonly health: number;
  readonly armor: number;
  /** Its bite, as written: no attribute scales it. */
  readonly damageMin: number;
  readonly damageMax: number;
  readonly damageType: DamageType;
  readonly attackIntervalSeconds: number;
}

/** The rat (#3315): 120 health, armor 20, a 4–8 piercing bite every 1.5 s. */
export const RAT: CritterTemplate = {
  name: "Rat",
  health: 120,
  armor: 20,
  damageMin: 4,
  damageMax: 8,
  damageType: "piercing",
  attackIntervalSeconds: 1.5,
};

/**
 * A rat `id` of `team` at `position` on `layer`, facing `facing`, holding
 * its post as `behaviour` says, as `MatchSimulation.add` takes it.
 */
export function critterSpec(
  id: string,
  team: number,
  position: Vec2,
  layer: number,
  behaviour: Extract<Behaviour, { kind: "guard" }>,
  facing: number,
): ParticipantSpec {
  const unarmed = unarmedResolvedEquipment(RAT.armor);
  return {
    id,
    team,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: {
      ...unarmed,
      mainHand: {
        ...unarmed.mainHand,
        weapon: {
          ...unarmed.mainHand.weapon,
          damageMin: RAT.damageMin,
          damageMax: RAT.damageMax,
          damageType: RAT.damageType,
          attackIntervalSeconds: RAT.attackIntervalSeconds,
          range: RANGE_MELEE,
        },
        damageType: RAT.damageType,
        // Its bite as written, whatever its rank.
        creatureDamageScale: 1,
      },
    },
    spawn: position,
    layer,
    facing,
    maxHealth: RAT.health,
    maxEnergy: 0,
    baseEnergyPips: 0,
    behaviour,
    creature: {
      ownerId: undefined,
      kind: "critter",
      look: "rat",
      name: RAT.name,
      expiresInSeconds: Number.POSITIVE_INFINITY,
      ageSeconds: 0,
      summonedAtTick: 0,
      skillId: undefined,
      aura: undefined,
      onDeath: "vanish",
      ownerDisableSeconds: 0,
      deathBurst: undefined,
      onDeathInRange: undefined,
      pulse: undefined,
      replacedBy: undefined,
      corpsesLeft: 0,
      companionSkillId: undefined,
      leaderId: undefined,
      bondStatusId: undefined,
      mode: "guard",
    },
  };
}
