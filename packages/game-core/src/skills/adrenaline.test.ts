import { describe, expect, it } from "vitest";

import { ADRENALINE_PER_STRIKE } from "../ruleset.js";
import {
  adrenalineLossIn,
  adrenalinePools,
  canAffordAdrenaline,
  emptyAdrenaline,
  emptyPool,
  gainStrikes,
  gainUnits,
  spendAdrenaline,
} from "./adrenaline.js";
import { getSkill } from "./catalog.js";
import { NO_RANKS } from "./status.js";
import { makeCombatant } from "./testing.js";
import type { Skill } from "./types.js";

/** Per-skill adrenaline (#463): Backbreaker 9 strikes, Sever Artery 4, "Watch Yourself!" 4. */

const BACKBREAKER = "warrior.backbreaker";
const SEVER_ARTERY = "warrior.sever-artery";
const WATCH_YOURSELF = "warrior.watch-yourself";
const HAMMER_BASH = "warrior.hammer-bash";

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`no skill ${id}`);
  }
  return found;
}

/** A warrior with these units in each of the three. */
function warrior(backbreaker: number, severArtery: number, watchYourself: number) {
  return makeCombatant({
    id: "w",
    adrenaline: new Map([
      [BACKBREAKER, backbreaker],
      [SEVER_ARTERY, severArtery],
      [WATCH_YOURSELF, watchYourself],
    ]),
  });
}

describe("adrenalinePools", () => {
  it("keys exactly the bar's adrenaline skills, at 0", () => {
    const pools = adrenalinePools([BACKBREAKER, "elementalist.fireball", null, SEVER_ARTERY]);
    expect([...pools]).toEqual([
      [BACKBREAKER, 0],
      [SEVER_ARTERY, 0],
    ]);
  });
});

describe("gainStrikes", () => {
  it("fills every skill by 25 a strike, each capped at its own cost", () => {
    const w = warrior(0, 0, 3 * ADRENALINE_PER_STRIKE + 10);
    gainStrikes(w, 2, 0);
    expect([...w.adrenaline.values()]).toEqual([
      2 * ADRENALINE_PER_STRIKE,
      2 * ADRENALINE_PER_STRIKE,
      4 * ADRENALINE_PER_STRIKE,
    ]);
  });

  it("skips a recharging skill", () => {
    const w = warrior(0, 0, 0);
    w.cast.startRecharge(WATCH_YOURSELF, 4);
    gainStrikes(w, 1, 0);
    expect(w.adrenaline.get(WATCH_YOURSELF)).toBe(0);
    expect(w.adrenaline.get(BACKBREAKER)).toBe(ADRENALINE_PER_STRIKE);
  });
});

describe("gainUnits", () => {
  it("adds units, not strikes, each capped at its own cost (#827)", () => {
    const w = warrior(0, 4 * ADRENALINE_PER_STRIKE - 5, 0);
    gainUnits(w, 24, 0);
    expect([...w.adrenaline.values()]).toEqual([24, 4 * ADRENALINE_PER_STRIKE, 24]);
  });

  it("skips a recharging skill (#827)", () => {
    const w = warrior(0, 0, 0);
    w.cast.startRecharge(SEVER_ARTERY, 4);
    gainUnits(w, 10, 0);
    expect([...w.adrenaline.values()]).toEqual([10, 0, 10]);
  });

  it("multiplies two boosts, at most +100% together (#4089)", () => {
    const w = warrior(0, 0, 0);
    w.statuses.apply("weapon-of-fury", 10, "r", NO_RANKS);
    w.statuses.apply("natural-temper", 10, "p", NO_RANKS);
    gainUnits(w, 10, 0, true);
    // 10 × 2 × 1.33 would be 26.
    expect(w.adrenaline.get(BACKBREAKER)).toBe(20);
  });

  it("keeps a single boost's own share (#4089)", () => {
    const w = warrior(0, 0, 0);
    w.statuses.apply("natural-temper", 10, "p", NO_RANKS);
    gainUnits(w, 10, 0, true);
    expect(w.adrenaline.get(BACKBREAKER)).toBe(13);
  });

  it("boosts only what attacks earn, unless the boost says all (#4163)", () => {
    const onslaught = warrior(0, 0, 0);
    onslaught.statuses.apply("onslaught", 10, "d", NO_RANKS);
    gainUnits(onslaught, 20, 0);
    expect(onslaught.adrenaline.get(BACKBREAKER)).toBe(20);
    gainUnits(onslaught, 20, 0, true);
    expect(onslaught.adrenaline.get(BACKBREAKER)).toBe(20 + 25);

    // Focused Anger at Leadership 12, +120%, on what is not an attack too.
    const focused = warrior(0, 0, 0);
    focused.statuses.apply("focused-anger", 10, "p", new Map([["paragon.leadership", 12]]));
    gainUnits(focused, 20, 0);
    expect(focused.adrenaline.get(BACKBREAKER)).toBe(44);
  });
});

describe("spendAdrenaline", () => {
  it("empties its own and drains every other by exactly one strike, never below 0", () => {
    const w = warrior(9 * ADRENALINE_PER_STRIKE, 10, 4 * ADRENALINE_PER_STRIKE);
    spendAdrenaline(w, skill(BACKBREAKER));
    expect([...w.adrenaline.values()]).toEqual([0, 0, 3 * ADRENALINE_PER_STRIKE]);
  });

  it("the only adrenaline skill on the bar just empties", () => {
    const w = makeCombatant({
      id: "w",
      adrenaline: new Map([[SEVER_ARTERY, 4 * ADRENALINE_PER_STRIKE]]),
    });
    spendAdrenaline(w, skill(SEVER_ARTERY));
    expect([...w.adrenaline]).toEqual([[SEVER_ARTERY, 0]]);
  });

  it("draining a charged skill leaves it one strike short", () => {
    const w = warrior(9 * ADRENALINE_PER_STRIKE, 4 * ADRENALINE_PER_STRIKE, 0);
    spendAdrenaline(w, skill(SEVER_ARTERY));
    expect(canAffordAdrenaline(w, skill(BACKBREAKER))).toBe(false);
    expect(w.adrenaline.get(BACKBREAKER)).toBe(8 * ADRENALINE_PER_STRIKE);
  });

  it("one that loses all adrenaline (#1097) empties every pool, not only its own", () => {
    const w = makeCombatant({
      id: "w",
      adrenaline: new Map([
        [HAMMER_BASH, 6 * ADRENALINE_PER_STRIKE],
        [BACKBREAKER, 9 * ADRENALINE_PER_STRIKE],
        [WATCH_YOURSELF, 4 * ADRENALINE_PER_STRIKE],
      ]),
    });
    spendAdrenaline(w, skill(HAMMER_BASH));
    expect([...w.adrenaline.values()]).toEqual([0, 0, 0]);
  });
});

describe("emptyPool (#1097)", () => {
  it("empties only that skill's pool", () => {
    const w = warrior(9 * ADRENALINE_PER_STRIKE, 4 * ADRENALINE_PER_STRIKE, 10);
    emptyPool(w, SEVER_ARTERY);
    expect([...w.adrenaline.values()]).toEqual([9 * ADRENALINE_PER_STRIKE, 0, 10]);
  });

  it("does nothing for a skill without a pool", () => {
    const w = warrior(9 * ADRENALINE_PER_STRIKE, 10, 0);
    emptyPool(w, "elementalist.fireball");
    expect([...w.adrenaline]).toEqual([
      [BACKBREAKER, 9 * ADRENALINE_PER_STRIKE],
      [SEVER_ARTERY, 10],
      [WATCH_YOURSELF, 0],
    ]);
  });
});

describe("canAffordAdrenaline", () => {
  it("needs the whole cost in its own pool: 9 × 25, not one unit less", () => {
    expect(canAffordAdrenaline(warrior(9 * 25 - 1, 0, 1000), skill(BACKBREAKER))).toBe(false);
    expect(canAffordAdrenaline(warrior(9 * 25, 0, 0), skill(BACKBREAKER))).toBe(true);
  });
});

describe("adrenalineLossIn (#828)", () => {
  it("counts down from the last combat, never below 0, and is null with every pool empty", () => {
    const w = warrior(30, 0, 0);
    gainUnits(w, 0, 10);
    expect(w.lastCombatAt).toBe(10);
    expect(adrenalineLossIn(w, 14, 25)).toBe(21);
    expect(adrenalineLossIn(w, 40, 25)).toBe(0);
    expect(adrenalineLossIn(warrior(0, 0, 0), 14, 25)).toBeNull();
  });
});

describe("emptyAdrenaline", () => {
  it("sets every pool to 0 and keeps the keys", () => {
    const w = warrior(30, 25, 100);
    emptyAdrenaline(w);
    expect([...w.adrenaline]).toEqual([
      [BACKBREAKER, 0],
      [SEVER_ARTERY, 0],
      [WATCH_YOURSELF, 0],
    ]);
  });
});
