import { describe, expect, it } from "vitest";

import { vec2 } from "../../../vec2.js";
import { NO_RANKS, type StatusId } from "../../../skills/status.js";
import type { MatchSimulation, ParticipantSpec } from "../../simulation.js";
import { DT, MONK, WARRIOR, askBot, fighter, match, skillsUsed } from "./test-support.js";

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

describe("play-build cleanse order (#4207)", () => {
  /** Puts `status` on `id`, as a foe's hex or condition lands. */
  function lands(sim: MatchSimulation, id: string, status: StatusId): void {
    sim.get(id)?.combatant.statuses.apply(status, 10, "foe", NO_RANKS);
  }

  /** A monk with `bar`, an ally near it and one further off, both in range. */
  function party(bar: readonly string[], nearHealth = 1, farHealth = 1): MatchSimulation {
    return match([
      fighter("m", 0, MONK, vec2(400, 400), { skillBar: [...bar] }),
      fighter("near", 0, WARRIOR, vec2(480, 400), {
        behaviour: undefined,
        startHealthFraction: nearHealth,
      }),
      fighter("far", 0, WARRIOR, vec2(700, 400), {
        behaviour: undefined,
        startHealthFraction: farHealth,
      }),
    ]);
  }

  it("takes Backfire off the far ally before a plain hex off the near one", () => {
    const sim = party(["monk.remove-hex"]);
    lands(sim, "near", "diversion");
    lands(sim, "far", "backfire");
    expect(askBot(sim, "m")).toMatchObject({ useSkillId: "monk.remove-hex", targetId: "far" });
  });

  it("takes the costlier punishing hex first: Backfire (119) before Empathy (39)", () => {
    const sim = party(["monk.remove-hex"]);
    lands(sim, "near", "empathy");
    lands(sim, "far", "backfire");
    expect(askBot(sim, "m")).toMatchObject({ useSkillId: "monk.remove-hex", targetId: "far" });
  });

  it("without a punishing hex, cleanses the most hurt ally first", () => {
    const sim = party(["monk.remove-hex"], 0.9, 0.5);
    lands(sim, "near", "diversion");
    lands(sim, "far", "diversion");
    expect(askBot(sim, "m")).toMatchObject({ useSkillId: "monk.remove-hex", targetId: "far" });
  });

  it("at equal health, cleanses the nearer ally", () => {
    const sim = party(["monk.remove-hex"]);
    lands(sim, "near", "diversion");
    lands(sim, "far", "diversion");
    expect(askBot(sim, "m")).toMatchObject({ useSkillId: "monk.remove-hex", targetId: "near" });
  });

  it("skips a Backfired ally its bar cannot help for one with a condition", () => {
    const sim = party(["monk.mend-condition"]);
    lands(sim, "near", "backfire");
    lands(sim, "far", "bleeding");
    expect(askBot(sim, "m")).toMatchObject({ useSkillId: "monk.mend-condition", targetId: "far" });
  });
});
