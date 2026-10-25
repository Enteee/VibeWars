import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type WeaponId } from "../equipment/weapons.js";
import type { MissingMechanic } from "../skills/coverage.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { Behaviour } from "./behaviour.js";
import { facingToward } from "./facing.js";
import type { ParticipantSpec } from "./simulation.js";

/**
 * The training scenarios (#2 Phase 5), as data.
 *
 * Each one sets up a fight that teaches one thing, against dummies that
 * play by exactly the player's rules (`behaviour.ts`). The editor lists
 * them, and the training arena builds them with `scenarioParticipants`.
 *
 * `mapId` is a string on purpose: `game-core` never imports `game-maps`.
 * Whoever runs a scenario resolves the geometry and the player's spawn.
 *
 * Only scenarios the simulation can run honestly exist. A scenario that
 * would teach a mechanic `coverage.ts` still lists as missing would teach
 * something false, and `training-scenarios.test.ts` refuses it.
 */

/**
 * What a scenario exercises. Every missing mechanic is in the union too:
 * claiming one compiles, and the gate test then fails and says why.
 */
export type TrainingMechanic =
  "spell-damage" | "armor" | "interrupts" | "auto-attacks" | "dodging" | MissingMechanic;

/** One setting a scenario offers, generated into the editor's sub-controls. */
export interface TrainingKnob {
  readonly id: string;
  readonly label: string;
  readonly kind: "count" | "toggle" | "rank";
  readonly min: number;
  readonly max: number;
  readonly default: number;
}

export interface TrainingDummy {
  readonly id: string;
  readonly label: string;
  readonly team: number;
  readonly position: Vec2;
  /** Base armor, before any status. */
  readonly armor: number;
  /** 10000 is "immortal": there is no invulnerable flag. */
  readonly maxHealth: number;
  readonly skillBar: readonly string[];
  readonly attributeRanks: Readonly<Record<string, number>>;
  readonly behaviour: Behaviour;
  /**
   * What it carries (#162). A weapon whose attribute is fixed, scaling
   * with that attribute's rank in `attributeRanks`. Without one it is
   * unarmed.
   */
  readonly weapon?: WeaponId;
}

export interface TrainingScenario {
  readonly id: string;
  readonly label: string;
  /** One sentence: what the player should come away knowing. */
  readonly teaches: string;
  readonly mapId: string;
  readonly exercises: readonly TrainingMechanic[];
  readonly knobs: readonly TrainingKnob[];
  readonly dummies: readonly TrainingDummy[];
}

/** The player's team. Dummies on any other team are enemies. */
export const PLAYER_TEAM = 0;

const IMMORTAL = 10000;
const IDLE: Behaviour = { kind: "idle" };

/** An idle, immortal enemy with nothing on its bar. */
function target(id: string, label: string, position: Vec2, armor: number): TrainingDummy {
  return {
    id,
    label,
    team: 1,
    position,
    armor,
    maxHealth: IMMORTAL,
    skillBar: [],
    attributeRanks: {},
    behaviour: IDLE,
  };
}

/** A dummy's gear: its armor, and its weapon if it has one. */
function dummyEquipment(dummy: TrainingDummy): ResolvedEquipment {
  const unarmed = unarmedResolvedEquipment(dummy.armor);
  if (dummy.weapon === undefined) {
    return unarmed;
  }
  const weapon = WEAPONS[dummy.weapon];
  const { requirement } = weapon;
  const attributeId = requirement.kind === "fixed" ? requirement.attributeId : undefined;
  return {
    ...unarmed,
    mainHand: {
      weapon,
      attributeId,
      requirementMet:
        attributeId === undefined || (dummy.attributeRanks[attributeId] ?? 0) >= requirement.rank,
    },
  };
}

export const TRAINING_SCENARIOS: readonly TrainingScenario[] = [
  {
    id: "target-dummy",
    label: "Target dummy",
    teaches: "What one cast actually does: at 60 armor, the tooltip's number exactly.",
    mapId: "training-hall",
    exercises: ["spell-damage"],
    knobs: [],
    dummies: [target("dummy", "Caster dummy (60 armor)", vec2(380, 210), 60)],
  },
  {
    id: "armor-ladder",
    label: "Armor ladder",
    teaches: "The mitigation curve: the same hit against 40 to 104 armor, side by side.",
    mapId: "training-hall",
    exercises: ["spell-damage", "armor"],
    knobs: [],
    // Two columns, every one inside spell range of the player's spawn at
    // (100, 210), and at least 100 apart: wider than Fireball's splash
    // (AREA_NEARBY), so each rung takes its own hit and nobody else's.
    // The armor is set directly: the ladder measures the curve, not the
    // weakness and wards that reach it.
    dummies: [
      target("armor-40", "Weakened caster (40)", vec2(360, 90), 40),
      target("armor-60", "Caster (60)", vec2(360, 210), 60),
      target("armor-70", "Ranger (70)", vec2(360, 330), 70),
      target("armor-80", "Warrior (80)", vec2(460, 90), 80),
      target("armor-84", "Warded caster (84)", vec2(460, 210), 84),
      target("armor-104", "Warded warrior (104)", vec2(460, 330), 104),
    ],
  },
  {
    id: "interrupt-timing",
    label: "Interrupt timing",
    teaches: "That an interrupt is a timing skill: catch a 3 second cast before it lands.",
    mapId: "training-hall",
    exercises: ["interrupts"],
    knobs: [],
    dummies: [
      {
        id: "unguent",
        label: "Troll Unguent dummy",
        team: 1,
        position: vec2(380, 210),
        armor: 60,
        maxHealth: IMMORTAL,
        skillBar: ["ranger.troll-unguent"],
        attributeRanks: { "ranger.wilderness-survival": 12 },
        behaviour: {
          kind: "cast-loop",
          skillIds: ["ranger.troll-unguent"],
          targeting: { kind: "self" },
          gapSeconds: 0,
          firstLegal: true,
        },
      },
    ],
  },
  {
    id: "weapon-dps",
    label: "Weapon DPS",
    teaches: "What your weapon does per second: press Space and read the weapon row.",
    mapId: "training-hall",
    exercises: ["auto-attacks"],
    knobs: [],
    // One in melee reach of the spawn at (100, 210), bodies just apart,
    // and one out at bow range, inside even a shortbow's reach.
    dummies: [
      target("melee", "Melee dummy (60 armor)", vec2(136, 210), 60),
      target("ranged", "Bow-range dummy (60 armor)", vec2(480, 210), 60),
    ],
  },
  {
    id: "dodge-drill",
    label: "Dodge drill",
    teaches: "That an arrow lands where you would have been: turn after it leaves the bow.",
    mapId: "training-hall",
    exercises: ["dodging"],
    knobs: [],
    dummies: [
      {
        id: "archer",
        label: "Longbow dummy",
        team: 1,
        position: vec2(500, 210),
        armor: 60,
        maxHealth: IMMORTAL,
        skillBar: [],
        attributeRanks: { "ranger.marksmanship": 12 },
        behaviour: { kind: "auto-attack", targeting: { kind: "nearest-enemy" } },
        weapon: "longbow",
      },
    ],
  },
];

export function getTrainingScenario(id: string): TrainingScenario | undefined {
  return TRAINING_SCENARIOS.find((scenario) => scenario.id === id);
}

/** A scenario's dummies, ready to add to a `MatchSimulation`, each facing the player at `playerSpawn`. */
export function scenarioParticipants(
  scenario: TrainingScenario,
  playerSpawn: Vec2,
): ParticipantSpec[] {
  return scenario.dummies.map((dummy) => ({
    id: dummy.id,
    team: dummy.team,
    skillBar: dummy.skillBar,
    attributeRanks: new Map(Object.entries(dummy.attributeRanks)),
    equipment: dummyEquipment(dummy),
    spawn: dummy.position,
    facing: facingToward(dummy.position, playerSpawn),
    maxHealth: dummy.maxHealth,
    behaviour: dummy.behaviour,
  }));
}
