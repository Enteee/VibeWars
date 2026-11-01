import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2 } from "../vec2.js";
import { payCost } from "./activation.js";
import { getSkill, IMPLEMENTED_SKILLS } from "./catalog.js";
import { applySkillEffects, type CombatEvent } from "./effects.js";
import { NO_RANKS, getStatusDefinition, type StatusId } from "./status.js";
import { makeCombatant } from "./testing.js";
import { effectiveActivationSeconds } from "./tick.js";
import { fireChangeTriggers, type TriggerContext } from "./triggers.js";
import type { Combatant, Skill } from "./types.js";

/**
 * The Monk and Necromancer staples (#944): Patient Spirit heals only when
 * it expires, Holy Veil slows the hexes cast on its ally and removes one
 * when it ends, Rend Enchantments costs health per Monk enchantment it
 * strips, Plague Touch moves your conditions onto a foe.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1.combat;
const DT = 1 / MINIMAL_GW_INSPIRED_PVP_V1.tickRateHz;
const RANKS = new Map([
  ["monk.healing-prayers", 12],
  ["necromancer.curses", 12],
]);

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

function caster(health = 500): Combatant {
  return makeCombatant({ id: "caster", attributeRanks: RANKS, energy: 30, health });
}

function foe(id = "foe"): Combatant {
  return makeCombatant({ id, team: 1, maxHealth: 1000, health: 1000 });
}

/** `user` pays for `skillId` and it lands on `target`. */
function use(user: Combatant, skillId: string, target: Combatant): CombatEvent[] {
  payCost(skill(skillId), user);
  return applySkillEffects({
    surroundings: new Map(),
    skill: skill(skillId),
    caster: user,
    targets: [target],
    rng: createRng(1),
    rules: RULES,
  });
}

/** What every change recorded on `bearer` sets off, `source` its statuses' caster. */
function fireChanges(bearer: Combatant, source: Combatant): CombatEvent[] {
  const context: TriggerContext = {
    sourceOf: (id) => (id === source.id ? source : id === bearer.id ? bearer : undefined),
    rng: createRng(1),
    rules: RULES,
    surroundings: new Map(),
    usedSkill: undefined,
  };
  return bearer.statuses
    .drainChanges()
    .flatMap((change) => fireChangeTriggers(bearer, change, () => [], context))
    .flatMap(({ events }) => events);
}

describe("ends and expires (#944)", () => {
  it("Patient Spirit's heal fires when it expires, not when it is removed", () => {
    const ally = makeCombatant({ id: "ally", health: 300 });
    const monk = makeCombatant({ id: "monk", attributeRanks: RANKS });
    ally.statuses.apply("patient-spirit", 2, "monk", NO_RANKS);
    ally.statuses.drainChanges();
    ally.statuses.advance(2, false);
    expect(fireChanges(ally, monk)).toEqual([{ kind: "heal", targetId: "ally", amount: 102 }]);

    ally.statuses.apply("patient-spirit", 2, "monk", NO_RANKS);
    ally.statuses.remove("patient-spirit");
    expect(fireChanges(ally, monk)).toEqual([]);
  });

  it("Patient Spirit heals by its caster's Healing Prayers: 30 at rank 0", () => {
    const ally = makeCombatant({ id: "ally", health: 300 });
    const unskilled = makeCombatant({ id: "monk" });
    ally.statuses.apply("patient-spirit", 2, "monk", NO_RANKS);
    ally.statuses.drainChanges();
    ally.statuses.advance(2, false);
    expect(fireChanges(ally, unskilled)).toEqual([{ kind: "heal", targetId: "ally", amount: 30 }]);
  });

  it("Holy Veil's hex removal fires on any end, an expiry too", () => {
    const ally = makeCombatant({ id: "ally" });
    ally.statuses.apply("malaise", 10, "foe", NO_RANKS);
    ally.statuses.apply("holy-veil", 1, "ally", NO_RANKS);
    ally.statuses.drainChanges();
    ally.statuses.advance(1, false);
    expect(fireChanges(ally, ally)).toEqual([
      { kind: "status-removed", targetId: "ally", statusId: "malaise" },
    ]);

    ally.statuses.apply("malaise", 10, "foe", NO_RANKS);
    ally.statuses.maintain("holy-veil", "ally", 0, NO_RANKS);
    ally.statuses.remove("holy-veil");
    expect(fireChanges(ally, ally)).toEqual([
      { kind: "status-removed", targetId: "ally", statusId: "malaise" },
    ]);
  });
});

describe("Patient Spirit (#944), in a match", () => {
  function match(): MatchSimulation {
    const spec = (id: string, x: number): ParticipantSpec => ({
      id,
      team: 0,
      skillBar: ["monk.patient-spirit", "mesmer.shatter-enchantment"],
      attributeRanks: RANKS,
      equipment: unarmedResolvedEquipment(RULES.armorReferenceLevel),
      spawn: vec2(x, 0),
      facing: 0,
    });
    const sim = new MatchSimulation({
      seed: "patient-spirit",
      participants: [spec("monk", 0), spec("ally", 100)],
    });
    const ally = sim.get("ally")?.combatant;
    if (ally === undefined) {
      throw new Error("no ally");
    }
    ally.health = 200;
    sim.setTarget("monk", "ally");
    expect(sim.requestSkill("monk", 0)?.check).toEqual({ ok: true });
    return sim;
  }

  function steps(sim: MatchSimulation, seconds: number): void {
    for (let i = 0; i < Math.round(seconds / DT); i += 1) {
      sim.step(DT);
    }
  }

  it("heals its ally 102 once its 2 s run out", () => {
    const sim = match();
    // ¼ s to cast, then 2 s on the ally, and a tick to fire.
    steps(sim, 0.25 + 1.9);
    expect(sim.get("ally")?.combatant.statuses.has("patient-spirit")).toBe(true);
    const health = sim.get("ally")?.combatant.health ?? 0;
    steps(sim, 0.2);
    expect(sim.get("ally")?.combatant.statuses.has("patient-spirit")).toBe(false);
    expect((sim.get("ally")?.combatant.health ?? 0) - health).toBeCloseTo(102, 0);
  });

  it("heals nothing if it is stripped at 1 s", () => {
    const sim = match();
    steps(sim, 0.25 + 1);
    const ally = sim.get("ally")?.combatant;
    expect(ally?.statuses.remove("patient-spirit")).toBe(true);
    const health = ally?.health ?? 0;
    steps(sim, 2);
    // Only natural regeneration, if any: never the 102.
    expect((ally?.health ?? 0) - health).toBeLessThan(20);
  });
});

describe("Holy Veil (#944)", () => {
  const HEX = skill("necromancer.faintheartedness");

  it("doubles a hex's cast time on its bearer, not a spell's nor a hex on another", () => {
    const veiled = makeCombatant({ id: "veiled" });
    veiled.statuses.maintain("holy-veil", "monk", 0, NO_RANKS);
    const necromancer = makeCombatant({ id: "necromancer", team: 1 });
    expect(effectiveActivationSeconds(HEX, necromancer, veiled)).toBe(2 * HEX.activationSeconds);
    expect(effectiveActivationSeconds(HEX, necromancer, makeCombatant({ id: "other" }))).toBe(
      HEX.activationSeconds,
    );
    const spell = skill("elementalist.fireball");
    expect(effectiveActivationSeconds(spell, necromancer, veiled)).toBe(spell.activationSeconds);
    // A tooltip has no target.
    expect(effectiveActivationSeconds(HEX, necromancer)).toBe(HEX.activationSeconds);
  });

  it("with a dazed caster: four times as long", () => {
    const veiled = makeCombatant({ id: "veiled" });
    veiled.statuses.maintain("holy-veil", "monk", 0, NO_RANKS);
    const necromancer = makeCombatant({ id: "necromancer", team: 1 });
    necromancer.statuses.apply("dazed", 5, "x", NO_RANKS);
    expect(effectiveActivationSeconds(HEX, necromancer, veiled)).toBe(4 * HEX.activationSeconds);
  });

  function match(): MatchSimulation {
    const spec = (id: string, team: number, x: number): ParticipantSpec => ({
      id,
      team,
      skillBar: ["monk.holy-veil", "necromancer.faintheartedness", "necromancer.malaise"],
      attributeRanks: RANKS,
      equipment: unarmedResolvedEquipment(RULES.armorReferenceLevel),
      spawn: vec2(x, 0),
      facing: 0,
    });
    return new MatchSimulation({
      seed: "holy-veil",
      participants: [spec("monk", 0, 0), spec("necromancer", 1, 300)],
    });
  }

  it("a hex the foe casts at the veiled monk takes twice as long, read as it begins", () => {
    const sim = match();
    expect(sim.requestSkill("monk", 0)?.check).toEqual({ ok: true });
    for (let i = 0; i < Math.round(1.2 / DT); i += 1) {
      sim.step(DT);
    }
    expect(sim.get("monk")?.combatant.statuses.get("holy-veil")?.maintained).not.toBeNull();
    sim.setTarget("necromancer", "monk");
    expect(sim.requestSkill("necromancer", 1)?.check).toEqual({ ok: true });
    expect(sim.get("necromancer")?.combatant.cast.activeCast?.totalSeconds).toBe(
      2 * HEX.activationSeconds,
    );
  });

  it("ended by its caster, it takes the newest hex with it", () => {
    const sim = match();
    const monk = sim.get("monk")?.combatant;
    if (monk === undefined) {
      throw new Error("no monk");
    }
    monk.statuses.apply("faintheartedness", 10, "necromancer", NO_RANKS);
    monk.statuses.apply("malaise", 10, "necromancer", NO_RANKS);
    monk.statuses.maintain("holy-veil", "monk", 0, NO_RANKS);
    sim.step(DT);
    expect(sim.endUpkeep("monk", "monk", "holy-veil")).toBe(true);
    const events = sim.step(DT).log.flatMap((entry) => entry.events);
    expect(events).toContainEqual({
      kind: "status-removed",
      targetId: "monk",
      statusId: "malaise",
    });
    expect(monk.statuses.has("malaise")).toBe(false);
    expect(monk.statuses.has("faintheartedness")).toBe(true);
  });

  it("with no hex on its ally, ending does nothing", () => {
    const ally = makeCombatant({ id: "ally" });
    ally.statuses.maintain("holy-veil", "ally", 0, NO_RANKS);
    ally.statuses.remove("holy-veil");
    expect(fireChanges(ally, ally)).toEqual([]);
  });
});

describe("Rend Enchantments (#944)", () => {
  const REND = "necromancer.rend-enchantments";

  it("strips Guardian, Mending and Contagion and costs 31 for each of the two Monk ones", () => {
    const target = foe();
    target.statuses.apply("guardian", 10, "x", NO_RANKS);
    target.statuses.maintain("mending", "x", 0, NO_RANKS);
    target.statuses.apply("contagion", 10, "x", NO_RANKS);
    const user = caster();
    const events = use(user, REND, target);
    expect(target.statuses.countByCategory("enchantment")).toBe(0);
    expect(user.health).toBe(500 - 62);
    expect(events).toContainEqual({ kind: "sacrifice", targetId: "caster", amount: 62 });
  });

  it("can kill its caster, after the removal", () => {
    const target = foe();
    target.statuses.apply("guardian", 10, "x", NO_RANKS);
    target.statuses.maintain("mending", "x", 0, NO_RANKS);
    const user = caster(50);
    const events = use(user, REND, target);
    expect(target.statuses.size).toBe(0);
    expect(user.dead).toBe(true);
    expect(events.map((event) => event.kind)).toEqual([
      "status-removed",
      "status-removed",
      "sacrifice",
      "death",
    ]);
  });

  it("on a foe with no enchantment: nothing removed, nothing lost, the energy spent", () => {
    const user = caster();
    expect(use(user, REND, foe())).toEqual([]);
    expect(user.health).toBe(500);
    expect(user.energy).toBe(25);
  });

  it("removes at most 8, the newest first", () => {
    const target = foe();
    const ids: StatusId[] = [
      "regeneration",
      "blood-ritual",
      "armor-boost",
      "guardian",
      "mending",
      "contagion",
      "mystic-regeneration",
      "fleeting-stability",
      "patient-spirit",
    ];
    for (const id of ids) {
      target.statuses.apply(id, 10, "x", NO_RANKS);
    }
    use(caster(), REND, target);
    expect(target.statuses.active.map(({ id }) => id)).toEqual(["regeneration"]);
  });
});

describe("Plague Touch (#944)", () => {
  const PLAGUE = "necromancer.plague-touch";

  it("moves your newest 3 conditions, each with the time it had left, yours as source", () => {
    const user = caster();
    user.statuses.apply("bleeding", 10, "x", NO_RANKS);
    user.statuses.apply("poison", 9, "x", NO_RANKS);
    user.statuses.apply("blind", 8, "x", NO_RANKS);
    user.statuses.apply("weakness", 7, "x", NO_RANKS);
    user.statuses.apply("crippled", 6, "x", NO_RANKS);
    user.statuses.advance(1, false);
    const target = foe();
    const events = use(user, PLAGUE, target);
    expect(user.statuses.active.map(({ id }) => id)).toEqual(["bleeding", "poison"]);
    expect(
      target.statuses.active.map(({ id, remainingSeconds, sourceId }) => [
        id,
        remainingSeconds,
        sourceId,
      ]),
    ).toEqual([
      ["crippled", 5, "caster"],
      ["weakness", 6, "caster"],
      ["blind", 7, "caster"],
    ]);
    expect(events.filter((event) => event.kind === "status-removed")).toHaveLength(3);
    expect(events.filter((event) => event.kind === "status-applied")).toHaveLength(3);
  });

  it("a longer blind already on the foe stays; yours is still taken off you", () => {
    const user = caster();
    user.statuses.apply("blind", 3, "x", NO_RANKS);
    const target = foe();
    target.statuses.apply("blind", 10, "y", NO_RANKS);
    use(user, PLAGUE, target);
    expect(user.statuses.has("blind")).toBe(false);
    expect(target.statuses.get("blind")?.remainingSeconds).toBe(10);
  });

  it("with no condition on you: nothing, the energy spent", () => {
    const user = caster();
    expect(use(user, PLAGUE, foe())).toEqual([]);
    expect(user.energy).toBe(25);
  });

  it("is a touch skill, not a spell: Dazed does not slow it", () => {
    const user = caster();
    user.statuses.apply("dazed", 5, "x", NO_RANKS);
    expect(skill(PLAGUE)).toMatchObject({ type: "skill", target: "single-enemy" });
    expect(effectiveActivationSeconds(skill(PLAGUE), user)).toBe(0.75);
  });

  it("in a match: a blind on you is on the foe instead", () => {
    const spec = (id: string, team: number, x: number): ParticipantSpec => ({
      id,
      team,
      skillBar: [PLAGUE],
      attributeRanks: RANKS,
      equipment: unarmedResolvedEquipment(RULES.armorReferenceLevel),
      spawn: vec2(x, 0),
      facing: 0,
    });
    const sim = new MatchSimulation({
      seed: "plague-touch",
      participants: [spec("necromancer", 0, 0), spec("foe", 1, 50)],
    });
    sim.get("necromancer")?.combatant.statuses.apply("blind", 8, "foe", NO_RANKS);
    sim.setTarget("necromancer", "foe");
    expect(sim.requestSkill("necromancer", 0)?.check).toEqual({ ok: true });
    for (let i = 0; i < Math.round(1 / DT); i += 1) {
      sim.step(DT);
    }
    expect(sim.get("necromancer")?.combatant.statuses.has("blind")).toBe(false);
    expect(sim.get("foe")?.combatant.statuses.get("blind")?.sourceId).toBe("necromancer");
  });
});

describe("profession on enchantments (#944)", () => {
  it("every status a profession's enchantment applies or maintains is that profession's", () => {
    for (const entry of IMPLEMENTED_SKILLS.filter(({ type }) => type === "enchantment")) {
      for (const effect of entry.effects) {
        if (effect.kind === "apply-status" || effect.kind === "maintain-status") {
          expect(getStatusDefinition(effect.statusId).profession, entry.id).toBe(entry.profession);
        }
      }
    }
  });
});
