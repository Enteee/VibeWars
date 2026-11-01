import { describe, expect, it } from "vitest";

import { NO_RANKS } from "../../../skills/status.js";
import { vec2, type Vec2 } from "../../../vec2.js";
import type { MatchSimulation, ParticipantSpec } from "../../simulation.js";
import { BOT, askBot, body, match, uses } from "./test-support.js";

describe("play-build's minion care (#1986)", () => {
  const BLOOD = "necromancer.blood-of-the-master";
  const VERATA = "necromancer.veratas-sacrifice";
  const BOND = "necromancer.dark-bond";
  const JAGGED = "necromancer.jagged-bones";

  /** A minion of `ownerId`'s at `spawn`, at `healthFraction` of its Health. */
  const minion = (id: string, ownerId: string, spawn: Vec2, healthFraction = 1): ParticipantSpec =>
    body(id, 0, spawn, {
      startHealthFraction: healthFraction,
      creature: {
        ownerId,
        kind: "minion",
        look: "bone-minion",
        name: id,
        expiresInSeconds: Number.POSITIVE_INFINITY,
        ageSeconds: 0,
        summonedAtTick: 0,
        skillId: undefined,
        aura: undefined,
        onDeath: "vanish",
        ownerDisableSeconds: 0,
        deathBurst: undefined,
        onDeathInRange: undefined,
        replacedBy: undefined,
        corpsesLeft: 0,
        companionSkillId: undefined,
        leaderId: undefined,
        mode: "guard",
      },
    });
  /** `n`, a bot with `skillBar` at `healthFraction`, its ally `a`, and `extra`. */
  const sim = (skillBar: string[], extra: ParticipantSpec[], healthFraction = 1): MatchSimulation =>
    match([
      body("n", 0, vec2(400, 400), {
        skillBar,
        behaviour: BOT,
        maxEnergy: 100,
        startHealthFraction: healthFraction,
        attributeRanks: new Map([
          ["necromancer.death-magic", 12],
          ["necromancer.blood-magic", 12],
        ]),
      }),
      body("a", 0, vec2(360, 400)),
      body("foe", 1, vec2(1200, 400)),
      ...extra,
    ]);

  it("is each skill's only use", () => {
    for (const id of [BLOOD, VERATA, BOND, JAGGED]) {
      expect(uses(id)).toEqual(["minion-care"]);
    }
  });

  it("casts Blood of the Master once two allied minions, anyone's, are hurt", () => {
    const one = sim([BLOOD], [minion("m1", "n", vec2(420, 400), 0.4)]);
    expect(askBot(one, "n").useSkillId).toBeUndefined();
    const two = sim(
      [BLOOD],
      [minion("m1", "n", vec2(420, 400), 0.4), minion("m2", "a", vec2(340, 400), 0.4)],
    );
    expect(askBot(two, "n")).toMatchObject({ useSkillId: BLOOD, targetId: "n" });
  });

  it("pays no sacrifice at half its Health or less", () => {
    const fight = sim(
      [BLOOD],
      [minion("m1", "n", vec2(420, 400), 0.4), minion("m2", "n", vec2(420, 440), 0.4)],
      0.5,
    );
    expect(askBot(fight, "n").useSkillId).toBeUndefined();
  });

  it("casts Verata's Sacrifice once its minions bear two conditions", () => {
    const fight = sim([VERATA], [minion("m1", "n", vec2(420, 400))]);
    const m1 = fight.get("m1")?.combatant;
    m1?.statuses.apply("bleeding", 10, "foe", NO_RANKS);
    expect(askBot(fight, "n").useSkillId).toBeUndefined();
    m1?.statuses.apply("poison", 10, "foe", NO_RANKS);
    expect(askBot(fight, "n")).toMatchObject({ useSkillId: VERATA, targetId: "n" });
  });

  it("keeps Dark Bond up over two minions", () => {
    const one = sim([BOND], [minion("m1", "n", vec2(420, 400))]);
    expect(askBot(one, "n").useSkillId).toBeUndefined();
    const two = sim([BOND], [minion("m1", "n", vec2(420, 400)), minion("m2", "n", vec2(420, 440))]);
    expect(askBot(two, "n")).toMatchObject({ useSkillId: BOND, targetId: "n" });
    two.get("n")?.combatant.statuses.apply("dark-bond", 54, "n", NO_RANKS);
    expect(askBot(two, "n").useSkillId).toBeUndefined();
  });

  it("puts Jagged Bones on its own most hurt minion that lacks it", () => {
    const fight = sim(
      [JAGGED],
      [
        minion("m1", "n", vec2(420, 400), 0.9),
        minion("m2", "n", vec2(420, 440), 0.3),
        minion("theirs", "a", vec2(340, 400), 0.1),
      ],
    );
    expect(askBot(fight, "n")).toMatchObject({ useSkillId: JAGGED, targetId: "m2" });
    fight.get("m2")?.combatant.statuses.apply("jagged-bones", 60, "n", NO_RANKS);
    expect(askBot(fight, "n")).toMatchObject({ useSkillId: JAGGED, targetId: "m1" });
  });
});
