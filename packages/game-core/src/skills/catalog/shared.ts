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
 * A minion of Death Magic (#1836): GW1's `level a...b`, its level at ranks 0
 * and 15, gives the level at 12 unrounded, a + 0.8 (b − a), so every rank
 * lands on GW1's table (#1899). Health is 80 + 20 per whole level, and armor
 * `armor.atZero` plus `armor.perLevel` for each level it gains.
 * Its blows scale on the unrounded level.
 */
function deathMinion(
  look: CreatureTemplate["look"],
  name: string,
  level: readonly [atZero: number, atFifteen: number],
  armor: { readonly atZero: number; readonly perLevel: number },
  damage: readonly [number, number],
  damageType: "blunt" | "slashing",
  onHit: readonly OnHitEffect[],
): Omit<CreatureTemplate, "replacedBy" | "leavesCorpses" | "onePerOwner"> {
  const [levelAtZero, levelAtFifteen] = level;
  const levelScaling = {
    attributeId: "necromancer.death-magic",
    atZero: levelAtZero,
    atTwelve: levelAtZero + 0.8 * (levelAtFifteen - levelAtZero),
  };
  return {
    kind: "minion",
    look,
    name,
    maxHealth: { byLevel: { level: levelScaling, atLevelZero: 80, perLevel: 20 } },
    armor: {
      byLevel: {
        level: levelScaling,
        atLevelZero: armor.atZero - armor.perLevel * levelAtZero,
        perLevel: armor.perLevel,
      },
    },
    attack: {
      attributeId: "necromancer.death-magic",
      damageMin: damage[0],
      damageMax: damage[1],
      scaling: {
        kind: "level",
        level: { atZero: levelScaling.atZero, atTwelve: levelScaling.atTwelve },
      },
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
    onDeathInRange: undefined,
  };
}

/**
 * Level 0...12. Armor about 3 per level (fandom "Health", "Bone Minion");
 * a blow every 3.10 s (GWW "Bone Minion"). 6-11 is GWW's 6-15 against
 * armor 60 at Death Magic 12, its maximum a critical's, so ÷√2 (#1131).
 */
export const BONE_MINION: CreatureTemplate = {
  ...deathMinion(
    "bone-minion",
    "Bone Minion",
    [0, 12],
    { atZero: 0, perLevel: 3 },
    [6, 11],
    "blunt",
    [],
  ),
  replacedBy: undefined,
  leavesCorpses: undefined,
  onePerOwner: false,
};

/**
 * Level 1...17. Armor 4 per level (fandom "Bone Horror"); a blow every
 * 3.10 s (GWW "Bone Horror"). 12-24 is GWW's 12-34 against armor 60 at
 * Death Magic 12, its maximum a critical's, so ÷√2 (#1131).
 */
export const BONE_HORROR: CreatureTemplate = {
  ...deathMinion(
    "bone-horror",
    "Bone Horror",
    [1, 17],
    { atZero: 4, perLevel: 4 },
    [12, 24],
    "blunt",
    [],
  ),
  replacedBy: undefined,
  leavesCorpses: undefined,
  onePerOwner: false,
};

/*
 * Blood and Death Magic's other minions (#1836), level 1...17 (Flesh Golem 3...25,
 * Jagged Horror 0...15), armor per the wiki's tables, a blow every
 * 3.10 s. Damage is the wiki's "vs. AR 60" at Death Magic 12, its maximum
 * a critical's, so ÷√2 (#1131). They wear the Bone Horror's look until
 * their art.
 */

/** Its owner gains the Health its blows take (#1836). */
export const VAMPIRIC_HORROR: CreatureTemplate = {
  ...deathMinion(
    "vampiric-horror",
    "Vampiric Horror",
    [1, 17],
    { atZero: 9, perLevel: 49 / 13 },
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
    "flesh-golem",
    "Flesh Golem",
    [3, 25],
    { atZero: 16, perLevel: 68 / 18 },
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
  ...deathMinion(
    "jagged-horror",
    "Jagged Horror",
    [0, 15],
    { atZero: 5, perLevel: 3.75 },
    [8, 16],
    "blunt",
    [{ kind: "apply-status", statusId: "bleeding", durationSeconds: { flat: 25 } }],
  ),
  replacedBy: undefined,
  leavesCorpses: undefined,
  onePerOwner: false,
};

/** Its death stands a Jagged Horror up where it fell (#1836). */
export const SHAMBLING_HORROR: CreatureTemplate = {
  ...deathMinion(
    "shambling-horror",
    "Shambling Horror",
    [1, 17],
    { atZero: 9, perLevel: 49 / 13 },
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
  onDeathInRange: undefined,
};

/**
 * A spirit's Health (#1917): GW1's "level a...b spirit", its level at ranks
 * 0 and 15, gives the level at 12 unrounded, a + 0.8 (b − a), so the level
 * is whole at every rank, and Health 50 + 20 per level.
 */
export function spiritHealth(
  attributeId: string,
  [atZero, atFifteen]: readonly [atZero: number, atFifteen: number],
): Magnitude {
  return {
    byLevel: {
      level: { attributeId, atZero, atTwelve: atZero + 0.8 * (atFifteen - atZero) },
      atLevelZero: 50,
      perLevel: 20,
    },
  };
}

/** A spirit's shot, world units per second: a wand's (house tuning). */
export const SPIRIT_SHOT_SPEED = 900;

/**
 * A binding ritual's attacking spirit (#1239), as Pain: it stands where
 * it was made and shoots the nearest foe within spirit range, a blow
 * every 2 s (house tuning: GW1 publishes none) for its stated damage,
 * linear in `attributeId` (#1550), Communing for most. Health from its
 * `levels` (#1917); armor 51, as every other spirit's.
 */
export function attackingSpirit(
  name: string,
  attributeId: string,
  levels: readonly [atZero: number, atFifteen: number],
  durationSeconds: Magnitude,
  damage: { readonly atZero: number; readonly atTwelve: number },
  onHit: readonly OnHitEffect[],
): CreatureTemplate {
  return {
    kind: "spirit",
    look: "spirit",
    name,
    maxHealth: spiritHealth(attributeId, levels),
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
    onDeathInRange: undefined,
  };
}

/**
 * A protective spirit (#1265): it attacks nothing and projects `statusId`
 * on whoever `affects` in its range, paying for every outcome it
 * changes with its own health. Health from its `levels` (#1917), armor
 * 51; its duration linear in `attributeId` (#1550).
 */
export function protectiveSpirit(
  name: string,
  attributeId: string,
  levels: readonly [atZero: number, atFifteen: number],
  duration: { readonly atZero: number; readonly atTwelve: number },
  statusId: StatusId,
  affects: "allies" | "foes",
): CreatureTemplate {
  return {
    kind: "spirit",
    look: "spirit",
    name,
    maxHealth: spiritHealth(attributeId, levels),
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
    onDeathInRange: undefined,
  };
}
