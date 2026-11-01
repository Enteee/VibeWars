import { describe, expect, it } from "vitest";

import { NO_RANKS } from "../../../skills/status.js";
import { vec2 } from "../../../vec2.js";
import type { MatchSimulation, ParticipantSpec } from "../../simulation.js";
import { MONK, WARRIOR, askBot, fighter, match } from "./test-support.js";

describe("play-build boosts its side's attacks as the fight is on (#2000)", () => {
  const ORDER_OF_PAIN = "necromancer.order-of-pain";
  const ORDER_OF_THE_VAMPIRE = "necromancer.order-of-the-vampire";
  const FOR_GREAT_JUSTICE = "warrior.for-great-justice";

  /** A necromancer with only `skillBar`, a warrior of its side, and a foe `foeX` off. */
  function orderer(
    foeX: number,
    extra: Partial<ParticipantSpec> = {},
    skillBar = [ORDER_OF_PAIN],
  ): MatchSimulation {
    return match([
      fighter("n", 0, MONK, vec2(0, 400), { skillBar, ...extra }),
      fighter("w", 0, WARRIOR, vec2(300, 400), { behaviour: undefined }),
      fighter("foe", 1, WARRIOR, vec2(foeX, 400), { behaviour: undefined }),
    ]);
  }

  it("orders its party once a warrior of its side reaches a foe, not with none in reach", () => {
    expect(askBot(orderer(330), "n")).toMatchObject({ useSkillId: ORDER_OF_PAIN, targetId: "n" });
    expect(askBot(orderer(1400), "n").useSkillId).toBeUndefined();
  });

  it("never recasts an order it still holds", () => {
    const sim = orderer(330);
    sim.get("n")?.combatant.statuses.apply("order-of-pain", 5, "n", NO_RANKS);
    expect(askBot(sim, "n").useSkillId).toBeUndefined();
  });

  it("never pays its 17% Health to go below half", () => {
    expect(askBot(orderer(330, { startHealthFraction: 0.6 }), "n").useSkillId).toBeUndefined();
    expect(askBot(orderer(330, { startHealthFraction: 0.7 }), "n").useSkillId).toBe(ORDER_OF_PAIN);
  });

  it("counts Awaken the Blood's larger sacrifice: 25.5% at 70% Health is too much", () => {
    const sim = orderer(330, { startHealthFraction: 0.7 });
    sim.get("n")?.combatant.statuses.apply("awaken-the-blood", 20, "n", NO_RANKS);
    expect(askBot(sim, "n").useSkillId).toBeUndefined();
  });

  it("orders the vampire for a party under no other Necromancer enchantment only", () => {
    const vampire = () => orderer(330, {}, [ORDER_OF_THE_VAMPIRE]);
    expect(askBot(vampire(), "n")).toMatchObject({
      useSkillId: ORDER_OF_THE_VAMPIRE,
      targetId: "n",
    });
    const sim = vampire();
    for (const id of ["n", "w"]) {
      sim.get(id)?.combatant.statuses.apply("order-of-pain", 5, "n", NO_RANKS);
    }
    expect(askBot(sim, "n").useSkillId).toBeUndefined();
  });

  it('shouts "For Great Justice!" with a foe in its own reach only', () => {
    const shouter = (foeX: number) =>
      match([
        fighter("w", 0, WARRIOR, vec2(300, 400), { skillBar: [FOR_GREAT_JUSTICE] }),
        fighter("foe", 1, WARRIOR, vec2(foeX, 400), { behaviour: undefined }),
      ]);
    expect(askBot(shouter(330), "w").useSkillId).toBe(FOR_GREAT_JUSTICE);
    expect(askBot(shouter(600), "w").useSkillId).toBeUndefined();
  });
});
