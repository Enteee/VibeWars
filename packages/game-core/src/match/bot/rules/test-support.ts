import type { PlayerBuild } from "../../../build.js";
import { resolveLoadout, unarmedResolvedEquipment } from "../../../equipment/resolve.js";
import { loadoutOf } from "../../../join-loadout.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../../../ruleset.js";
import { getSkill } from "../../../skills/catalog.js";
import { STARTER_BUILDS } from "../../../starter-builds.js";
import { type Vec2 } from "../../../vec2.js";
import { createCursor, decide, type Behaviour } from "../../behaviour.js";
import { MatchSimulation, loadoutSpec, type ParticipantSpec } from "../../simulation.js";
import { botUses } from "../skill-intent.js";

export const RULESET = MINIMAL_GW_INSPIRED_PVP_V1;
export const DT = 1 / RULESET.tickRateHz;
/** A field with edges, as every map has. */
export const BOUNDS = { width: 1600, height: 800 };
export const BOT: Behaviour = { kind: "play-build", thinkSeconds: 0.25 };

export function starter(name: string): PlayerBuild {
  const build = STARTER_BUILDS.find((candidate) => candidate.name === name);
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
    baseEnergyPips: loadout.baseEnergyPips,
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

/** What the bot `id` would do now, with every skill allowed. */
export function askBot(sim: MatchSimulation, id: string) {
  const self = sim.get(id);
  if (self === undefined) throw new Error(`no ${id}`);
  return decide(BOT, createCursor(), {
    self,
    participants: [...sim.participants()],
    dt: DT,
    stepUnits: 1,
    check: () => ({ ok: true }),
    isBot: () => true,
    calledTargetId: undefined,
    sees: () => true,
  });
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
