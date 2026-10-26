import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { applyEffects } from "../skills/effects.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const ORISON = "monk.orison-of-healing";

/** A monk with Orison of Healing in slot 0 and this much Divine Favor. */
function monk(id: string, divineFavor: number, spawn: Vec2 = vec2(0, 0)): ParticipantSpec {
  return {
    id,
    team: 0,
    skillBar: [ORISON],
    attributeRanks: new Map([["monk.divine-favor", divineFavor]]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 1000,
    spawn,
    facing: 0,
  };
}

/** A hurt bystander on `team`. */
function bystander(id: string, team: number, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 1000,
    spawn,
    facing: 0,
  };
}

function get(match: MatchSimulation, id: string) {
  const found = match.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function stepFor(match: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...match.step(DT).log);
  }
  return log;
}

/** Every heal Orison's cast logged on `targetId`, in order. */
function orisonHeals(log: readonly CombatLogEntry[], targetId: string): number[] {
  return log
    .filter((entry) => entry.skillId === ORISON)
    .flatMap((entry) => entry.events)
    .flatMap((event) =>
      event.kind === "heal" && event.targetId === targetId ? [event.amount] : [],
    );
}

/** Monk `m` with `divineFavor` casts Orison on `targetId`, both hurt to 100. */
function castOrison(divineFavor: number, targetId: "m" | "ally"): CombatLogEntry[] {
  const match = new MatchSimulation({
    seed: "divine-favor",
    participants: [monk("m", divineFavor), bystander("ally", 0, vec2(100, 0))],
  });
  get(match, "m").combatant.health = 100;
  get(match, "ally").combatant.health = 100;
  match.setTarget("m", targetId);
  expect(match.requestSkill("m", 0)?.check).toEqual({ ok: true });
  return stepFor(match, 1.5);
}

describe("Divine Favor (#529)", () => {
  it("adds floor(3.2 × rank) to an Orison on an ally: +38 at rank 12, after the spell's own heal", () => {
    const plain = orisonHeals(castOrison(0, "ally"), "ally");
    const favored = orisonHeals(castOrison(12, "ally"), "ally");
    expect(plain).toHaveLength(1);
    expect(favored).toEqual([...plain, 38]);
  });

  it("counts the caster as an ally", () => {
    expect(orisonHeals(castOrison(12, "m"), "m").slice(1)).toEqual([38]);
  });

  it("an interrupted Orison heals nothing, the bonus included", () => {
    const match = new MatchSimulation({
      seed: "divine-favor",
      participants: [monk("m", 12), bystander("ally", 0, vec2(100, 0))],
    });
    get(match, "ally").combatant.health = 100;
    match.setTarget("m", "ally");
    match.requestSkill("m", 0);
    const log = [...match.step(DT).log];
    const caster = get(match, "m").combatant;
    applyEffects([{ kind: "interrupt" }], {
      caster: get(match, "ally").combatant,
      target: caster,
      rng: createRng(529),
      rules: RULES.combat,
    });
    log.push(...stepFor(match, 1.5));
    expect(orisonHeals(log, "ally")).toEqual([]);
  });
});
