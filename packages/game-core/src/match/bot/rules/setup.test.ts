import { describe, expect, it } from "vitest";

import { NO_RANKS } from "../../../skills/status.js";
import { vec2 } from "../../../vec2.js";
import type { MatchSimulation } from "../../simulation.js";
import { ELEMENTALIST, MONK, WARRIOR, askBot, fighter, match } from "./test-support.js";

describe("play-build's setups (#1975)", () => {
  const DARK = "assassin.dark-apostasy";
  const ORDER = "necromancer.order-of-apostasy";
  const sim = (skillBar: string[]): MatchSimulation =>
    match([
      fighter("a", 0, WARRIOR, vec2(400, 400), { behaviour: undefined, skillBar }),
      fighter("b", 0, WARRIOR, vec2(400, 440), { behaviour: undefined, skillBar: [] }),
      fighter("foe", 1, WARRIOR, vec2(480, 400), { behaviour: undefined, skillBar: [] }),
    ]);
  const enchant = (fight: MatchSimulation): void => {
    fight.get("foe")?.combatant.statuses.apply("vital-blessing", 30, "x", NO_RANKS);
  };

  it("casts Dark Apostasy only at an enchanted foe", () => {
    const bare = sim([DARK]);
    expect(askBot(bare, "a").useSkillId).toBeUndefined();
    const fight = sim([DARK]);
    enchant(fight);
    expect(askBot(fight, "a")).toMatchObject({ useSkillId: DARK, targetId: "a" });
  });

  it("casts Order of Apostasy once two of the party hit an enchanted foe", () => {
    const fight = sim([ORDER]);
    enchant(fight);
    fight.requestAttack("a", "foe");
    expect(askBot(fight, "a").useSkillId).toBeUndefined();
    fight.requestAttack("b", "foe");
    expect(askBot(fight, "a")).toMatchObject({ useSkillId: ORDER, targetId: "a" });
  });
});

describe("play-build puts Air of Enchantment before a dear enchantment (#1975)", () => {
  const AIR = "monk.air-of-enchantment";
  const PROTECT = "monk.protective-spirit";
  const hurt = (bears: boolean): MatchSimulation => {
    const sim = match([
      fighter("monk", 0, MONK, vec2(400, 400), { skillBar: [PROTECT, AIR] }),
      fighter("ally", 0, WARRIOR, vec2(480, 400), {
        behaviour: undefined,
        startHealthFraction: 0.4,
      }),
      fighter("foe", 1, WARRIOR, vec2(600, 400), { behaviour: undefined }),
    ]);
    if (bears) {
      sim.get("ally")?.combatant.statuses.apply("air-of-enchantment", 5, "monk", NO_RANKS);
    }
    return sim;
  };

  it("casts Air on the ally first, then the enchantment once it bears Air", () => {
    expect(askBot(hurt(false), "monk")).toMatchObject({ useSkillId: AIR, targetId: "ally" });
    expect(askBot(hurt(true), "monk")).toMatchObject({ useSkillId: PROTECT, targetId: "ally" });
  });
});

describe("play-build's Elementalist self-buffs (#1984)", () => {
  const sim = (skillBar: string[]): MatchSimulation =>
    match([
      fighter("e", 0, ELEMENTALIST, vec2(400, 400), { behaviour: undefined, skillBar }),
      fighter("foe", 1, WARRIOR, vec2(480, 400), { behaviour: undefined, skillBar: [] }),
    ]);
  const CONJURES = {
    fire: "elementalist.conjure-flame",
    cold: "elementalist.conjure-frost",
    lightning: "elementalist.conjure-lightning",
  } as const;

  it("conjures only the element it wields", () => {
    const fight = sim(Object.values(CONJURES));
    const wields = fight.get("e")?.combatant.equipment.mainHand.damageType;
    expect(wields === "fire" || wields === "cold" || wields === "lightning").toBe(true);
    const matching = Object.entries(CONJURES).find(([type]) => type === wields)?.[1];
    expect(askBot(fight, "e")).toMatchObject({ useSkillId: matching, targetId: "e" });
    const others = Object.entries(CONJURES).flatMap(([type, id]) => (type === wields ? [] : [id]));
    expect(askBot(sim(others), "e").useSkillId).toBeUndefined();
  });

  it("casts Ether Prodigy only short of Energy", () => {
    const PRODIGY = "elementalist.ether-prodigy";
    expect(askBot(sim([PRODIGY]), "e").useSkillId).toBeUndefined();
    const low = sim([PRODIGY]);
    const self = low.get("e")?.combatant;
    if (self !== undefined) {
      self.energy = 5;
    }
    expect(askBot(low, "e")).toMatchObject({ useSkillId: PRODIGY, targetId: "e" });
  });

  it("casts Ether Renewal with two enchantments up and a spell ready", () => {
    const RENEWAL = "elementalist.ether-renewal";
    const bar = [RENEWAL, "elementalist.flare"];
    const one = sim(bar);
    one.get("e")?.combatant.statuses.apply("armor-boost", 30, "e", NO_RANKS);
    expect(askBot(one, "e").useSkillId).not.toBe(RENEWAL);
    const two = sim(bar);
    two.get("e")?.combatant.statuses.apply("armor-boost", 30, "e", NO_RANKS);
    two.get("e")?.combatant.statuses.apply("armor-of-mist", 30, "e", NO_RANKS);
    expect(askBot(two, "e")).toMatchObject({ useSkillId: RENEWAL, targetId: "e" });
  });

  it("keeps Elemental Attunement up", () => {
    const ATTUNEMENT = "elementalist.elemental-attunement";
    expect(askBot(sim([ATTUNEMENT]), "e")).toMatchObject({ useSkillId: ATTUNEMENT });
    const up = sim([ATTUNEMENT]);
    up.get("e")?.combatant.statuses.apply("elemental-attunement", 53, "e", NO_RANKS);
    expect(askBot(up, "e").useSkillId).toBeUndefined();
  });
});
