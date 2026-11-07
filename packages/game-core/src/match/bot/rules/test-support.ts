import type { PlayerBuild } from "../../../build.js";
import { resolveLoadout, unarmedResolvedEquipment } from "../../../equipment/resolve.js";
import { loadoutOf } from "../../../join-loadout.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../../../ruleset.js";
import { getSkill } from "../../../skills/catalog.js";
import { STARTER_BUILDS } from "../../../starter-builds.js";
import { STARTER_TEAMS } from "../../../starter-teams.js";
import { TEST_BUILDS } from "../../../testing.js";
import { add, scale, ZERO, type Vec2 } from "../../../vec2.js";
import {
  createCursor,
  decide,
  NO_OBJECTIVES,
  type Behaviour,
  type BehaviourContext,
} from "../../behaviour.js";
import {
  MatchSimulation,
  loadoutSpec,
  type Participant,
  type ParticipantSpec,
} from "../../simulation.js";
import { botRole, roleOf } from "../role.js";
import { botUses } from "../skill-intent.js";
import { NOTHING, foeReach, skillsOf } from "./shared.js";
import type { RuleContext } from "./types.js";

export const RULESET = MINIMAL_GW_INSPIRED_PVP_V1;
export const DT = 1 / RULESET.tickRateHz;
/** A field with edges, as every map has. */
export const BOUNDS = { width: 1600, height: 800 };
/** The match seed `contextFor` gives a bot's rolls (#2624). */
export const CONTEXT_SEED = 0;
/** A bot that holds each decision a steady 0.25 s, so the rules' tests time alike. */
export const BOT: Behaviour = {
  kind: "play-build",
  reaction: { minSeconds: 0.25, maxSeconds: 0.25 },
};

/** A build by name: a PvX one, a starter team member's, or a test build ("Warrior/Monk"). */
export function starter(name: string): PlayerBuild {
  const build = [
    ...STARTER_BUILDS,
    ...STARTER_TEAMS.flatMap((team) => team.members.map((member) => member.build)),
    ...TEST_BUILDS,
  ].find((candidate) => candidate.name === name);
  if (build === undefined) throw new Error(`no starter build ${name}`);
  return build;
}

export const WARRIOR = starter("Warrior/Monk");
export const RANGER = starter("Ranger/Mesmer");
export const MONK = starter("Monk/Elementalist");
export const ELEMENTALIST = starter("Elementalist/Mesmer");

/** A fighter playing `build`, a bot unless `behaviour` is `undefined`. */
export function fighter(
  id: string,
  team: number,
  build: PlayerBuild,
  spawn: Vec2,
  extra: Partial<ParticipantSpec> = {},
): ParticipantSpec {
  const loadout = loadoutOf(build);
  const resolved = resolveLoadout(
    {
      primaryProfession: loadout.primaryProfession,
      secondaryProfession: loadout.secondaryProfession,
      allocatedRanks: loadout.attributeRanks,
      equipment: loadout.equipment,
    },
    RULESET.combat,
  );
  return {
    id,
    team,
    skillBar: loadout.skillBar,
    ...loadoutSpec(resolved),
    spawn,
    facing: 0,
    behaviour: BOT,
    ...extra,
  };
}

export function match(participants: readonly ParticipantSpec[], seed = "bot"): MatchSimulation {
  return new MatchSimulation({ seed, ruleset: RULESET, bounds: BOUNDS, participants });
}

/** Every skill `id` used, in order, over `seconds`. */
export function skillsUsed(sim: MatchSimulation, id: string, seconds: number): string[] {
  const used: string[] = [];
  for (let t = 0; t < seconds; t += DT) {
    for (const entry of sim.step(DT).log) {
      if (entry.sourceId === id && entry.skillId !== undefined) used.push(entry.skillId);
    }
  }
  return used;
}

export function slotOf(build: PlayerBuild, skillId: string): number {
  return build.skillBar.indexOf(skillId);
}

/**
 * What the bot `id` would do now, with every skill allowed, playing for
 * `objectives`, everyone a bot unless `isBot` says not.
 */
export function askBot(
  sim: MatchSimulation,
  id: string,
  objectives = NO_OBJECTIVES,
  isBot: (participantId: string) => boolean = () => true,
) {
  return decide(BOT, createCursor(), contextFor(sim, id, { objectives, isBot }));
}

/** The bot `id`'s view, as the simulation gives it, with every skill allowed and nothing in the way. */
export function contextFor(
  sim: MatchSimulation,
  id: string,
  extra: Partial<BehaviourContext> = {},
): BehaviourContext {
  const self = sim.get(id);
  if (self === undefined) throw new Error(`no ${id}`);
  const participants = [...sim.participants()];
  const team = self.combatant.team;
  return {
    self,
    participants,
    dt: DT,
    stepUnits: 1,
    check: () => ({ ok: true }),
    isBot: () => true,
    calledTargetId: undefined,
    sees: () => true,
    seesBetween: () => true,
    walkable: () => true,
    foeCentroid: centroidOf(participants, (other) => other.combatant.team !== team),
    objectives: NO_OBJECTIVES,
    projectiles: sim.projectiles,
    seed: CONTEXT_SEED,
    ...extra,
  };
}

/** Where the living players `accept` takes stand on average; none: `undefined`. */
function centroidOf(
  participants: readonly Participant[],
  accept: (other: Participant) => boolean,
): Vec2 | undefined {
  const bodies = participants.filter(
    (other) => !other.combatant.dead && other.creature === undefined && accept(other),
  );
  if (bodies.length === 0) return undefined;
  const sum = bodies.reduce((total, { position }) => add(total, position), ZERO);
  return scale(sum, 1 / bodies.length);
}

/**
 * One rule's view of the bot `id` (#2545): its living foes and team, its
 * role from its bar, no target, every skill allowed.
 */
export function ruleFor(
  sim: MatchSimulation,
  id: string,
  extra: Partial<RuleContext> = {},
  context: Partial<BehaviourContext> = {},
): RuleContext {
  const view = contextFor(sim, id, context);
  const self = view.self;
  const bar = skillsOf(self);
  const living = view.participants.filter((other) => !other.combatant.dead);
  const reaches = new Map<string, number>();
  return {
    context: view,
    self,
    bar,
    foes: living.filter((other) => other.combatant.team !== self.combatant.team),
    allies: living.filter(
      (other) => other.combatant.team === self.combatant.team && other.creature === undefined,
    ),
    targetId: undefined,
    nearestFirst: (bodies) => [...bodies],
    mayUse: () => true,
    use: (skill, targetId) => ({ ...NOTHING, targetId, useSkillId: skill.id }),
    mayEndUpkeep: true,
    role: botRole(bar, self.combatant.equipment.mainHand.weapon.range),
    spikeHold: true,
    foeCentroid: view.foeCentroid,
    roleOf,
    cursor: createCursor(),
    foeReach: (foe) => foeReach(reaches, foe),
    ...extra,
  };
}

export function uses(skillId: string | undefined) {
  const skill = skillId === undefined ? undefined : getSkill(skillId);
  return skill === undefined ? [] : botUses(skill);
}

/** A bare body with no build, a bot only with `behaviour` in `extra`. */
export const body = (id: string, team: number, spawn: Vec2, extra: Partial<ParticipantSpec> = {}) =>
  ({
    id,
    team,
    skillBar: [],
    attributeRanks: new Map([
      ["assassin.shadow-arts", 12],
      ["ritualist.spawning-power", 12],
    ]),
    equipment: unarmedResolvedEquipment(60),
    maxHealth: 600,
    maxEnergy: 60,
    spawn,
    facing: 0,
    ...extra,
  }) satisfies ParticipantSpec;
