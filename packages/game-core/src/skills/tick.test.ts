import { describe, expect, it } from "vitest";

import { getSkill } from "./catalog.js";
import { combinedHealingMultiplier, HEALING_MULTIPLIER_FLOOR, HEALTH_PER_PIP } from "./status.js";
import {
  advanceStatuses,
  attackMissChanceOf,
  clampMoveSpeed,
  effectiveActivationSeconds,
  effectiveMaxHealth,
  healingMultiplierOf,
  moveSpeedMultiplier,
} from "./tick.js";
import { makeCombatant } from "./testing.js";
import type { Combatant, Skill } from "./types.js";

describe("advanceStatuses health change", () => {
  it("applies degeneration continuously, not in once-per-second lumps", () => {
    const c = makeCombatant({ id: "c", health: 500 });
    c.statuses.apply("bleeding", 10, "a"); // -3 pips, 6 HP/s
    advanceStatuses(c, 0.05, 0); // one 20Hz tick
    expect(c.health).toBeCloseTo(500 - 6 * 0.05, 10);
  });

  it("accumulates degeneration correctly across many ticks", () => {
    const c = makeCombatant({ id: "c", health: 500 });
    c.statuses.apply("bleeding", 10, "a");
    for (let i = 0; i < 20; i += 1) {
      advanceStatuses(c, 0.05, 0);
    }
    expect(c.health).toBeCloseTo(494, 6);
  });

  it("counts a pip as 2 HP/s: +4 regeneration heals 8 a second", () => {
    const c = makeCombatant({ id: "c", health: 100 });
    c.statuses.apply("regeneration", 10, "a");
    advanceStatuses(c, 1, 0);
    expect(c.health).toBeCloseTo(100 + 4 * HEALTH_PER_PIP, 10);
  });

  it("clamps stacked degeneration to 10 pips: burning, bleeding and poison (-14) drain 20 HP/s", () => {
    const c = makeCombatant({ id: "c", health: 500 });
    c.statuses.apply("burning", 10, "a");
    c.statuses.apply("bleeding", 10, "a");
    c.statuses.apply("poison", 10, "a");
    advanceStatuses(c, 1, 0);
    expect(c.health).toBeCloseTo(480, 10);
  });

  it("does nothing when regeneration cancels degeneration: +4 against poison's -4", () => {
    const c = makeCombatant({ id: "c", health: 300 });
    c.statuses.apply("regeneration", 10, "a");
    c.statuses.apply("poison", 10, "a");
    const events = advanceStatuses(c, 1, 0);
    expect(c.health).toBe(300);
    expect(events.some((e) => e.kind === "damage" || e.kind === "heal")).toBe(false);
  });

  it("applies regeneration up to, but never past, maximum health", () => {
    const c = makeCombatant({ id: "c", health: 498, maxHealth: 500 });
    c.statuses.apply("regeneration", 10, "a"); // +4 pips, 8 HP/s
    for (let i = 0; i < 40; i += 1) {
      advanceStatuses(c, 0.05, 0);
    }
    expect(c.health).toBe(500);
  });

  it("kills a combatant whose degeneration reaches zero health", () => {
    const c = makeCombatant({ id: "c", health: 1 });
    c.statuses.apply("burning", 10, "a");
    const events = advanceStatuses(c, 1, 0);
    expect(c.dead).toBe(true);
    expect(c.health).toBe(0);
    expect(events).toContainEqual({ kind: "death", targetId: "c" });
  });

  it("emits a damage event for degeneration and a heal event for regeneration", () => {
    const bleeding = makeCombatant({ id: "b", health: 500 });
    bleeding.statuses.apply("bleeding", 10, "a");
    expect(advanceStatuses(bleeding, 1, 0).some((e) => e.kind === "damage")).toBe(true);

    const regen = makeCombatant({ id: "r", health: 100 });
    regen.statuses.apply("regeneration", 10, "a");
    expect(advanceStatuses(regen, 1, 0).some((e) => e.kind === "heal")).toBe(true);
  });

  it("does nothing at all for a dead combatant", () => {
    const c = makeCombatant({ id: "c", health: 0, dead: true });
    c.statuses.apply("bleeding", 10, "a");
    expect(advanceStatuses(c, 1, 0)).toEqual([]);
  });

  it("emits no health event when no status changes health", () => {
    const c = makeCombatant({ id: "c" });
    c.statuses.apply("crippled", 10, "a");
    const events = advanceStatuses(c, 1, 0);
    expect(events.some((e) => e.kind === "damage" || e.kind === "heal")).toBe(false);
  });
});

describe("advanceStatuses expiry", () => {
  it("emits status-expired when a status runs out", () => {
    const c = makeCombatant({ id: "c" });
    c.statuses.apply("bleeding", 1, "a");
    const events = advanceStatuses(c, 1.5, 0);
    expect(events).toContainEqual({
      kind: "status-expired",
      targetId: "c",
      statusId: "bleeding",
    });
    expect(c.statuses.has("bleeding")).toBe(false);
  });

  it("stops degeneration once the condition expires", () => {
    const c = makeCombatant({ id: "c", health: 500 });
    c.statuses.apply("bleeding", 1, "a");
    advanceStatuses(c, 1, 0);
    const healthAfterExpiry = c.health;
    advanceStatuses(c, 5, 0);
    expect(c.health).toBe(healthAfterExpiry);
  });
});

describe("effectiveMaxHealth", () => {
  it("is the raw maximum with no statuses", () => {
    expect(effectiveMaxHealth(makeCombatant({ id: "c", maxHealth: 500 }))).toBe(500);
  });

  it("is reduced by deep wound: 20% of the maximum, at most 100", () => {
    const small = makeCombatant({ id: "c", maxHealth: 480 });
    small.statuses.apply("deep-wound", 10, "a");
    expect(effectiveMaxHealth(small)).toBe(384);
    const large = makeCombatant({ id: "c", maxHealth: 600 });
    large.statuses.apply("deep-wound", 10, "a");
    expect(effectiveMaxHealth(large)).toBe(500);
  });

  it("comes back whole when deep wound ends", () => {
    const c = makeCombatant({ id: "c", maxHealth: 480 });
    c.statuses.apply("deep-wound", 10, "a");
    c.statuses.remove("deep-wound");
    expect(effectiveMaxHealth(c)).toBe(480);
  });

  it("caps regeneration at the deep-wound-reduced maximum, not the raw one", () => {
    const c = makeCombatant({ id: "c", health: 390, maxHealth: 500 });
    c.statuses.apply("deep-wound", 100, "a");
    c.statuses.apply("regeneration", 100, "a");
    for (let i = 0; i < 100; i += 1) {
      advanceStatuses(c, 0.05, 0);
    }
    expect(c.health).toBeLessThanOrEqual(400);
  });
});

describe("healingMultiplierOf", () => {
  it("is 1 with no status, and 0.8 while deep-wounded", () => {
    const c = makeCombatant({ id: "c" });
    expect(healingMultiplierOf(c)).toBe(1);
    c.statuses.apply("deep-wound", 10, "a");
    expect(healingMultiplierOf(c)).toBe(0.8);
  });

  it("multiplies reductions, never below 60%", () => {
    // A hypothetical second reduction: only deep wound reduces healing today.
    expect(combinedHealingMultiplier([0.8, 0.9])).toBeCloseTo(0.72, 10);
    expect(combinedHealingMultiplier([0.8, 0.5])).toBe(HEALING_MULTIPLIER_FLOOR);
    expect(HEALING_MULTIPLIER_FLOOR).toBe(0.6);
  });
});

describe("moveSpeedMultiplier", () => {
  it("is full speed with no status, and half while crippled", () => {
    const c = makeCombatant({ id: "c" });
    expect(moveSpeedMultiplier(c)).toBe(1);
    c.statuses.apply("crippled", 10, "a");
    expect(moveSpeedMultiplier(c)).toBe(0.5);
  });

  it("multiplies crippled with Armor of Earth's slow", () => {
    const c = makeCombatant({ id: "c" });
    c.statuses.apply("crippled", 10, "a");
    c.statuses.apply("armor-boost", 10, "c");
    expect(moveSpeedMultiplier(c)).toBe(0.375);
  });

  it("clamps to [0.25, 1.33]", () => {
    expect(clampMoveSpeed(0.1)).toBe(0.25);
    expect(clampMoveSpeed(0.25)).toBe(0.25);
    expect(clampMoveSpeed(0.8)).toBe(0.8);
    expect(clampMoveSpeed(2)).toBe(1.33);
  });
});

describe("effectiveActivationSeconds", () => {
  const fireball = getSkill("elementalist.fireball");
  const swiftChop = getSkill("warrior.swift-chop");

  it("is the skill's own cast time when not dazed", () => {
    const c = makeCombatant({ id: "c" });
    expect(fireball && effectiveActivationSeconds(fireball, c)).toBe(fireball?.activationSeconds);
  });

  it("doubles while dazed", () => {
    const c = makeCombatant({ id: "c" });
    c.statuses.apply("dazed", 10, "a");
    expect(fireball && effectiveActivationSeconds(fireball, c)).toBe(
      (fireball?.activationSeconds ?? 0) * 2,
    );
  });

  it("leaves an instant skill instant while dazed", () => {
    const c = makeCombatant({ id: "c" });
    c.statuses.apply("dazed", 10, "a");
    expect(swiftChop?.activationSeconds).toBe(0);
    expect(swiftChop && effectiveActivationSeconds(swiftChop, c)).toBe(0);
  });
});

describe("attackMissChanceOf", () => {
  it("is 0 unblinded and 0.9 blind", () => {
    const c = makeCombatant({ id: "c" });
    expect(attackMissChanceOf(c)).toBe(0);
    c.statuses.apply("blind", 10, "a");
    expect(attackMissChanceOf(c)).toBe(0.9);
  });
});

describe("death by degeneration", () => {
  it("emits a death event that a caller can react to, without re-reading the flag", () => {
    // This is the exact shape the match room depends on: it keys its
    // "cancel the cast and start the respawn timer" branch off this
    // event, because TypeScript's narrowing would otherwise claim the
    // branch is unreachable after an earlier `dead` check.
    const c = makeCombatant({ id: "c", health: 2 });
    c.statuses.apply("burning", 10, "a");

    const events = advanceStatuses(c, 1, 0);

    expect(events.some((e) => e.kind === "death")).toBe(true);
    expect(c.dead).toBe(true);
  });

  it("emits no death event on a tick that merely damages", () => {
    const c = makeCombatant({ id: "c", health: 500 });
    c.statuses.apply("burning", 10, "a");
    expect(advanceStatuses(c, 1, 0).some((e) => e.kind === "death")).toBe(false);
  });
});

describe("effectiveActivationSeconds with Fast Casting (#527)", () => {
  const malaise = getSkill("necromancer.malaise");
  const faintheartedness = getSkill("necromancer.faintheartedness");
  const swiftChop = getSkill("warrior.swift-chop");
  if (malaise === undefined || faintheartedness === undefined || swiftChop === undefined) {
    throw new Error("catalog skill missing");
  }
  // No Mesmer spell is in the catalog yet: a 1 s hex of the Mesmer's.
  const mesmerHex: Skill = { ...malaise, profession: "mesmer", activationSeconds: 1 };
  const mesmer = (): Combatant =>
    makeCombatant({ id: "c", attributeRanks: new Map([["mesmer.fast-casting", 12]]) });

  it("casts a 2 s non-Mesmer spell in 1.149 s at rank 12", () => {
    expect(malaise.activationSeconds).toBe(2);
    expect(effectiveActivationSeconds(malaise, mesmer())).toBeCloseTo(1.149, 3);
  });

  it("leaves a 1 s non-Mesmer spell alone", () => {
    expect(faintheartedness.activationSeconds).toBe(1);
    expect(effectiveActivationSeconds(faintheartedness, mesmer())).toBe(1);
  });

  it("speeds a 1 s Mesmer spell to ×0.574", () => {
    expect(effectiveActivationSeconds(mesmerHex, mesmer())).toBeCloseTo(0.574, 3);
  });

  it("composes with dazed: ×1.149", () => {
    const c = mesmer();
    c.statuses.apply("dazed", 10, "a");
    expect(effectiveActivationSeconds(mesmerHex, c)).toBeCloseTo(1.149, 3);
  });

  it("leaves an attack skill and a rank-0 caster alone", () => {
    expect(effectiveActivationSeconds(swiftChop, mesmer())).toBe(0);
    const slowAttack: Skill = { ...swiftChop, profession: "mesmer", activationSeconds: 2 };
    expect(effectiveActivationSeconds(slowAttack, mesmer())).toBe(2);
    expect(effectiveActivationSeconds(mesmerHex, makeCombatant({ id: "c" }))).toBe(1);
  });
});
