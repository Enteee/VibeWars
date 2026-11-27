import { describe, expect, it } from "vitest";

import { getSkill } from "../../skills/catalog.js";
import { NO_RANKS } from "../../skills/status.js";
import type { Skill } from "../../skills/types.js";
import { vec2, type Vec2 } from "../../vec2.js";
import type { MatchSimulation } from "../simulation.js";
import { snareStatus, snareTarget } from "./snare.js";
import { MONK, RANGER, WARRIOR, fighter, match } from "./rules/test-support.js";

const skill = (id: string): Skill => {
  const found = getSkill(id);
  if (found === undefined) throw new Error(`no skill ${id}`);
  return found;
};

const CRIPPLING_SHOT = skill("ranger.crippling-shot");

describe("snareStatus (#4156)", () => {
  it("finds the Crippled Pin Down and Crippling Shot lay", () => {
    expect(snareStatus(skill("ranger.pin-down"))).toBe("crippled");
    expect(snareStatus(CRIPPLING_SHOT)).toBe("crippled");
  });

  it("finds a cripple inside an if", () => {
    expect(snareStatus(skill("assassin.leaping-mantis-sting"))).toBe("crippled");
  });

  it("is nothing for a skill that only deals damage", () => {
    expect(snareStatus(skill("ranger.hunters-shot"))).toBeUndefined();
    expect(snareStatus(skill("elementalist.fireball"))).toBeUndefined();
  });
});

describe("snareTarget (#4156)", () => {
  /** A ranger at (400, 400), its monk at (300, 600), the team's target `t` at (900, 400), and `d` at `diver`. */
  function field(diver: Vec2, elbow?: Vec2): MatchSimulation {
    return match([
      fighter("r", 0, RANGER, vec2(400, 400)),
      fighter("monk", 0, MONK, vec2(300, 600)),
      fighter("t", 1, WARRIOR, vec2(900, 400)),
      fighter("d", 1, WARRIOR, diver),
      ...(elbow === undefined ? [] : [fighter("e", 1, WARRIOR, elbow)]),
    ]);
  }

  function aim(sim: MatchSimulation, range = CRIPPLING_SHOT.range): string | undefined {
    const all = [...sim.participants()];
    const self = all.find((each) => each.id === "r");
    if (self === undefined) throw new Error("no ranger");
    return snareTarget(
      CRIPPLING_SHOT,
      self,
      all.filter((each) => each.combatant.team === 0),
      all.filter((each) => each.combatant.team === 1),
      range,
      () => true,
    );
  }

  it("picks a foe at its elbow over a diver", () => {
    const sim = field(vec2(340, 600), vec2(430, 400));
    sim.setTarget("d", "monk");
    sim.setTarget("e", "r");
    expect(aim(sim)).toBe("e");
  });

  it("picks the foe diving its healer", () => {
    const sim = field(vec2(340, 600));
    expect(aim(sim)).toBeUndefined();
    sim.setTarget("d", "monk");
    expect(aim(sim)).toBe("d");
  });

  it("leaves a diver already crippled to the team's target", () => {
    const sim = field(vec2(340, 600));
    sim.setTarget("d", "monk");
    sim.get("d")?.combatant.statuses.apply("crippled", 10, "x", NO_RANKS);
    expect(aim(sim)).toBeUndefined();
  });

  it("leaves a diver out of range to the team's target", () => {
    const sim = field(vec2(340, 600));
    sim.setTarget("d", "monk");
    expect(aim(sim, 100)).toBeUndefined();
  });

  it("is nothing for a skill that is no snare", () => {
    const sim = field(vec2(340, 600));
    sim.setTarget("d", "monk");
    const all = [...sim.participants()];
    const self = all.find((each) => each.id === "r");
    if (self === undefined) throw new Error("no ranger");
    expect(
      snareTarget(skill("ranger.hunters-shot"), self, all, all, CRIPPLING_SHOT.range, () => true),
    ).toBeUndefined();
  });
});
