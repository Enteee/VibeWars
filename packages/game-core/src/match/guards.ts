import { baseEnergyPipsFor, type ConditionalArmor } from "../equipment/armor.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, weaponDamageType, type Weapon } from "../equipment/weapons.js";
import type { ProfessionId } from "../professions.js";
import { getSkill } from "../skills/catalog.js";
import type { Vec2 } from "../vec2.js";
import type { ParticipantSpec } from "./simulation.js";

/**
 * A Guild Battle's base guards (#1223, GW1): a Bodyguard, two Knights and
 * an Archer in the lord room, a Footman and an Archer at each gate. Map
 * NPCs as the Guild Lord is: nobody owns them, they count for nobody and
 * never come back. Each holds its post as a `guard`, playing a bar of our
 * catalog's skills in place of GW1's monster skills.
 */

export const GUARD_ROLE_IDS = ["bodyguard", "knight", "archer", "footman"] as const;
export type GuardRole = (typeof GUARD_ROLE_IDS)[number];

/** One guard's post (#1223), from its map's `guard` objective. */
export interface BaseGuard {
  readonly team: number;
  readonly role: GuardRole;
  readonly position: Vec2;
}

interface GuardRoleSpec {
  readonly name: string;
  readonly profession: ProfessionId;
  readonly armor: number;
  /** GW1's "+20 vs physical" and the like, on every hit. */
  readonly conditionalArmor: readonly ConditionalArmor[];
  readonly weapon: Weapon;
  /** The weapon's attribute, at `GUARD_RANK`: a staff's picks its element. */
  readonly weaponAttributeId: string;
  readonly skillBar: readonly string[];
  readonly aggroUnits: number;
  readonly leashUnits: number;
}

export const GUARD_HEALTH = 480;
export const GUARD_ENERGY = 30;
/** Every guard's rank in its weapon's attribute and each of its skills'. */
export const GUARD_RANK = 12;

const VS_PHYSICAL: readonly ConditionalArmor[] = [
  { amount: 20, conditions: [{ kind: "vs-physical" }] },
];

/**
 * GW1's numbers per role. Knights leash far (GW1: "very easy to aggro and
 * lure out"); Archers barely leave their lookout.
 */
export const GUARD_ROLES: Readonly<Record<GuardRole, GuardRoleSpec>> = {
  bodyguard: {
    name: "Bodyguard",
    profession: "monk",
    armor: 60,
    conditionalArmor: [],
    weapon: WEAPONS.staff,
    weaponAttributeId: "elementalist.water-magic",
    skillBar: ["monk.heal-other"],
    aggroUnits: 600,
    leashUnits: 300,
  },
  knight: {
    name: "Knight",
    profession: "warrior",
    armor: 80,
    conditionalArmor: VS_PHYSICAL,
    weapon: WEAPONS.sword,
    weaponAttributeId: "warrior.swordsmanship",
    skillBar: ["warrior.sever-artery", "warrior.healing-signet", "warrior.watch-yourself"],
    aggroUnits: 600,
    leashUnits: 900,
  },
  archer: {
    name: "Archer",
    profession: "ranger",
    armor: 70,
    conditionalArmor: [{ amount: 30, conditions: [{ kind: "vs-elemental" }] }],
    weapon: WEAPONS.longbow,
    weaponAttributeId: "ranger.marksmanship",
    skillBar: ["ranger.pin-down", "ranger.troll-unguent"],
    aggroUnits: WEAPONS.longbow.range,
    leashUnits: 300,
  },
  footman: {
    name: "Footman",
    profession: "warrior",
    armor: 80,
    conditionalArmor: VS_PHYSICAL,
    weapon: WEAPONS.sword,
    weaponAttributeId: "warrior.swordsmanship",
    skillBar: ["warrior.sever-artery", "warrior.distracting-blow"],
    aggroUnits: 600,
    leashUnits: 600,
  },
};

/** The id of `team`'s guard `index`, in its map's order: no seat's id has a `/` in it. */
export function guardId(team: number, index: number): string {
  return `guard/${String(team)}/${String(index)}`;
}

/** `guard`, its team's `index`th, facing `facing`, as the simulation adds it. */
export function guardSpec(guard: BaseGuard, index: number, facing: number): ParticipantSpec {
  const role = GUARD_ROLES[guard.role];
  const attributes = [
    role.weaponAttributeId,
    ...role.skillBar.flatMap((id) => getSkill(id)?.attributeId ?? []),
  ];
  return {
    id: guardId(guard.team, index),
    team: guard.team,
    skillBar: [...role.skillBar],
    attributeRanks: new Map(attributes.map((attributeId) => [attributeId, GUARD_RANK])),
    equipment: {
      ...unarmedResolvedEquipment(role.armor),
      conditionalArmor: role.conditionalArmor,
      mainHand: {
        weapon: role.weapon,
        attributeId: role.weaponAttributeId,
        damageType: weaponDamageType(role.weapon, role.weaponAttributeId),
        requirementMet: true,
        creatureDamageScale: undefined,
      },
    },
    spawn: guard.position,
    facing,
    maxHealth: GUARD_HEALTH,
    maxEnergy: GUARD_ENERGY,
    baseEnergyPips: baseEnergyPipsFor(role.profession),
    behaviour: {
      kind: "guard",
      post: guard.position,
      aggroUnits: role.aggroUnits,
      leashUnits: role.leashUnits,
      rooted: false,
      thinkSeconds: 0.25,
    },
    creature: {
      ownerId: undefined,
      kind: "guard",
      look: "guard",
      name: role.name,
      expiresInSeconds: Number.POSITIVE_INFINITY,
      ageSeconds: 0,
      summonedAtTick: 0,
      skillId: undefined,
      aura: undefined,
      onDeath: "vanish",
      ownerDisableSeconds: 0,
      companionSkillId: undefined,
      mode: "guard",
    },
  };
}
