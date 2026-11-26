import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { segment } from "../geometry.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { payCost } from "./activation.js";
import { getSkill } from "./catalog.js";
import { applySkillEffects, type CombatEvent } from "./effects.js";
import { NO_RANKS, getStatusDefinition, HEALTH_PER_PIP } from "./status.js";
import { makeCombatant } from "./testing.js";
import type { Combatant, Skill } from "./types.js";

/**
 * Monk staples 2 (#1013): Remove Hex takes one hex, Dismiss Condition
 * one condition and heals an enchanted ally, Healing Breeze regenerates,
 * Heal Party heals the whole team wherever it stands.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1.combat;
const DT = 1 / MINIMAL_GW_INSPIRED_PVP_V1.tickRateHz;
const RANKS = new Map([
  ["monk.healing-prayers", 12],
  ["monk.protection-prayers", 12],
]);

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

function monk(): Combatant {
  return makeCombatant({ id: "monk", attributeRanks: RANKS, energy: 30 });
}

function ally(): Combatant {
  return makeCombatant({ id: "ally", maxHealth: 500, health: 200 });
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

describe("Remove Hex (#1013)", () => {
  it("takes the newest of two hexes and leaves the other", () => {
    const hexed = ally();
    hexed.statuses.apply("malaise", 10, "foe", NO_RANKS);
    hexed.statuses.apply("faintheartedness", 10, "foe", NO_RANKS);
    expect(use(monk(), "monk.remove-hex", hexed)).toEqual([
      { kind: "status-removed", targetId: "ally", statusId: "faintheartedness" },
    ]);
    expect(hexed.statuses.has("malaise")).toBe(true);
    expect(hexed.statuses.has("faintheartedness")).toBe(false);
  });

  it("with no hex does nothing, and is paid for all the same", () => {
    const user = monk();
    expect(use(user, "monk.remove-hex", ally())).toEqual([]);
    expect(user.energy).toBe(25);
  });
});

describe("Dismiss Condition (#1013)", () => {
  it("on an enchanted, Poisoned ally removes Poison and heals 63", () => {
    const target = ally();
    target.statuses.apply("mending", 10, "monk", NO_RANKS);
    target.statuses.apply("poison", 10, "foe", NO_RANKS);
    expect(use(monk(), "monk.dismiss-condition", target)).toEqual([
      { kind: "status-removed", targetId: "ally", statusId: "poison" },
      { kind: "heal", targetId: "ally", amount: 63 },
    ]);
    expect(target.health).toBe(263);
  });

  it("on an enchanted ally with no condition still heals 63", () => {
    const target = ally();
    target.statuses.apply("healing-breeze", 15, "monk", NO_RANKS);
    expect(use(monk(), "monk.dismiss-condition", target)).toEqual([
      { kind: "heal", targetId: "ally", amount: 63 },
    ]);
  });

  it("on a Poisoned ally with no enchantment removes Poison and heals nothing", () => {
    const target = ally();
    target.statuses.apply("poison", 10, "foe", NO_RANKS);
    expect(use(monk(), "monk.dismiss-condition", target)).toEqual([
      { kind: "status-removed", targetId: "ally", statusId: "poison" },
    ]);
    expect(target.health).toBe(200);
  });
});

describe("Healing Breeze (#1013)", () => {
  it("is a Monk enchantment of +8 health pips", () => {
    const breeze = getStatusDefinition("healing-breeze");
    expect(breeze.category).toBe("enchantment");
    expect(breeze.profession).toBe("monk");
    expect(breeze.healthPips).toBe(8);
  });

  it("puts itself on the ally for 15 s", () => {
    const target = ally();
    use(monk(), "monk.healing-breeze", target);
    expect(target.statuses.get("healing-breeze")?.remainingSeconds).toBe(15);
  });
});

/** Every heal `skillId` logged on `targetId`, summed. */
function healed(log: readonly CombatLogEntry[], skillId: string, targetId: string): number {
  return log
    .filter((entry) => entry.skillId === skillId)
    .flatMap((entry) => entry.events)
    .reduce(
      (sum, event) =>
        event.kind === "heal" && event.targetId === targetId ? sum + event.amount : sum,
      0,
    );
}

function spec(
  id: string,
  team: number,
  spawn: Vec2,
  skillBar: readonly string[] = [],
  ranks: ReadonlyMap<string, number> = new Map(),
): ParticipantSpec {
  return {
    id,
    team,
    skillBar,
    attributeRanks: ranks,
    equipment: unarmedResolvedEquipment(RULES.armorReferenceLevel),
    maxHealth: 1000,
    spawn,
    facing: 0,
  };
}

function hurt(sim: MatchSimulation, ...ids: readonly string[]): void {
  for (const id of ids) {
    const participant = sim.get(id);
    if (participant === undefined) {
      throw new Error(`no participant ${id}`);
    }
    participant.combatant.health = 100;
  }
}

function stepFor(sim: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...sim.step(DT).log);
  }
  return log;
}

describe("Heal Party (#1013), in a match", () => {
  const HEAL_PARTY = "monk.heal-party";

  /** A monk, a team-mate beside it, one across the map behind a wall, a dead one and a foe. */
  function cast(ranks: ReadonlyMap<string, number>): CombatLogEntry[] {
    const sim = new MatchSimulation({
      seed: "heal-party",
      // Between the monk and "far": no line of sight, and no matter.
      walls: [segment(vec2(1000, -500), vec2(1000, 500))],
      participants: [
        spec("monk", 0, vec2(0, 0), [HEAL_PARTY], ranks),
        spec("near", 0, vec2(100, 0)),
        spec("far", 0, vec2(3000, 0)),
        spec("dead", 0, vec2(-100, 0)),
        spec("foe", 1, vec2(0, 60)),
      ],
    });
    hurt(sim, "monk", "near", "far", "dead", "foe");
    const dead = sim.get("dead")?.combatant;
    if (dead === undefined) {
      throw new Error("no dead");
    }
    dead.dead = true;
    expect(sim.requestSkill("monk", 0)?.check).toEqual({ ok: true });
    return stepFor(sim, 1.5);
  }

  it("heals the caster and every living team-mate 66, however far, and no one else", () => {
    const log = cast(new Map([["monk.healing-prayers", 12]]));
    expect(healed(log, HEAL_PARTY, "monk")).toBe(66);
    expect(healed(log, HEAL_PARTY, "near")).toBe(66);
    expect(healed(log, HEAL_PARTY, "far")).toBe(66);
    expect(healed(log, HEAL_PARTY, "dead")).toBe(0);
    expect(healed(log, HEAL_PARTY, "foe")).toBe(0);
  });

  it("sends no area: there is no ring to draw", () => {
    const entry = cast(new Map([["monk.healing-prayers", 12]])).find(
      (logged) => logged.skillId === HEAL_PARTY,
    );
    expect(entry).toBeDefined();
    expect(entry?.area).toBeUndefined();
  });
});

describe("Healing Breeze (#1013), in a match", () => {
  function match(): MatchSimulation {
    const sim = new MatchSimulation({
      seed: "healing-breeze",
      participants: [
        spec("monk", 0, vec2(0, 0), ["monk.healing-breeze"], RANKS),
        spec("ally", 0, vec2(100, 0)),
        spec("foe", 1, vec2(200, 0), ["necromancer.rend-enchantments"]),
      ],
    });
    hurt(sim, "ally");
    sim.setTarget("monk", "ally");
    expect(sim.requestSkill("monk", 0)?.check).toEqual({ ok: true });
    stepFor(sim, 1.1);
    return sim;
  }

  it("heals its ally 16 Health a second, its +8 pips, for 15 s", () => {
    const sim = match();
    const ally = sim.get("ally");
    if (ally === undefined) {
      throw new Error("no ally");
    }
    expect(ally.combatant.statuses.has("healing-breeze")).toBe(true);
    expect(sim.pips(ally).health).toBe(8);
    const before = ally.combatant.health;
    stepFor(sim, 2);
    expect(ally.combatant.health - before).toBeCloseTo(2 * 8 * HEALTH_PER_PIP, 0);
    stepFor(sim, 13);
    expect(ally.combatant.statuses.has("healing-breeze")).toBe(false);
  });

  it("stops when Rend Enchantments takes it", () => {
    const sim = match();
    sim.setTarget("foe", "ally");
    expect(sim.requestSkill("foe", 0)?.check).toEqual({ ok: true });
    stepFor(sim, 2.1);
    const ally = sim.get("ally");
    expect(ally?.combatant.statuses.has("healing-breeze")).toBe(false);
    if (ally !== undefined) {
      expect(sim.pips(ally).health).toBeLessThan(8);
    }
  });
});
