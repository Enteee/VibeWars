import { describe, expect, it } from "vitest";

import { NO_RANKS } from "../../skills/status.js";
import { vec2 } from "../../vec2.js";
import { createCursor, decide, type BehaviourContext } from "../behaviour.js";
import type { MatchSimulation, ParticipantSpec } from "../simulation.js";
import { BOT, MONK, WARRIOR, contextFor, fighter, match } from "./rules/test-support.js";

const STRIP = "necromancer.strip-enchantment";

/** A bar of `skills`, the rest empty. */
const bar = (...skills: string[]) => [...skills, ...Array<null>(8 - skills.length).fill(null)];

/**
 * Team 0: the bot warrior `w` at (400, 400) and `team`. Team 1: the
 * warrior `t` at (440, 400), hurt so it is the team's target, and the
 * warrior `o` at (470, 440).
 */
function field(team: ParticipantSpec[] = []): MatchSimulation {
  const sim = match([
    fighter("w", 0, WARRIOR, vec2(400, 400), { skillBar: bar() }),
    ...team,
    fighter("t", 1, WARRIOR, vec2(440, 400), { skillBar: bar() }),
    fighter("o", 1, WARRIOR, vec2(470, 440), { skillBar: bar() }),
  ]);
  const target = sim.get("t")?.combatant;
  if (target === undefined) throw new Error("no t");
  target.health = target.maxHealth * 0.8;
  return sim;
}

/** A teammate `s` with Strip Enchantment on its bar. */
const stripper = () => fighter("s", 0, WARRIOR, vec2(380, 420), { skillBar: bar(STRIP) });

function protect(sim: MatchSimulation, id: string) {
  sim.get(id)?.combatant.statuses.apply("protective-spirit", 10, "x", NO_RANKS);
}

function teamTarget(sim: MatchSimulation, extra: Partial<BehaviourContext> = {}) {
  return decide(BOT, createCursor(), contextFor(sim, "w", extra)).targetId;
}

describe("protected swap (#4269)", () => {
  it("leaves a protected foe for another with no strip on the team, and back once it ends", () => {
    const sim = field();
    expect(teamTarget(sim)).toBe("t");
    protect(sim, "t");
    expect(teamTarget(sim)).toBe("o");
    sim.get("t")?.combatant.statuses.clear();
    expect(teamTarget(sim)).toBe("t");
  });

  it("keeps the protected foe while a bot teammate has a strip, ready or recharging", () => {
    const sim = field([stripper()]);
    protect(sim, "t");
    expect(teamTarget(sim)).toBe("t");
    sim.get("s")?.combatant.cast.startRecharge(STRIP, 10);
    expect(teamTarget(sim)).toBe("t");
  });

  it("does not count a human teammate's strip", () => {
    const sim = field([stripper()]);
    protect(sim, "t");
    expect(teamTarget(sim, { isBot: (id) => id !== "s" })).toBe("o");
  });

  it("fights a human's call on the protected foe", () => {
    const sim = field();
    protect(sim, "t");
    expect(teamTarget(sim, { calledTargetId: "t" })).toBe("t");
  });

  it("keeps today's pick with every foe protected", () => {
    const sim = field();
    protect(sim, "t");
    protect(sim, "o");
    expect(teamTarget(sim)).toBe("t");
  });

  it("still peels a protected diver off the healer", () => {
    const sim = field([fighter("m", 0, MONK, vec2(420, 380), { skillBar: bar() })]);
    sim.setTarget("t", "m");
    protect(sim, "t");
    expect(teamTarget(sim)).toBe("t");
  });
});
