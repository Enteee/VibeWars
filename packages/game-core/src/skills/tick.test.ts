import { describe, expect, it } from "vitest";

import { advanceStatuses, attackMisses, effectiveMaxHealth } from "./tick.js";
import { makeCombatant } from "./testing.js";

describe("advanceStatuses health change", () => {
  it("applies degeneration continuously, not in once-per-second lumps", () => {
    const c = makeCombatant({ id: "c", health: 500 });
    c.statuses.apply("bleeding", 10, "a"); // -3/s
    advanceStatuses(c, 0.05); // one 20Hz tick
    expect(c.health).toBeCloseTo(500 - 3 * 0.05, 10);
  });

  it("accumulates degeneration correctly across many ticks", () => {
    const c = makeCombatant({ id: "c", health: 500 });
    c.statuses.apply("bleeding", 10, "a");
    for (let i = 0; i < 20; i += 1) {
      advanceStatuses(c, 0.05);
    }
    expect(c.health).toBeCloseTo(497, 6);
  });

  it("applies regeneration up to, but never past, maximum health", () => {
    const c = makeCombatant({ id: "c", health: 498, maxHealth: 500 });
    c.statuses.apply("regeneration", 10, "a"); // +4/s
    for (let i = 0; i < 40; i += 1) {
      advanceStatuses(c, 0.05);
    }
    expect(c.health).toBe(500);
  });

  it("kills a combatant whose degeneration reaches zero health", () => {
    const c = makeCombatant({ id: "c", health: 1 });
    c.statuses.apply("burning", 10, "a");
    const events = advanceStatuses(c, 1);
    expect(c.dead).toBe(true);
    expect(c.health).toBe(0);
    expect(events).toContainEqual({ kind: "death", targetId: "c" });
  });

  it("emits a damage event for degeneration and a heal event for regeneration", () => {
    const bleeding = makeCombatant({ id: "b", health: 500 });
    bleeding.statuses.apply("bleeding", 10, "a");
    expect(advanceStatuses(bleeding, 1).some((e) => e.kind === "damage")).toBe(true);

    const regen = makeCombatant({ id: "r", health: 100 });
    regen.statuses.apply("regeneration", 10, "a");
    expect(advanceStatuses(regen, 1).some((e) => e.kind === "heal")).toBe(true);
  });

  it("does nothing at all for a dead combatant", () => {
    const c = makeCombatant({ id: "c", health: 0, dead: true });
    c.statuses.apply("bleeding", 10, "a");
    expect(advanceStatuses(c, 1)).toEqual([]);
  });

  it("emits no health event when no status changes health", () => {
    const c = makeCombatant({ id: "c" });
    c.statuses.apply("crippled", 10, "a");
    const events = advanceStatuses(c, 1);
    expect(events.some((e) => e.kind === "damage" || e.kind === "heal")).toBe(false);
  });
});

describe("advanceStatuses expiry", () => {
  it("emits status-expired when a status runs out", () => {
    const c = makeCombatant({ id: "c" });
    c.statuses.apply("bleeding", 1, "a");
    const events = advanceStatuses(c, 1.5);
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
    advanceStatuses(c, 1);
    const healthAfterExpiry = c.health;
    advanceStatuses(c, 5);
    expect(c.health).toBe(healthAfterExpiry);
  });
});

describe("effectiveMaxHealth", () => {
  it("is the raw maximum with no statuses", () => {
    expect(effectiveMaxHealth(makeCombatant({ id: "c", maxHealth: 500 }))).toBe(500);
  });

  it("is reduced by deep wound", () => {
    const c = makeCombatant({ id: "c", maxHealth: 500 });
    c.statuses.apply("deep-wound", 10, "a");
    expect(effectiveMaxHealth(c)).toBe(400);
  });

  it("caps regeneration at the deep-wound-reduced maximum, not the raw one", () => {
    const c = makeCombatant({ id: "c", health: 390, maxHealth: 500 });
    c.statuses.apply("deep-wound", 100, "a");
    c.statuses.apply("regeneration", 100, "a");
    for (let i = 0; i < 100; i += 1) {
      advanceStatuses(c, 0.05);
    }
    expect(c.health).toBeLessThanOrEqual(400);
  });
});

describe("attackMisses", () => {
  it("never misses with no blinding status", () => {
    const c = makeCombatant({ id: "c" });
    expect(attackMisses(c, 0)).toBe(false);
    expect(attackMisses(c, 0.99)).toBe(false);
  });

  it("misses on a low roll while blind, and connects on a high one", () => {
    const c = makeCombatant({ id: "c" });
    c.statuses.apply("blind", 10, "a"); // 0.9 miss chance
    expect(attackMisses(c, 0.1)).toBe(true);
    expect(attackMisses(c, 0.95)).toBe(false);
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

    const events = advanceStatuses(c, 1);

    expect(events.some((e) => e.kind === "death")).toBe(true);
    expect(c.dead).toBe(true);
  });

  it("emits no death event on a tick that merely damages", () => {
    const c = makeCombatant({ id: "c", health: 500 });
    c.statuses.apply("burning", 10, "a");
    expect(advanceStatuses(c, 1).some((e) => e.kind === "death")).toBe(false);
  });
});
