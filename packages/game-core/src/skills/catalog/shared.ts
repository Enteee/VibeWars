import {
  AREA_EARSHOT,
  AREA_IN_THE_AREA,
  PET_REACH,
  RANGE_MELEE,
  RANGE_SPELL,
  RANGE_SPIRIT,
} from "../../distances.js";
import type { Behaviour } from "../../match/behaviour.js";
import type { StatusId } from "../status.js";
import type { CreatureTemplate, Magnitude, OnHitEffect } from "../types.js";

/** Longbow-ish range. */
export const RANGE_LONG = 520;

/**
 * What a minion does (#467): heel by its master, fight what its master
 * attacks within cast range of the master, else foes in earshot of
 * itself (#1118), back to heel past cast range. House numbers.
 */
export const MINION_BEHAVIOUR: Behaviour = {
  kind: "follow-and-attack",
  drawnTo: undefined,
  engage: "owner-target-then-nearest",
  aggroUnits: AREA_EARSHOT,
  leashUnits: RANGE_SPELL,
  heelUnits: AREA_IN_THE_AREA,
};

/**
 * Level 0...10 at Death Magic 0...12. Health 80 + 20 per level and armor
 * about 3 per level (fandom "Health", "Bone Minion"); a blow every 3.10 s
 * (GWW "Bone Minion"). 6-11 is GWW's 6-15 against armor 60 at Death
 * Magic 12, its maximum a critical's, so ÷√2 (#1131).
 */
export const BONE_MINION: CreatureTemplate = {
  kind: "minion",
  look: "bone-minion",
  name: "Bone Minion",
  maxHealth: { scaling: { attributeId: "necromancer.death-magic", atZero: 80, atTwelve: 280 } },
  armor: { scaling: { attributeId: "necromancer.death-magic", atZero: 0, atTwelve: 30 } },
  attack: {
    attributeId: "necromancer.death-magic",
    damageMin: 6,
    damageMax: 11,
    scaling: { kind: "level", level: { atZero: 0, atTwelve: 10 } },
    damageType: "blunt",
    attackIntervalSeconds: 3.1,
    range: RANGE_MELEE,
    projectileSpeed: undefined,
    onHit: [],
  },
  behaviour: MINION_BEHAVIOUR,
  aura: undefined,
  onDeath: "vanish",
  ownerDisableOnDeath: undefined,
  deathBurst: undefined,
};

/**
 * Level 1...14 at Death Magic 0...12. Health 80 + 20 per level and armor
 * 4 per level (fandom "Bone Horror"); a blow every 3.10 s (GWW "Bone
 * Horror"). 12-24 is GWW's 12-34 against armor 60 at Death Magic 12, its
 * maximum a critical's, so ÷√2 (#1131).
 */
export const BONE_HORROR: CreatureTemplate = {
  kind: "minion",
  look: "bone-horror",
  name: "Bone Horror",
  maxHealth: { scaling: { attributeId: "necromancer.death-magic", atZero: 100, atTwelve: 360 } },
  armor: { scaling: { attributeId: "necromancer.death-magic", atZero: 4, atTwelve: 56 } },
  attack: {
    attributeId: "necromancer.death-magic",
    damageMin: 12,
    damageMax: 24,
    scaling: { kind: "level", level: { atZero: 1, atTwelve: 14 } },
    damageType: "blunt",
    attackIntervalSeconds: 3.1,
    range: RANGE_MELEE,
    projectileSpeed: undefined,
    onHit: [],
  },
  behaviour: MINION_BEHAVIOUR,
  aura: undefined,
  onDeath: "vanish",
  ownerDisableOnDeath: undefined,
  deathBurst: undefined,
};

/**
 * What a pet does (#1046): heel by its owner, go for whatever its owner is
 * attacking within twice earshot of itself, back to heel past that.
 */
export const PET_BEHAVIOUR: Behaviour = {
  kind: "follow-and-attack",
  drawnTo: undefined,
  engage: "owner-target",
  aggroUnits: PET_REACH,
  leashUnits: PET_REACH,
  heelUnits: AREA_IN_THE_AREA,
};

/**
 * GW1's PvP pet, a level-20 Elder Wolf (fandom "Wolf"). Health = level ×
 * 20 + 80 and armor = level × 3 + 20 (fandom "Animal companion"),
 * whatever its owner's attributes. "With the critical hits removed, the
 * base damage is 17-29" at Beast Mastery 12 against armor 60, "one attack
 * every 2.15 seconds"; wolves deal slashing damage. Its death disables
 * its owner's bar "between 10 and 3 seconds based on the owner's Beast
 * Mastery" (fandom "Beast Mastery"): 10...4 is linear and unverified.
 */
export const WOLF: CreatureTemplate = {
  kind: "pet",
  look: "beast",
  name: "Wolf",
  maxHealth: { flat: 480 },
  armor: { flat: 80 },
  attack: {
    attributeId: "ranger.beast-mastery",
    damageMin: 17,
    damageMax: 29,
    scaling: { kind: "weapon-mastery" },
    damageType: "slashing",
    attackIntervalSeconds: 2.15,
    range: RANGE_MELEE,
    projectileSpeed: undefined,
    onHit: [],
  },
  behaviour: PET_BEHAVIOUR,
  aura: undefined,
  onDeath: "lie",
  ownerDisableOnDeath: {
    scaling: { attributeId: "ranger.beast-mastery", atZero: 10, atTwelve: 4 },
  },
  deathBurst: undefined,
};

/** A spirit's shot, world units per second: a wand's (house tuning). */
export const SPIRIT_SHOT_SPEED = 900;

/**
 * A binding ritual's attacking spirit (#1239), as Pain: it stands where
 * it was made and shoots the nearest foe within spirit range, a blow
 * every 2 s (house tuning: GW1 publishes none) for its stated damage,
 * linear in `attributeId` (#1550), Communing for most. A level-L spirit
 * has 50 + 20 per L Health; armor 51, as every other spirit's.
 */
export function attackingSpirit(
  name: string,
  attributeId: string,
  healthAtTwelve: number,
  durationSeconds: Magnitude,
  damage: { readonly atZero: number; readonly atTwelve: number },
  onHit: readonly OnHitEffect[],
): CreatureTemplate {
  return {
    kind: "spirit",
    look: "spirit",
    name,
    maxHealth: { scaling: { attributeId, atZero: 70, atTwelve: healthAtTwelve } },
    armor: { flat: 51 },
    attack: {
      attributeId,
      damageMin: damage.atTwelve,
      damageMax: damage.atTwelve,
      scaling: { kind: "rank", atZero: damage.atZero },
      // GW1 names no damage type for a spirit's attack.
      damageType: "piercing",
      attackIntervalSeconds: 2,
      range: RANGE_SPIRIT,
      projectileSpeed: SPIRIT_SHOT_SPEED,
      onHit,
    },
    durationSeconds,
    behaviour: { kind: "auto-attack", targeting: { kind: "nearest-enemy" }, reach: RANGE_SPIRIT },
    aura: undefined,
    onDeath: "vanish",
    ownerDisableOnDeath: undefined,
    deathBurst: undefined,
  };
}

/**
 * A protective spirit (#1265): it attacks nothing and projects `statusId`
 * on whoever `affects` in its range, paying for every outcome it
 * changes with its own health. Health from its level, as Recuperation's:
 * 50 + 20 per level, armor 51; both linear in `attributeId` (#1550).
 */
export function protectiveSpirit(
  name: string,
  attributeId: string,
  healthAtTwelve: number,
  duration: { readonly atZero: number; readonly atTwelve: number },
  statusId: StatusId,
  affects: "allies" | "foes",
): CreatureTemplate {
  return {
    kind: "spirit",
    look: "spirit",
    name,
    maxHealth: { scaling: { attributeId, atZero: 70, atTwelve: healthAtTwelve } },
    armor: { flat: 51 },
    attack: undefined,
    durationSeconds: { scaling: { attributeId, ...duration } },
    behaviour: { kind: "idle" },
    aura: { statusId, affects, radius: RANGE_SPIRIT },
    onDeath: "vanish",
    ownerDisableOnDeath: undefined,
    deathBurst: undefined,
  };
}
