import { describe, expect, it } from "vitest";

import { NO_RANKS } from "../../skills/status.js";
import { vec2 } from "../../vec2.js";
import { DT, MONK, fighter, match } from "./rules/test-support.js";
import { PLAN_SECONDS } from "./plan.js";
import { STALEMATE_CONTACT, STALEMATE_SECONDS, nextPlan, stalemate } from "./stalemate.js";

describe("stalemate (#3834)", () => {
  it("is none before 45 s, however long the contact", () => {
    expect(stalemate({ since: 0, contactSeconds: 44 }, STALEMATE_SECONDS - 1)).toBe(false);
  });

  it("is none with fewer than 30 contact seconds: standing apart is a hold", () => {
    expect(stalemate({ since: 0, contactSeconds: STALEMATE_CONTACT - 1 }, 90)).toBe(false);
  });

  it("is one at 45 s with 30 contact seconds or more", () => {
    expect(
      stalemate({ since: 10, contactSeconds: STALEMATE_CONTACT }, 10 + STALEMATE_SECONDS),
    ).toBe(true);
  });
});

describe("nextPlan (#3834)", () => {
  it("flanks from a push, pushes from a flank or a hold", () => {
    expect(nextPlan("push", true)).toBe("flank");
    expect(nextPlan("flank", true)).toBe("push");
    expect(nextPlan("hold", false)).toBe("push");
  });

  it("does not switch a push with no flank waypoint", () => {
    expect(nextPlan("push", false)).toBeUndefined();
  });
});

describe("a bot team in a stalemate in the simulation (#3834)", () => {
  /** Two monk pairs a cast apart: they heal faster than their wands hurt. */
  const monks = () =>
    match([
      fighter("a1", 0, MONK, vec2(700, 380)),
      fighter("a2", 0, MONK, vec2(700, 420)),
      fighter("b1", 1, MONK, vec2(900, 380)),
      fighter("b2", 1, MONK, vec2(900, 420)),
    ]);
  const run = (sim: ReturnType<typeof match>, seconds: number) => {
    for (let t = 0; t < seconds; t += DT) sim.step(DT);
  };
  const dead = (sim: ReturnType<typeof match>) =>
    [...sim.participants()].filter((each) => each.combatant.dead).map((each) => each.id);

  it("switches a team's plan after 45 s in contact with nobody dying, for 40 s", () => {
    const sim = monks();
    run(sim, STALEMATE_SECONDS - 1);
    expect(dead(sim)).toEqual([]);
    expect([sim.planOverride(0), sim.planOverride(1)]).toEqual([undefined, undefined]);
    run(sim, 2);
    expect(dead(sim)).toEqual([]);
    const switched = [0, 1].flatMap((team) => {
      const override = sim.planOverride(team);
      return override === undefined ? [] : [{ override }];
    });
    expect(switched.length).toBeGreaterThan(0);
    for (const { override } of switched) {
      expect(override.until).toBeCloseTo(STALEMATE_SECONDS + PLAN_SECONDS, 0);
    }
  });

  it("starts over at a death: no switch 45 s from the start, one 45 s after it", () => {
    const sim = monks();
    run(sim, 30);
    const victim = sim.get("b2");
    if (victim === undefined) throw new Error("no b2");
    victim.combatant.statuses.apply("burning", 10, "x", NO_RANKS);
    victim.combatant.health = 0.2;
    sim.step(DT);
    expect(dead(sim)).toEqual(["b2"]);
    run(sim, STALEMATE_SECONDS + 1 - 30);
    expect([sim.planOverride(0), sim.planOverride(1)]).toEqual([undefined, undefined]);
    // The kill moves the score too, which the next whole second counts.
    run(sim, 32);
    expect([sim.planOverride(0), sim.planOverride(1)].some((each) => each !== undefined)).toBe(
      true,
    );
  });

  it("does not switch a team with an active human", () => {
    const sim = match([
      fighter("you", 0, MONK, vec2(700, 380), { behaviour: undefined }),
      fighter("a2", 0, MONK, vec2(700, 420)),
      fighter("b1", 1, MONK, vec2(900, 380)),
      fighter("b2", 1, MONK, vec2(900, 420)),
    ]);
    for (let t = 0; t < STALEMATE_SECONDS + 1; t += DT) {
      // A human keeps giving commands: it stays active.
      sim.setTarget("you", "b1");
      sim.step(DT);
    }
    expect(sim.planOverride(0)).toBeUndefined();
    expect(sim.planOverride(1)).toBeDefined();
  });
});
