import { AREA_EARSHOT, AREA_IN_THE_AREA, AREA_NEARBY, RANGE_SPELL } from "../distances.js";
import { baseEnergyPipsFor } from "../equipment/armor.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, weaponDamageType } from "../equipment/weapons.js";
import { distance, type Vec2 } from "../vec2.js";
import { ALTAR_REACH_UNITS } from "./relics.js";
import type { Behaviour } from "./behaviour.js";
import type { ParticipantSpec } from "./simulation.js";

/**
 * Heroes' Ascent's Ghostly Hero (#1377, #2689, GW1): a team's NPC that
 * its players lead about, on every map with a `ghost-spawn`. Killing a
 * foe team's gives the killers' team a morale boost. Space on it, within a flag's reach, toggles it
 * between following that player and staying where it is. On the altar
 * it claims it by itself, through the simulation's cast path, so an
 * interrupt or a knockdown cuts the claim short. Dead, it rises at its
 * `ghost-spawn`, staying put (#2839): on a map with priests at the next
 * priest wave, only while its team's priest lives; in Capture Points at
 * the next wave of its base's shrine (#2845); where the objective needs
 * it, King of the Hill and Relic Run, `PRIEST_WAVE_SECONDS` after it
 * died; anywhere else, never.
 */

/** Where a team's Ghostly Hero starts and rises (#1377), from its map's `ghost-spawn`. */
export interface GhostSpawn {
  readonly team: number;
  readonly position: Vec2;
}

/**
 * A map's ghosts (#1377, #2689): one `ghost-spawn` per team, at its
 * `ghostLevel`, and King of the Hill's altar, `undefined` elsewhere.
 */
export interface GhostField {
  readonly level: GhostLevel;
  readonly altar: Vec2 | undefined;
  readonly spawns: readonly GhostSpawn[];
}

/** The skill a ghost claims the altar with: an `npcOnly` record, on no player's bar. */
export const CLAIM_SKILL_ID = "npc.claim-resource";
/** The wiki's "Ghostly Hero (Heroes' Ascent)": 640 Health (#2689). */
export const GHOST_HEALTH = 640;
export const GHOST_ARMOR = 60;
export const GHOST_ENERGY = 30;

/** Its axe skills (#2689): the wiki's bar less the bow's two. */
export const GHOST_AXE_SKILLS: readonly string[] = [
  "warrior.cyclone-axe",
  "warrior.disrupting-chop",
  "warrior.swift-chop",
];

/** Its bar: its axe skills, and the altar's claim. */
export const GHOST_SKILL_BAR: readonly string[] = [...GHOST_AXE_SKILLS, CLAIM_SKILL_ID];

/** The morale boost, in percent, for killing a foe team's ghost (#2689, GW1). */
export const GHOST_MORALE_BOOST = 10;

/** The levels a ghost comes at, by map (#2689): Underworld, Antechamber, Hall. */
export type GhostLevel = 20 | 24 | 28;

/** Its Axe Mastery at each level (#2689): the spec's 12, 14 and 16. */
export const GHOST_AXE_MASTERY: Readonly<Record<GhostLevel, number>> = { 20: 12, 24: 14, 28: 16 };

const AXE = WEAPONS.axe;

/** The id of `team`'s Ghostly Hero: no seat's id has a `/` in it. */
export function ghostId(team: number): string {
  return `ghost/${String(team)}`;
}

/** Whether `id` names a team's Ghostly Hero. */
export function isGhostId(id: string): boolean {
  return /^ghost\/\d+$/.test(id);
}

/** Whether a ghost at `position` stands near enough `altar` to claim it. */
export function onHill(altar: Vec2, position: Vec2): boolean {
  return distance(position, altar) <= ALTAR_REACH_UNITS;
}

/**
 * Following its creature's `leaderId`, as a minion follows its master: at its heel,
 * fighting what the leader attacks, else the nearest foe in earshot,
 * with its axe skills (#2689). A leader on or beside `altar`, if the
 * map has one, draws it onto the altar itself, so
 * leading it there is all a claim takes: its heel alone stops it short
 * of the altar's reach. On the altar it fights a foe adjacent to it,
 * and never steps off after one.
 */
export function followBehaviour(altar: Vec2 | undefined): Behaviour {
  return {
    kind: "follow-and-attack",
    drawnTo:
      altar === undefined
        ? undefined
        : {
            point: altar,
            withinUnits: ALTAR_REACH_UNITS + AREA_IN_THE_AREA,
            holdUnits: ALTAR_REACH_UNITS,
          },
    engage: "owner-target-then-nearest",
    skillIds: GHOST_AXE_SKILLS,
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

/**
 * `spawn`'s ghost at `level`, facing `facing`, staying at its spawn, as the
 * simulation adds it; it rises by itself `riseSeconds` after it died.
 */
export function ghostSpec(
  spawn: GhostSpawn,
  level: GhostLevel,
  facing: number,
  riseSeconds: number,
): ParticipantSpec {
  return {
    id: ghostId(spawn.team),
    team: spawn.team,
    skillBar: GHOST_SKILL_BAR,
    attributeRanks: new Map([["warrior.axe-mastery", GHOST_AXE_MASTERY[level]]]),
    equipment: {
      ...unarmedResolvedEquipment(GHOST_ARMOR),
      mainHand: {
        weapon: AXE,
        attributeId: "warrior.axe-mastery",
        damageType: weaponDamageType(AXE, "warrior.axe-mastery"),
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
    // It rises where it started (#1186); never by itself on infinity (#2839).
    reset: { kind: "on-death", afterSeconds: riseSeconds },
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
