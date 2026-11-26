import { describe, expect, it } from "vitest";

import { getSkill } from "./catalog.js";
import {
  CHAIN_MARK_SECONDS,
  chainAllows,
  clearChainMarksOn,
  markChain,
  tickChainMarks,
} from "./chain.js";
import { makeCombatant } from "./testing.js";
import type { Skill } from "./types.js";

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

const LEAD = skill("assassin.jagged-strike");
const OFF_HAND = skill("assassin.fox-fangs");
const PLAIN = skill("warrior.sever-artery");

describe("dagger chain marks (#831)", () => {
  it("a lead attack opens a chain anywhere; an off-hand needs your lead mark there", () => {
    const you = makeCombatant({ id: "you" });
    expect(chainAllows(you, LEAD, "foe")).toBe(true);
    expect(chainAllows(you, PLAIN, "foe")).toBe(true);
    expect(chainAllows(you, OFF_HAND, "foe")).toBe(false);
    markChain(you, LEAD, "foe");
    expect(chainAllows(you, OFF_HAND, "foe")).toBe(true);
    expect(chainAllows(you, OFF_HAND, "other")).toBe(false);
  });

  it("another attacker's lead mark opens nothing for you", () => {
    const you = makeCombatant({ id: "you" });
    const ally = makeCombatant({ id: "ally" });
    markChain(ally, LEAD, "foe");
    expect(chainAllows(you, OFF_HAND, "foe")).toBe(false);
  });

  it("an off-hand mark replaces the lead, and a lead sets it back", () => {
    const you = makeCombatant({ id: "you" });
    markChain(you, LEAD, "foe");
    markChain(you, OFF_HAND, "foe");
    expect(you.chainMarks.get("foe")?.role).toBe("off-hand");
    expect(chainAllows(you, OFF_HAND, "foe")).toBe(false);
    markChain(you, LEAD, "foe");
    expect(you.chainMarks.get("foe")?.role).toBe("lead");
  });

  it("a non-chain attack leaves no mark and changes none", () => {
    const you = makeCombatant({ id: "you" });
    markChain(you, PLAIN, "other");
    expect(you.chainMarks.has("other")).toBe(false);
    markChain(you, LEAD, "foe");
    markChain(you, PLAIN, "foe");
    expect(you.chainMarks.get("foe")?.role).toBe("lead");
  });

  it("each target keeps its own mark", () => {
    const you = makeCombatant({ id: "you" });
    markChain(you, LEAD, "a");
    markChain(you, LEAD, "b");
    markChain(you, OFF_HAND, "b");
    expect(chainAllows(you, OFF_HAND, "a")).toBe(true);
    expect(chainAllows(you, OFF_HAND, "b")).toBe(false);
  });

  it(`lasts ${String(CHAIN_MARK_SECONDS)} s from the hit, and is there at 14.9 s`, () => {
    const you = makeCombatant({ id: "you" });
    markChain(you, LEAD, "foe");
    // 20 Hz ticks: 298 of them are 14.9 s, two more are 15 s.
    const dt = 0.05;
    for (let tick = 0; tick < 298; tick += 1) {
      tickChainMarks(you, dt);
    }
    expect(chainAllows(you, OFF_HAND, "foe")).toBe(true);
    tickChainMarks(you, dt);
    tickChainMarks(you, dt);
    expect(you.chainMarks.has("foe")).toBe(false);
  });

  it("a hit renews the mark's time", () => {
    const you = makeCombatant({ id: "you" });
    markChain(you, LEAD, "foe");
    tickChainMarks(you, 10);
    markChain(you, LEAD, "foe");
    tickChainMarks(you, 10);
    expect(chainAllows(you, OFF_HAND, "foe")).toBe(true);
  });

  it("a death clears every mark on the dead and every mark they placed", () => {
    const you = makeCombatant({ id: "you" });
    const foe = makeCombatant({ id: "foe", team: 1 });
    markChain(you, LEAD, "foe");
    markChain(you, LEAD, "other");
    markChain(foe, LEAD, "you");
    clearChainMarksOn([you, foe], "foe");
    expect([...you.chainMarks.keys()]).toEqual(["other"]);
    expect(foe.chainMarks.size).toBe(0);
  });
});
