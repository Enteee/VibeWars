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
  replacedBy: undefined,
  leavesCorpses: undefined,
  onePerOwner: false,
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
  replacedBy: undefined,
  leavesCorpses: undefined,
  onePerOwner: false,
  onDeath: "vanish",
  ownerDisableOnDeath: undefined,
  deathBurst: undefined,
};

/** A minion of Death Magic (#1836): its level, Health and armor from 0 to 12 ranks. */
function deathMinion(
  look: CreatureTemplate["look"],
  name: string,
  health: readonly [number, number],
  armor: readonly [number, number],
  level: readonly [number, number],
  damage: readonly [number, number],
  damageType: "blunt" | "slashing",
  onHit: readonly OnHitEffect[],
): Omit<CreatureTemplate, "replacedBy" | "leavesCorpses" | "onePerOwner"> {
  return {
    kind: "minion",
    look,
    name,
    maxHealth: {
      scaling: { attributeId: "necromancer.death-magic", atZero: health[0], atTwelve: health[1] },
    },
    armor: {
      scaling: { attributeId: "necromancer.death-magic", atZero: armor[0], atTwelve: armor[1] },
    },
    attack: {
      attributeId: "necromancer.death-magic",
      damageMin: damage[0],
      damageMax: damage[1],
      scaling: { kind: "level", level: { atZero: level[0], atTwelve: level[1] } },
      damageType,
      attackIntervalSeconds: 3.1,
      range: RANGE_MELEE,
      projectileSpeed: undefined,
      onHit,
    },
    behaviour: MINION_BEHAVIOUR,
    aura: undefined,
    onDeath: "vanish",
    ownerDisableOnDeath: undefined,
    deathBurst: undefined,
  };
}

/*
 * Blood and Death Magic's other minions (#1836), from the wiki: level 1
 * to 14 (Flesh Golem 3 to 21, Jagged Horror 0 to 12) at Death Magic 0 to
 * 12, Health 80 + 20 per level, armor per the wiki's tables, a blow every
 * 3.10 s. Damage is the wiki's "vs. AR 60" at Death Magic 12, its maximum
 * a critical's, so ÷√2 (#1131). They wear the Bone Horror's look until
 * their art.
 */

/** Its owner gains the Health its blows take (#1836). */
export const VAMPIRIC_HORROR: CreatureTemplate = {
  ...deathMinion(
    "bone-horror",
    "Vampiric Horror",
    [100, 360],
    [9, 58],
    [1, 14],
    [12, 22],
    "blunt",
    [{ kind: "owner-gains-damage-dealt" }],
  ),
  replacedBy: undefined,
  leavesCorpses: undefined,
  onePerOwner: false,
};

/** One at a time; it leaves 1...4 corpses, 3 at Death Magic 12 (#1836). */
export const FLESH_GOLEM: CreatureTemplate = {
  ...deathMinion(
    "bone-horror",
    "Flesh Golem",
    [140, 500],
    [16, 84],
    [3, 21],
    [50, 74],
    "slashing",
    [],
  ),
  replacedBy: undefined,
  leavesCorpses: { scaling: { attributeId: "necromancer.death-magic", atZero: 1, atTwelve: 3.4 } },
  onePerOwner: true,
};

/** Each blow makes its foe bleed for 25 seconds (#1836); it is no one's replacement's. */
export const JAGGED_HORROR: CreatureTemplate = {
  ...deathMinion("bone-horror", "Jagged Horror", [80, 320], [5, 50], [0, 12], [8, 16], "blunt", [
    { kind: "apply-status", statusId: "bleeding", durationSeconds: 25 },
  ]),
  replacedBy: undefined,
  leavesCorpses: undefined,
  onePerOwner: false,
};

/** Its death stands a Jagged Horror up where it fell (#1836). */
export const SHAMBLING_HORROR: CreatureTemplate = {
  ...deathMinion(
    "bone-horror",
    "Shambling Horror",
    [100, 360],
    [9, 58],
    [1, 14],
    [11, 21],
    "slashing",
    [],
  ),
  replacedBy: { creature: JAGGED_HORROR, count: 1 },
  leavesCorpses: undefined,
  onePerOwner: false,
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
  replacedBy: undefined,
  leavesCorpses: undefined,
  onePerOwner: false,
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
    replacedBy: undefined,
    leavesCorpses: undefined,
    onePerOwner: false,
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
    replacedBy: undefined,
    leavesCorpses: undefined,
    onePerOwner: false,
    onDeath: "vanish",
    ownerDisableOnDeath: undefined,
    deathBurst: undefined,
  };
}
