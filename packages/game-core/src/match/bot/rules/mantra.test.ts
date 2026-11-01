import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../../../equipment/resolve.js";
import { vec2, type Vec2 } from "../../../vec2.js";
import { type ParticipantSpec } from "../../simulation.js";
import { NO_RANKS } from "../../../skills/status.js";
import { BOT, ELEMENTALIST, RANGER, askBot, fighter, match, slotOf } from "./test-support.js";

describe("play-build raises a mantra before it is needed (#1964)", () => {
  const mesmer = (id: string, team: number, spawn: Vec2, skillBar: string[]) =>
    ({
      id,
      team,
      skillBar,
      attributeRanks: new Map([["mesmer.inspiration-magic", 12]]),
      equipment: unarmedResolvedEquipment(60),
      maxEnergy: 60,
      spawn,
      facing: 0,
      behaviour: team === 0 ? BOT : undefined,
    }) satisfies ParticipantSpec;

  it("Mantra of Flame against a foe in reach whose skills burn, not one whose skills freeze", () => {
    const bar = ["mesmer.mantra-of-flame"];
    const burning = match([
      mesmer("m", 0, vec2(0, 0), bar),
      mesmer("e", 1, vec2(300, 0), ["elementalist.fireball", "elementalist.flare"]),
    ]);
    expect(askBot(burning, "m")).toMatchObject({ useSkillId: "mesmer.mantra-of-flame" });
    const freezing = match([
      mesmer("m", 0, vec2(0, 0), bar),
      mesmer("e", 1, vec2(300, 0), ["elementalist.ice-spikes"]),
    ]);
    expect(askBot(freezing, "m").useSkillId).toBeUndefined();
  });

  it("Mantra of Concentration with a long cast on its bar and an interrupter in reach", () => {
    const bar = ["mesmer.mantra-of-concentration", "elementalist.kinetic-armor"];
    const threatened = match([
      mesmer("m", 0, vec2(0, 0), bar),
      mesmer("e", 1, vec2(300, 0), ["mesmer.power-spike"]),
    ]);
    expect(askBot(threatened, "m")).toMatchObject({
      useSkillId: "mesmer.mantra-of-concentration",
    });
    const safe = match([
      mesmer("m", 0, vec2(0, 0), bar),
      mesmer("e", 1, vec2(300, 0), ["elementalist.flare"]),
    ]);
    expect(askBot(safe, "m").useSkillId).not.toBe("mesmer.mantra-of-concentration");
  });

  it("aims no interrupt at a foe whose guard would stop it", () => {
    const sim = match([
      fighter("ranger", 0, RANGER, vec2(400, 400), {
        behaviour: undefined,
        skillBar: ["mesmer.power-drain"],
      }),
      fighter("foe", 1, ELEMENTALIST, vec2(700, 400), { behaviour: undefined }),
    ]);
    sim.get("foe")?.combatant.statuses.apply("mantra-of-concentration", 31, "foe", NO_RANKS);
    sim.setTarget("foe", "ranger");
    sim.requestSkill("foe", slotOf(ELEMENTALIST, "elementalist.chain-lightning"));
    expect(sim.get("foe")?.combatant.cast.activeCast?.remainingSeconds).toBe(2);
    expect(askBot(sim, "ranger").useSkillId).toBeUndefined();
  });
});
