import { describe, expect, it } from "vitest";

import { NO_RANKS } from "../../skills/status.js";
import { vec2 } from "../../vec2.js";
import { CAPTURE_SECONDS, MAX_PIPS } from "../capture-points.js";
import { MatchSimulation } from "../simulation.js";
import { createCursor } from "../behaviour.js";
import { DT, MONK, RULESET, BOUNDS, contextFor, fighter, match } from "./rules/test-support.js";
import { PLAN_SECONDS, flankParty, placedFlank, planKey, planPhase } from "./plan.js";
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

  it("starts over at a shrine changing hands, with nobody dying", () => {
    const shrine = { ...vec2(300, 400), layer: 0 };
    const sim = new MatchSimulation({
      seed: "bot",
      ruleset: RULESET,
      bounds: BOUNDS,
      participants: [
        fighter("a1", 0, MONK, vec2(700, 380)),
        fighter("a2", 0, MONK, vec2(700, 420)),
        fighter("b1", 1, MONK, vec2(900, 380)),
        fighter("b2", 1, MONK, vec2(900, 420)),
      ],
      capturePoints: [shrine],
    });
    const capper = sim.get("a1");
    if (capper === undefined) throw new Error("no a1");
    // Held on the shrine until it is theirs, a pip a time: the bot would
    // walk back to the fight. Its mate stays in contact.
    let taken = 0;
    while (sim.capturePoints[0]?.owner !== 0) {
      capper.position = vec2(shrine.x, shrine.y);
      sim.step(DT);
      taken = sim.elapsedSeconds;
      if (taken > MAX_PIPS * CAPTURE_SECONDS + 1) throw new Error("shrine not taken");
    }
    expect(taken).toBeGreaterThan(1);
    run(sim, STALEMATE_SECONDS + 1 - taken);
    expect(dead(sim)).toEqual([]);
    expect([sim.planOverride(0), sim.planOverride(1)]).toEqual([undefined, undefined]);
  });

  it("keeps who flanks, the waypoint and a reached flank across a phase boundary", () => {
    const sim = monks();
    run(sim, STALEMATE_SECONDS + 1);
    const team = [0, 1].find((each) => sim.planOverride(each)?.plan === "flank");
    if (team === undefined) throw new Error("no forced flank");
    const until = sim.planOverride(team)?.until ?? 0;
    const boundary = planPhase(until) * PLAN_SECONDS;
    expect(boundary).toBeGreaterThan(sim.elapsedSeconds);
    run(sim, boundary - 1 - sim.elapsedSeconds);
    const mates = [...sim.participants()].filter((each) => each.combatant.team === team);
    /** `id`'s view, with the sim's overrides. */
    const view = (id: string) =>
      contextFor(sim, id, { planOverride: (each) => sim.planOverride(each) });
    const before = view(mates[0]?.id ?? "");
    const flankers = mates.filter((each) => flankParty(before, each, planKey(before, team)));
    expect(flankers.length).toBe(1);
    const flanker = flankers[0];
    if (flanker === undefined) throw new Error("no flanker");
    const cursor = createCursor();
    const waypoint = placedFlank(view(flanker.id), flanker, cursor, 1 - team);
    cursor.flankReached = planKey(before, team);
    run(sim, 2);
    const after = view(flanker.id);
    expect(planPhase(after.now)).toBe(planPhase(before.now) + 1);
    expect(mates.filter((each) => flankParty(after, each, planKey(after, team)))).toEqual(flankers);
    expect(placedFlank(after, flanker, cursor, 1 - team)).toEqual(waypoint);
    expect(cursor.flankReached).toBe(planKey(after, team));
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
