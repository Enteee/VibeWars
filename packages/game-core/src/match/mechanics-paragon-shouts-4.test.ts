import { describe, expect, it } from "vitest";

import { AREA_EARSHOT, AREA_NEARBY } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { describeSkill } from "../skills/describe.js";
import { applyDamage, applyEffects, type CombatEvent } from "../skills/effects.js";
import { NO_RANKS, aggregateModifiers } from "../skills/status.js";
import { makeCombatant } from "../skills/testing.js";
import { effectiveActivationSeconds } from "../skills/tick.js";
import type { Skill } from "../skills/types.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";

/**
 * Paragon riders (#1955): Angelic Bond's one negation for the whole
 * party, Godspeed's speed while enchanted, "Lead the Way!"'s length for
 * each ally, "Help!"'s faster spells from allies, and "Brace Yourself!"'s
 * knockdown turned into damage on a nearby foe.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const BOND = "paragon.angelic-bond";
const GODSPEED = "paragon.godspeed";
const LEAD = "paragon.lead-the-way";
const HELP = "paragon.help";
const BRACE = "paragon.brace-yourself";
const RANKS = new Map([
  ["paragon.leadership", 12],
  ["paragon.command", 12],
]);

function spec(id: string, team: number, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [BOND, GODSPEED, LEAD, HELP, BRACE],
    attributeRanks: RANKS,
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 500,
    maxEnergy: 100,
    spawn,
    facing: 0,
  };
}

/** `p`, the Paragon, at the origin, and `more`. */
function match(more: readonly ParticipantSpec[]): MatchSimulation {
  return new MatchSimulation({
    seed: "paragon-shouts-4",
    participants: [spec("p", 0, vec2(0, 0)), ...more],
  });
}

/** `count` allies of `p` in a row beside it, `a1`, `a2`…, all within earshot. */
function allies(count: number): ParticipantSpec[] {
  return Array.from({ length: count }, (_, i) =>
    spec(`a${String(i + 1)}`, 0, vec2(0, 40 + i * 40)),
  );
}

function get(sim: MatchSimulation, id: string): Participant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`no skill ${id}`);
  }
  return found;
}

/** `p` uses `skillId` at `targetId`, and steps until it has landed. */
function use(sim: MatchSimulation, skillId: string, targetId = "p"): void {
  sim.setTarget("p", targetId);
  const slot = get(sim, "p").skillBar.indexOf(skillId);
  expect(sim.requestSkill("p", slot)?.check.ok).toBe(true);
  const log: CombatLogEntry[] = [];
  for (let i = 0; !log.some((entry) => entry.sourceId === "p" && entry.skillId === skillId); i++) {
    expect(i).toBeLessThan(5 * RULES.tickRateHz);
    log.push(...sim.step(DT).log);
  }
}

function speedOf(sim: MatchSimulation, id: string): number {
  return aggregateModifiers(get(sim, id).combatant.statuses.active).moveSpeedMultiplier;
}

describe("Angelic Bond (#1955)", () => {
  it("negates one fatal blow, heals that ally 164, and ends on the others", () => {
    const sim = match([...allies(2), spec("f", 1, vec2(300, 0))]);
    use(sim, BOND);
    for (const id of ["p", "a1", "a2"]) {
      expect(get(sim, id).combatant.statuses.has("angelic-bond")).toBe(true);
    }
    const a1 = get(sim, "a1").combatant;
    a1.health = 100;
    applyDamage(a1, 500, "typeless", false, [], get(sim, "f").combatant);
    expect(a1.dead).toBe(false);
    sim.step(DT);
    expect(a1.health).toBe(264);
    for (const id of ["p", "a1", "a2"]) {
      expect(get(sim, id).combatant.statuses.has("angelic-bond")).toBe(false);
    }
  });

  it("saves exactly one of two allies a single blow set kills in one tick", () => {
    const sim = match([...allies(2), spec("f", 1, vec2(300, 0))]);
    use(sim, BOND);
    const foe = get(sim, "f").combatant;
    const [a1, a2] = [get(sim, "a1").combatant, get(sim, "a2").combatant];
    a1.health = 100;
    a2.health = 100;
    // One splash, two packets, before any drain.
    applyDamage(a1, 500, "typeless", false, [], foe);
    applyDamage(a2, 500, "typeless", false, [], foe);
    expect([a1.dead, a2.dead]).toEqual([false, true]);
    sim.step(DT);
    expect(a1.health).toBe(264);
    expect(get(sim, "p").combatant.statuses.has("angelic-bond")).toBe(false);
  });

  it("spent by damage landed while triggers settle, still ends everywhere and saves again", () => {
    const sim = match([...allies(2), spec("x", 0, vec2(AREA_EARSHOT * 3, 0))]);
    use(sim, BOND);
    const [a1, a2] = [get(sim, "a1").combatant, get(sim, "a2").combatant];
    // Half of x's hit goes to a1, landed as x's changes are drained.
    get(sim, "x").combatant.statuses.apply("symbiotic-bond", 10, "a1", NO_RANKS);
    get(sim, "x").combatant.statuses.redirect(1000);
    a1.health = 100;
    sim.step(DT);
    expect(a1.dead).toBe(false);
    for (const id of ["p", "a1", "a2"]) {
      expect(get(sim, id).combatant.statuses.has("angelic-bond")).toBe(false);
    }
    // The next Bond from the same Paragon saves as the first did.
    a2.statuses.apply("angelic-bond", 10, "p", NO_RANKS);
    a2.health = 100;
    applyDamage(a2, 500, "typeless", false, [], undefined);
    expect(a2.dead).toBe(false);
  });

  it("after Judge's Intervention, spends only the oldest", () => {
    const sim = match([...allies(1), spec("f", 1, vec2(300, 0))]);
    const a1 = get(sim, "a1").combatant;
    a1.statuses.apply("judges-intervention", 10, "p", NO_RANKS);
    use(sim, BOND);
    a1.health = 100;
    applyDamage(a1, 500, "typeless", false, [], get(sim, "f").combatant);
    sim.step(DT);
    expect(a1.statuses.has("judges-intervention")).toBe(false);
    expect(a1.statuses.has("angelic-bond")).toBe(true);
    expect(get(sim, "p").combatant.statuses.has("angelic-bond")).toBe(true);
  });
});

describe("Godspeed (#1955)", () => {
  it("speeds allies only while enchanted, and not under Muddy Terrain", () => {
    const sim = match(allies(1));
    use(sim, GODSPEED);
    const a1 = get(sim, "a1").combatant;
    expect(a1.statuses.get("godspeed")?.durationSeconds).toBe(17);
    expect(speedOf(sim, "a1")).toBe(1);
    a1.statuses.apply("guardian", 10, "p", NO_RANKS);
    expect(speedOf(sim, "a1")).toBeCloseTo(1.25, 9);
    a1.statuses.remove("guardian");
    expect(speedOf(sim, "a1")).toBe(1);
    a1.statuses.apply("guardian", 10, "p", NO_RANKS);
    a1.statuses.apply("muddy-terrain", 10, "f", NO_RANKS);
    expect(speedOf(sim, "a1")).toBeCloseTo(0.9, 9);
  });
});

describe('"Lead the Way!" (#1955)', () => {
  it("lasts 4 s for each ally in earshot, the shouter included", () => {
    const sim = match([...allies(2), spec("far", 0, vec2(AREA_EARSHOT + 100, 0))]);
    use(sim, LEAD, "a1");
    const status = get(sim, "a1").combatant.statuses.get("lead-the-way");
    expect(status?.durationSeconds).toBe(12);
    expect(speedOf(sim, "a1")).toBeCloseTo(1.25, 9);
  });

  it("never lasts more than 30 s", () => {
    const sim = match(allies(8));
    use(sim, LEAD, "a1");
    expect(get(sim, "a1").combatant.statuses.get("lead-the-way")?.durationSeconds).toBe(30);
  });
});

describe('"Help!" (#1955)', () => {
  const twoSecondHeal: Skill = { ...skill("monk.heal-other"), activationSeconds: 2 };

  it("heals 41 and halves an ally's cast on the bearer, not its own nor a foe's", () => {
    const sim = match(allies(1));
    const a1 = get(sim, "a1").combatant;
    a1.health = 300;
    use(sim, HELP, "a1");
    expect(a1.health).toBe(341);
    const monk = makeCombatant({ id: "m", team: 0 });
    const foe = makeCombatant({ id: "f", team: 1 });
    expect(effectiveActivationSeconds(twoSecondHeal, monk, a1)).toBe(1);
    expect(effectiveActivationSeconds(twoSecondHeal, a1, a1)).toBe(2);
    expect(effectiveActivationSeconds(twoSecondHeal, foe, a1)).toBe(2);
  });

  it("leaves an ally's non-spell on the bearer as long as it was", () => {
    const sim = match(allies(1));
    use(sim, HELP, "a1");
    const signet: Skill = { ...twoSecondHeal, type: "signet" };
    const monk = makeCombatant({ id: "m", team: 0 });
    expect(effectiveActivationSeconds(signet, monk, get(sim, "a1").combatant)).toBe(2);
  });

  it("never targets a spirit", () => {
    expect(skill(HELP).target).toBe("single-ally-not-spirit");
  });
});

describe('"Brace Yourself!" (#1955)', () => {
  function knockDown(sim: MatchSimulation, id: string, by: string): CombatEvent[] {
    return applyEffects([{ kind: "knockdown", durationSeconds: 2 }], {
      caster: get(sim, by).combatant,
      target: get(sim, id).combatant,
      rng: createRng(1),
      rules: RULES.combat,
      surroundings: new Map(),
    });
  }

  it("stops a knockdown and deals 75 to the nearest nearby foe instead", () => {
    const sim = match([
      ...allies(1),
      spec("near", 1, vec2(30, 40)),
      spec("nearish", 1, vec2(-60, 40)),
      spec("far", 1, vec2(AREA_NEARBY * 3, 0)),
    ]);
    use(sim, BRACE, "a1");
    const a1 = get(sim, "a1").combatant;
    expect(a1.statuses.get("brace-yourself")?.durationSeconds).toBe(13);
    knockDown(sim, "a1", "far");
    expect(a1.knockdownRemaining).toBe(0);
    expect(a1.statuses.has("brace-yourself")).toBe(false);
    sim.step(DT);
    expect(get(sim, "near").combatant.health).toBe(425);
    expect(get(sim, "nearish").combatant.health).toBe(500);
    expect(get(sim, "far").combatant.health).toBe(500);
  });

  it("with no foe nearby, still stops the knockdown", () => {
    const sim = match([...allies(1), spec("far", 1, vec2(AREA_NEARBY * 3, 0))]);
    use(sim, BRACE, "a1");
    const a1 = get(sim, "a1").combatant;
    knockDown(sim, "a1", "far");
    sim.step(DT);
    expect(a1.knockdownRemaining).toBe(0);
    expect(get(sim, "far").combatant.health).toBe(500);
  });

  it("cannot target the shouter", () => {
    expect(skill(BRACE).target).toBe("single-other-ally");
  });
});

describe("tooltips (#1955)", () => {
  function texts(id: string): string[] {
    return describeSkill(skill(id), RANKS).effects.map((effect) => effect.text);
  }

  it("say what each rider does", () => {
    expect(texts(LEAD).join(" ")).toContain("4s for each ally in earshot (maximum 30)");
    expect(texts(GODSPEED).join(" ")).toContain("moves at 125% speed while enchanted");
    expect(texts(HELP).join(" ")).toContain(
      "other allies' spells on the bearer take 0.5× as long to cast",
    );
    expect(texts(BOND).join(" ")).toContain("when one ally's is spent, it ends on all others");
    expect(texts(BRACE).join(" ")).toContain("has a knockdown stopped");
  });
});
