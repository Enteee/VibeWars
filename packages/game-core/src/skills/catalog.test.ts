import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { describe, expect, it } from "vitest";

import { getAttribute } from "../professions.js";
import { createRng } from "../rng.js";
import { vec2 } from "../vec2.js";
import { canActivate, payCost } from "./activation.js";
import { CastState } from "./cast-state.js";
import { IMPLEMENTED_SKILLS, getSkill } from "./catalog.js";
import { computeCoverage, formatCoverage } from "./coverage.js";
import { applyEffects } from "./effects.js";
import { makeCombatant } from "./testing.js";
import type { Combatant } from "./types.js";

describe("skill catalog integrity", () => {
  it("has no duplicate skill ids", () => {
    const ids = IMPLEMENTED_SKILLS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every skill a non-empty name and a positive range", () => {
    for (const skill of IMPLEMENTED_SKILLS) {
      expect(skill.name.length).toBeGreaterThan(0);
      expect(skill.range).toBeGreaterThan(0);
    }
  });

  it("gives every skill at least one effect — no empty placeholder skills", () => {
    for (const skill of IMPLEMENTED_SKILLS) {
      expect(skill.effects.length).toBeGreaterThan(0);
    }
  });

  it("uses non-negative activation and recharge everywhere", () => {
    for (const skill of IMPLEMENTED_SKILLS) {
      expect(skill.activationSeconds).toBeGreaterThanOrEqual(0);
      expect(skill.rechargeSeconds).toBeGreaterThanOrEqual(0);
    }
  });

  it("looks up a known skill and misses an unknown one", () => {
    expect(getSkill("elementalist.fireball")?.name).toBe("Fireball");
    expect(getSkill("not.a.skill")).toBeUndefined();
  });
});

describe("skill coverage reporting", () => {
  it("counts implemented vs imported and names the gap", () => {
    const imported = ["elementalist.fireball", "monk.orison-of-healing", "mesmer.echo"];
    const coverage = computeCoverage(imported);
    expect(coverage.imported).toBe(3);
    expect(coverage.implemented).toBe(IMPLEMENTED_SKILLS.length);
    const ids = coverage.unimplemented.map((skill) => skill.id);
    expect(ids).toContain("mesmer.echo");
    expect(ids).not.toContain("elementalist.fireball");
  });

  it("flags implemented skills that are original design, not imports", () => {
    const coverage = computeCoverage(["elementalist.fireball"]);
    expect(coverage.originalDesign).toContain("necromancer.blood-renewal-lite");
  });

  it("formats a human-readable report naming every unimplemented skill", () => {
    const text = formatCoverage(computeCoverage(["mesmer.echo", "elementalist.fireball"]));
    expect(text).toContain("mesmer.echo");
    expect(text).toContain("imported:");
    expect(text).toContain("implemented:");
  });
});

/**
 * Headless combat simulation (brief §15). These run a full
 * validate -> pay -> cast -> resolve cycle with no server, no socket and
 * no browser, which is exactly the property that makes combat rules
 * testable at all.
 */
describe("headless combat simulation", () => {
  const TICK = 1 / 20;

  interface SimActor {
    readonly combatant: Combatant;
    readonly cast: CastState;
    readonly position: { x: number; y: number };
    readonly skillBar: readonly string[];
  }

  function actor(combatant: Combatant, skillBar: readonly string[], x = 0): SimActor {
    return { combatant, cast: new CastState(), position: vec2(x, 0), skillBar };
  }

  /** Try to start a cast; returns the rejection reason, or undefined on success. */
  function tryCast(
    caster: SimActor,
    skillId: string,
    target: SimActor | undefined,
  ): string | undefined {
    const skill = getSkill(skillId);
    if (skill === undefined) {
      return "unknown-skill";
    }
    const check = canActivate({
      skill,
      caster: caster.combatant,
      casterPosition: caster.position,
      target: target?.combatant,
      targetPosition: target?.position,
      rechargeRemaining: caster.cast.rechargeRemaining,
      isCasting: caster.cast.isCasting,
      skillBar: caster.skillBar,
      losBlockers: [],
    });
    if (!check.ok) {
      return check.reason;
    }
    payCost(skill, caster.combatant);
    caster.cast.beginCast(skill.id, target?.combatant.id, skill.activationSeconds);
    return undefined;
  }

  /** Advance one tick, resolving any cast that completes. */
  function tick(caster: SimActor, target: SimActor | undefined): void {
    const completed = caster.cast.advance(TICK);
    if (completed === undefined) {
      return;
    }
    const skill = getSkill(completed.skillId);
    if (skill === undefined) {
      return;
    }
    applyEffects(skill.effects, {
      caster: caster.combatant,
      target: target?.combatant,
      rng: createRng(1),
      rules: MINIMAL_GW_INSPIRED_PVP_V1.combat,
    });
    caster.cast.startRecharge(skill.id, skill.rechargeSeconds);
  }

  it("an elementalist with Fire Magic 12 kills a 500hp target with repeated Fireballs", () => {
    const ele = actor(
      makeCombatant({
        id: "ele",
        team: 0,
        energy: 100,
        maxEnergy: 100,
        attributeRanks: new Map([["elementalist.fire-magic", 12]]),
      }),
      ["elementalist.fireball"],
    );
    const victim = actor(makeCombatant({ id: "victim", team: 1 }), [], 100);

    // 91 damage per cast at rank 12 -> 6 casts to kill 500hp.
    for (let elapsed = 0; elapsed < 60 && !victim.combatant.dead; elapsed += TICK) {
      tryCast(ele, "elementalist.fireball", victim);
      tick(ele, victim);
    }

    expect(victim.combatant.dead).toBe(true);
    expect(victim.combatant.health).toBe(0);
  });

  it("respects recharge: a second Fireball cannot start until recharge elapses", () => {
    const ele = actor(makeCombatant({ id: "ele", team: 0, energy: 100, maxEnergy: 100 }), [
      "elementalist.fireball",
    ]);
    const victim = actor(makeCombatant({ id: "victim", team: 1 }), [], 100);

    expect(tryCast(ele, "elementalist.fireball", victim)).toBeUndefined();
    // Finish the 1s cast.
    for (let i = 0; i < 20; i += 1) {
      tick(ele, victim);
    }
    // Immediately after, the 7s recharge is running.
    expect(tryCast(ele, "elementalist.fireball", victim)).toBe("still-recharging");
  });

  it("a monk heals a damaged ally, and the heal scales with Healing Prayers", () => {
    const makeMonk = (rank: number): SimActor =>
      actor(
        makeCombatant({
          id: "monk",
          team: 0,
          attributeRanks: new Map([["monk.healing-prayers", rank]]),
        }),
        ["monk.orison-of-healing"],
      );

    const healAmountAtRank = (rank: number): number => {
      const monk = makeMonk(rank);
      const ally = actor(makeCombatant({ id: "ally", team: 0, health: 100 }), [], 50);
      expect(tryCast(monk, "monk.orison-of-healing", ally)).toBeUndefined();
      for (let i = 0; i < 25; i += 1) {
        tick(monk, ally);
      }
      return ally.combatant.health - 100;
    };

    expect(healAmountAtRank(0)).toBe(20);
    expect(healAmountAtRank(12)).toBe(60);
    expect(healAmountAtRank(12)).toBeGreaterThan(healAmountAtRank(6));
  });

  it("energy runs out: a monk cannot heal forever", () => {
    const monk = actor(makeCombatant({ id: "monk", team: 0, energy: 12, maxEnergy: 50 }), [
      "monk.orison-of-healing",
    ]);
    const ally = actor(makeCombatant({ id: "ally", team: 0, health: 10 }), [], 50);

    const reasons: (string | undefined)[] = [];
    for (let elapsed = 0; elapsed < 20; elapsed += TICK) {
      reasons.push(tryCast(monk, "monk.orison-of-healing", ally));
      tick(monk, ally);
    }

    // 12 energy at 5 per cast = 2 casts, then it must report running dry.
    expect(reasons).toContain("insufficient-energy");
    expect(monk.combatant.energy).toBeLessThan(5);
  });

  it("the whole simulation is deterministic: identical runs produce identical state", () => {
    const run = (): number => {
      const ele = actor(
        makeCombatant({
          id: "ele",
          team: 0,
          energy: 100,
          maxEnergy: 100,
          attributeRanks: new Map([["elementalist.fire-magic", 9]]),
        }),
        ["elementalist.fireball"],
      );
      const victim = actor(makeCombatant({ id: "victim", team: 1 }), [], 100);
      for (let elapsed = 0; elapsed < 30; elapsed += TICK) {
        tryCast(ele, "elementalist.fireball", victim);
        tick(ele, victim);
      }
      return victim.combatant.health;
    };
    expect(run()).toBe(run());
  });

  it("a sacrifice skill can kill its own caster", () => {
    const necro = actor(makeCombatant({ id: "necro", team: 0, health: 30, maxHealth: 500 }), [
      "necromancer.blood-renewal-lite",
    ]);
    const ally = actor(makeCombatant({ id: "ally", team: 0, health: 100 }), [], 50);

    expect(tryCast(necro, "necromancer.blood-renewal-lite", ally)).toBeUndefined();
    for (let i = 0; i < 25; i += 1) {
      tick(necro, ally);
    }

    // 10% of 500 max health = 50 sacrifice, from 30 current -> dead.
    expect(necro.combatant.dead).toBe(true);
    // The ally is still healed: the effects resolve in order.
    expect(ally.combatant.health).toBeGreaterThan(100);
  });

  it("a dead caster cannot act", () => {
    const ele = actor(makeCombatant({ id: "ele", team: 0, dead: true }), ["elementalist.fireball"]);
    const victim = actor(makeCombatant({ id: "victim", team: 1 }), [], 100);
    expect(tryCast(ele, "elementalist.fireball", victim)).toBe("caster-dead");
  });

  it("an adrenaline skill is gated on adrenaline, not energy", () => {
    const warrior = actor(
      makeCombatant({ id: "war", team: 0, energy: 100, maxEnergy: 100, adrenaline: 0 }),
      ["warrior.backbreaker"],
    );
    const victim = actor(makeCombatant({ id: "victim", team: 1 }), [], 20);

    expect(tryCast(warrior, "warrior.backbreaker", victim)).toBe("insufficient-adrenaline");

    warrior.combatant.adrenaline = 9;
    expect(tryCast(warrior, "warrior.backbreaker", victim)).toBeUndefined();
    expect(warrior.combatant.adrenaline).toBe(0);
  });

  it("melee range is genuinely short: a melee skill fails at spell range", () => {
    const warrior = actor(makeCombatant({ id: "war", team: 0, adrenaline: 9 }), [
      "warrior.backbreaker",
    ]);
    const far = actor(makeCombatant({ id: "far", team: 1 }), [], 300);
    expect(tryCast(warrior, "warrior.backbreaker", far)).toBe("out-of-range");
  });
});

describe("skill attribute ownership", () => {
  it("gives every skill an explicit attributeId", () => {
    for (const skill of IMPLEMENTED_SKILLS) {
      expect(skill.attributeId.length, `${skill.id} has no attributeId`).toBeGreaterThan(0);
    }
  });

  it("points every attributeId at a real profession attribute", () => {
    for (const skill of IMPLEMENTED_SKILLS) {
      expect(getAttribute(skill.attributeId), `${skill.id} -> ${skill.attributeId}`).toBeDefined();
    }
  });

  it("names the attribute explicitly rather than leaving it inferable", () => {
    // Broad Head Arrow has no attribute-scaled effect at all, so an
    // inference-based approach would have made it equippable by every
    // profession. This pins the explicit field that replaced it.
    const bha = getSkill("ranger.broad-head-arrow");
    expect(bha?.attributeId).toBe("ranger.marksmanship");
    expect(bha?.effects.some((e) => "amount" in e)).toBe(false);
  });
});

describe("skill types", () => {
  it("names each skill's kind the way GW1 does, one of each", () => {
    const typeOf = (id: string) => getSkill(id)?.type;
    expect(typeOf("ranger.broad-head-arrow")).toBe("attack");
    expect(typeOf("elementalist.fireball")).toBe("spell");
    expect(typeOf("elementalist.armor-of-earth")).toBe("enchantment");
    expect(typeOf("necromancer.faintheartedness")).toBe("hex");
    expect(typeOf("ranger.troll-unguent")).toBe("skill");
  });
});
