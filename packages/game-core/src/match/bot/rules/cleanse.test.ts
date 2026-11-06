import { describe, expect, it } from "vitest";

import { vec2 } from "../../../vec2.js";
import type { ParticipantSpec } from "../../simulation.js";
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
