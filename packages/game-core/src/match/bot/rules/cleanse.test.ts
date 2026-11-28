import { describe, expect, it } from "vitest";

import { NO_RANKS, type StatusId } from "../../../skills/status.js";
import { vec2 } from "../../../vec2.js";
import type { MatchSimulation, ParticipantSpec } from "../../simulation.js";
import { punishments } from "../punish.js";
import cleanse from "./cleanse.js";
import { DT, MONK, WARRIOR, askBot, fighter, match, ruleFor, skillsUsed } from "./test-support.js";

describe("play-build cleanses (#1189)", () => {
  it("takes a condition off an ally", () => {
    const sim = match([
      fighter("warrior", 0, WARRIOR, vec2(400, 400)),
      fighter("ally", 0, MONK, vec2(480, 400), { behaviour: undefined }),
      fighter("hexer", 1, WARRIOR, vec2(1550, 750), {
        behaviour: {
          kind: "apply-status-cadence",
          statusId: "bleeding",
          durationSeconds: 20,
          everySeconds: 60,
          targeting: { kind: "fixed", participantId: "ally" },
        },
      }),
    ]);
    // The bleeding lands after the bot's first think: it sees it on its second.
    for (let t = 0; t < 0.5; t += DT) sim.step(DT);
    const cast = sim.get("warrior")?.combatant.cast.activeCast;
    expect(cast).toMatchObject({ skillId: "monk.mend-condition", targetId: "ally" });
    skillsUsed(sim, "warrior", 2);
    expect(sim.get("ally")?.combatant.statuses.has("bleeding")).toBe(false);
  });
});

describe("play-build Recovery (#2491)", () => {
  const ritualist = fighter("rit", 0, MONK, vec2(400, 400), {
    skillBar: ["ritualist.recovery"],
    attributeRanks: new Map([["ritualist.restoration-magic", 12]]),
    maxEnergy: 100,
  });
  const bleeder = (target: string, x = 1550): ParticipantSpec =>
    fighter("bleeder", 1, WARRIOR, vec2(x, 750), {
      behaviour: {
        kind: "apply-status-cadence",
        statusId: "bleeding",
        durationSeconds: 20,
        everySeconds: 20,
        targeting: { kind: "fixed", participantId: target },
      },
    });

  it("casts nothing for a hurt ally with no condition", () => {
    const sim = match([
      ritualist,
      fighter("ally", 0, WARRIOR, vec2(480, 400), {
        behaviour: undefined,
        startHealthFraction: 0.3,
      }),
    ]);
    expect(askBot(sim, "rit").useSkillId).toBeUndefined();
  });

  it("casts it for an ally in its aura bearing a condition, once while the spirit stands", () => {
    const sim = match([
      ritualist,
      fighter("ally", 0, WARRIOR, vec2(480, 400), { behaviour: undefined }),
      bleeder("ally"),
    ]);
    // Bled every 20 s; Recovery lives 54 s against a 30 s recharge.
    expect(skillsUsed(sim, "rit", 3 + 30 + 10)).toEqual(["ritualist.recovery"]);
  });

  it("casts nothing for a bearer outside its aura", () => {
    const sim = match([
      ritualist,
      fighter("ally", 0, WARRIOR, vec2(1500, 400), { behaviour: undefined }),
      bleeder("ally"),
    ]);
    expect(skillsUsed(sim, "rit", 2)).toEqual([]);
  });
});

describe("play-build cleanses a punishing hex first (#4207)", () => {
  const REMOVE_HEX = "monk.remove-hex";
  const MEND_CONDITION = "monk.mend-condition";
  /** Monk "m" with `skillBar`, "near" beside it and "far" across the fight, both in range. */
  const party = (skillBar: string[]) =>
    match([
      fighter("m", 0, MONK, vec2(400, 400), { skillBar }),
      fighter("near", 0, WARRIOR, vec2(440, 400), { behaviour: undefined }),
      fighter("far", 0, WARRIOR, vec2(800, 400), { behaviour: undefined }),
    ]);
  const hex = (sim: MatchSimulation, id: string, statusId: StatusId) =>
    sim.get(id)?.combatant.statuses.apply(statusId, 20, "foe", NO_RANKS);
  const hurt = (sim: MatchSimulation, id: string, fraction: number) => {
    const combatant = sim.get(id)?.combatant;
    if (combatant !== undefined) combatant.health = combatant.maxHealth * fraction;
  };
  const cleansed = (sim: MatchSimulation) => {
    const rule = ruleFor(sim, "m", {
      nearestFirst: (bodies) => [...bodies].sort((a, b) => a.position.x - b.position.x),
    });
    return cleanse.decide(rule);
  };

  it("takes Backfire off the far ally before a plain hex off the near one", () => {
    const sim = party([REMOVE_HEX]);
    hex(sim, "near", "imagined-burden");
    hex(sim, "far", "backfire");
    expect(cleansed(sim)).toMatchObject({ useSkillId: REMOVE_HEX, targetId: "far" });
  });

  it("takes the dearer punishment first: Backfire before Empathy", () => {
    const sim = party([REMOVE_HEX]);
    hex(sim, "near", "empathy");
    hex(sim, "far", "backfire");
    const [near, far] = [sim.get("near"), sim.get("far")];
    if (near === undefined || far === undefined) throw new Error("no allies");
    expect(punishments(far).cost).toBeGreaterThan(punishments(near).cost);
    expect(cleansed(sim)).toMatchObject({ targetId: "far" });
  });

  it("with no punishing hex, the more hurt first, and at equal health the nearer", () => {
    const sim = party([REMOVE_HEX]);
    hex(sim, "near", "imagined-burden");
    hex(sim, "far", "imagined-burden");
    expect(cleansed(sim)).toMatchObject({ targetId: "near" });
    hurt(sim, "far", 0.5);
    expect(cleansed(sim)).toMatchObject({ targetId: "far" });
  });

  it("skips a Backfired ally its bar cannot help for one with a condition", () => {
    const sim = party([MEND_CONDITION]);
    hex(sim, "near", "backfire");
    hex(sim, "far", "weakness");
    expect(cleansed(sim)).toMatchObject({ useSkillId: MEND_CONDITION, targetId: "far" });
  });
});
