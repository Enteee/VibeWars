import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import type { MatchRules } from "../match-rules.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { payCost } from "../skills/activation.js";
import { getSkill } from "../skills/catalog.js";
import { describeSkill } from "../skills/describe.js";
import { gainEnergy } from "../skills/effects.js";
import { addOvercast, effectiveMaxEnergy } from "../skills/overcast.js";
import { makeCombatant } from "../skills/testing.js";
import type { Skill } from "../skills/types.js";
import { vec2, type Vec2 } from "../vec2.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const CHAIN_LIGHTNING = "elementalist.chain-lightning";
const MATCH: MatchRules = {
  scoreToWin: 99,
  timeLimitSeconds: 600,
  deathRule: "respawn",
  respawnSeconds: 8,
  deathPenalty: false,
};

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`no skill ${id}`);
  }
  return found;
}

function elementalist(spawn: Vec2, baseEnergyPips = 0): ParticipantSpec {
  return {
    id: "e",
    team: 0,
    skillBar: [CHAIN_LIGHTNING],
    attributeRanks: new Map([["elementalist.air-magic", 12]]),
    equipment: unarmedResolvedEquipment(60),
    maxEnergy: 30,
    baseEnergyPips,
    spawn,
    facing: 0,
  };
}

function foe(id: string, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team: 1,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(60),
    maxHealth: 1e6,
    spawn,
    facing: Math.PI,
  };
}

function duel(baseEnergyPips = 0): MatchSimulation {
  const match = new MatchSimulation({
    seed: "overcast",
    matchRules: MATCH,
    participants: [elementalist(vec2(0, 0), baseEnergyPips), foe("d", vec2(300, 0))],
  });
  match.setTarget("e", "d");
  return match;
}

function caster(match: MatchSimulation) {
  const found = match.get("e");
  if (found === undefined) {
    throw new Error("no caster");
  }
  return found;
}

function stepFor(match: MatchSimulation, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    match.step(DT);
  }
}

describe("overcast (#461)", () => {
  it("lowers the ceiling, takes no energy below it, and stacks", () => {
    const combatant = makeCombatant({ id: "e", energy: 50, maxEnergy: 50 });
    payCost(skill(CHAIN_LIGHTNING), combatant);
    expect(combatant.energy).toBe(40);
    expect(combatant.overcast).toBe(5);
    expect(effectiveMaxEnergy(combatant)).toBe(45);
    payCost(skill(CHAIN_LIGHTNING), combatant);
    expect(combatant.overcast).toBe(10);
    expect(combatant.energy).toBe(30);
  });

  it("cuts energy above the new ceiling: 30/30, cost 5 and 10 overcast leave 20/20 (GW1)", () => {
    const combatant = makeCombatant({ id: "e", energy: 30, maxEnergy: 30 });
    combatant.energy -= 5;
    addOvercast(combatant, 10);
    expect(combatant.energy).toBe(20);
    expect(effectiveMaxEnergy(combatant)).toBe(20);
  });

  it("can take the ceiling below 0; energy stays at 0 and nothing fills it", () => {
    const combatant = makeCombatant({ id: "e", energy: 30, maxEnergy: 30 });
    addOvercast(combatant, 40);
    expect(effectiveMaxEnergy(combatant)).toBe(-10);
    expect(combatant.energy).toBe(0);
    gainEnergy(combatant, 15, []);
    expect(combatant.energy).toBe(0);
  });

  it("caps an energy gain at the ceiling, not at maximum energy", () => {
    const combatant = makeCombatant({ id: "e", energy: 10, maxEnergy: 50 });
    addOvercast(combatant, 30);
    const events: Parameters<typeof gainEnergy>[2] = [];
    gainEnergy(combatant, 15, events);
    expect(combatant.energy).toBe(20);
    expect(events).toEqual([{ kind: "energy-gain", targetId: "e", amount: 10 }]);
  });

  it("is paid when the cast starts, so a cancelled cast keeps it", () => {
    const match = duel();
    expect(match.requestSkill("e", 0)?.check).toEqual({ ok: true });
    const { combatant } = caster(match);
    expect(combatant.overcast).toBe(5);
    expect(combatant.energy).toBe(20);
    match.cancelAction("e");
    match.step(DT);
    expect(combatant.cast.isCasting).toBe(false);
    expect(combatant.overcast).toBeCloseTo(5 - DT / 3, 6);
  });

  it("recovers 1 every 3 s and gives no energy back", () => {
    const match = duel();
    const { combatant } = caster(match);
    addOvercast(combatant, 10);
    expect(combatant.energy).toBe(20);
    stepFor(match, 15);
    expect(combatant.overcast).toBeCloseTo(5, 6);
    expect(combatant.energy).toBe(20);
    stepFor(match, 20);
    expect(combatant.overcast).toBe(0);
  });

  it("regeneration fills only to the ceiling", () => {
    // +10 pips, the cap: far quicker than overcast recovers.
    const match = duel(10);
    const { combatant } = caster(match);
    combatant.energy = 0;
    addOvercast(combatant, 12);
    stepFor(match, 9);
    expect(combatant.overcast).toBeCloseTo(9, 6);
    expect(combatant.energy).toBeCloseTo(effectiveMaxEnergy(combatant), 6);
  });

  it("recovers while dead, lasts through respawn, which fills only to the ceiling", () => {
    const match = duel();
    const participant = caster(match);
    addOvercast(participant.combatant, 20);
    participant.combatant.health = 0;
    participant.combatant.dead = true;
    participant.respawnInSeconds = 3;
    stepFor(match, 3 + DT);
    expect(participant.combatant.dead).toBe(false);
    // A second of the 20 recovered while dead, and the rest is kept.
    expect(participant.combatant.overcast).toBeCloseTo(19, 1);
    expect(participant.combatant.energy).toBeCloseTo(11, 1);
  });

  it("is cleared by a reset, as the Training Ground's", () => {
    const match = duel();
    addOvercast(caster(match).combatant, 20);
    match.resetParticipant("e");
    expect(caster(match).combatant.overcast).toBe(0);
    expect(caster(match).combatant.energy).toBe(30);
  });

  it("shows in the cost: Chain Lightning is 10 energy, 5 overcast", () => {
    expect(describeSkill(skill(CHAIN_LIGHTNING)).cost).toBe("10 energy, 5 overcast");
    expect(describeSkill(skill("elementalist.fireball")).cost).toBe("10 energy");
  });
});

describe("Chain Lightning (#461)", () => {
  it("strikes the target and the two foes nearest it for 70 lightning at Air Magic 12, past 25% of their armor", () => {
    const match = new MatchSimulation({
      seed: "chain",
      participants: [
        elementalist(vec2(0, 0)),
        foe("d", vec2(300, 0)),
        foe("near", vec2(330, 0)),
        foe("nearer", vec2(310, 10)),
        foe("far", vec2(360, 0)),
      ],
    });
    match.setTarget("e", "d");
    expect(match.requestSkill("e", 0)?.check).toEqual({ ok: true });
    const lost = (id: string) => 1e6 - (match.get(id)?.combatant.health ?? 0);
    stepFor(match, 2.5);
    // 70 against 60 armor less 25%: 70 × 2^(15 / 40) ≈ 91 (#761).
    expect(lost("d")).toBe(91);
    expect(lost("nearer")).toBe(91);
    expect(lost("near")).toBe(91);
    expect(lost("far")).toBe(0);
  });
});
