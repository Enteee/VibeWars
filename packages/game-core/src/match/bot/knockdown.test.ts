import { describe, expect, it } from "vitest";

import { getSkill } from "../../skills/catalog.js";
import { NO_RANKS } from "../../skills/status.js";
import type { Skill, Surroundings } from "../../skills/types.js";
import { vec2, type Vec2 } from "../../vec2.js";
import type { MatchSimulation } from "../simulation.js";
import { knockdownTarget, knocksDown } from "./knockdown.js";
import { ELEMENTALIST, WARRIOR, fighter, match } from "./rules/test-support.js";

const skill = (id: string): Skill => {
  const found = getSkill(id);
  if (found === undefined) throw new Error(`no skill ${id}`);
  return found;
};

const SHOCK = skill("elementalist.shock");
const GALE = skill("elementalist.gale");
const HAMMER_BASH = skill("warrior.hammer-bash");

describe("knocksDown (#4228)", () => {
  it("is true for Shock and Gale", () => {
    expect(knocksDown(SHOCK)).toBe(true);
    expect(knocksDown(GALE)).toBe(true);
  });

  it("is false for a blockable blow, a conditional knockdown and an area's", () => {
    expect(knocksDown(HAMMER_BASH)).toBe(false);
    expect(knocksDown(skill("elementalist.water-trident"))).toBe(false);
    expect(knocksDown(skill("elementalist.earthquake"))).toBe(false);
  });
});

describe("knockdownTarget (#4228)", () => {
  /**
   * An elementalist at (400, 400), the team's target `t` at (430, 440),
   * a foe `b` at (430, 360) in Gladiator's Defense, and allied warriors
   * at `warriors`, each swinging at `b`.
   */
  function field(warriors: readonly Vec2[], extra: readonly Vec2[] = []): MatchSimulation {
    const sim = match([
      fighter("e", 0, ELEMENTALIST, vec2(400, 400)),
      ...warriors.map((at, index) => fighter(`w${String(index)}`, 0, WARRIOR, at)),
      fighter("t", 1, WARRIOR, vec2(430, 440)),
      fighter("b", 1, WARRIOR, vec2(430, 360)),
      ...extra.map((at, index) => fighter(`x${String(index)}`, 1, WARRIOR, at)),
    ]);
    sim.get("b")?.combatant.statuses.apply("gladiators-defense", 10, "b", NO_RANKS);
    warriors.forEach((_, index) => sim.setTarget(`w${String(index)}`, "b"));
    return sim;
  }

  function aim(sim: MatchSimulation, held = GALE): string | undefined {
    const all = [...sim.participants()];
    const self = all.find((each) => each.id === "e");
    if (self === undefined) throw new Error("no elementalist");
    const surroundings: Surroundings = new Map(all.map((each) => [each.id, each]));
    return knockdownTarget(
      held,
      self,
      all.filter((each) => each.combatant.team === 0),
      all.filter((each) => each.combatant.team === 1),
      "t",
      held.range,
      () => true,
      surroundings,
    );
  }

  it("picks the stancing foe an allied warrior swings at over the team's target", () => {
    expect(aim(field([vec2(460, 360)]))).toBe("b");
  });

  it("leaves a knocked-down foe and one with no block up", () => {
    const down = field([vec2(460, 360)]);
    const b = down.get("b");
    if (b === undefined) throw new Error("no b");
    b.combatant.knockdownRemaining = 2;
    expect(aim(down)).toBeUndefined();
    const open = field([vec2(460, 360)]);
    open.get("b")?.combatant.statuses.remove("gladiators-defense");
    expect(aim(open)).toBeUndefined();
  });

  it("leaves a stancing foe no ally attacker reaches", () => {
    expect(aim(field([vec2(900, 360)]))).toBeUndefined();
  });

  it("never spends a blockable Hammer Bash on it", () => {
    expect(aim(field([vec2(460, 360)]), HAMMER_BASH)).toBeUndefined();
  });

  it("picks the stancing foe with the most allies on it, the team's target on a tie", () => {
    // `b` has one warrior on it; the farther `x0` has two.
    const sim = field([vec2(460, 360), vec2(600, 500), vec2(630, 530)], [vec2(600, 530)]);
    sim.get("x0")?.combatant.statuses.apply("gladiators-defense", 10, "x0", NO_RANKS);
    sim.setTarget("w1", "x0");
    sim.setTarget("w2", "x0");
    expect(aim(sim)).toBe("x0");
    // One on each, and one on the team's target too: the team's target.
    const tie = field([vec2(460, 360), vec2(460, 440)]);
    tie.get("t")?.combatant.statuses.apply("gladiators-defense", 10, "t", NO_RANKS);
    tie.setTarget("w1", "t");
    expect(aim(tie)).toBe("t");
  });
});
