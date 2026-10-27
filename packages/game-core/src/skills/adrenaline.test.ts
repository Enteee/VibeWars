import { describe, expect, it } from "vitest";

import { ADRENALINE_PER_STRIKE } from "../ruleset.js";
import {
  adrenalinePools,
  canAffordAdrenaline,
  emptyAdrenaline,
  gainStrikes,
  spendAdrenaline,
} from "./adrenaline.js";
import { getSkill } from "./catalog.js";
import { makeCombatant } from "./testing.js";
import type { Skill } from "./types.js";

/** Per-skill adrenaline (#463): Backbreaker 9 strikes, Opening Cut 1, "Watch Yourself!" 4. */

const BACKBREAKER = "warrior.backbreaker";
const OPENING_CUT = "warrior.sever-artery-lite";
const WATCH_YOURSELF = "warrior.watch-yourself";

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`no skill ${id}`);
  }
  return found;
}

/** A warrior with these units in each of the three. */
function warrior(backbreaker: number, openingCut: number, watchYourself: number) {
  return makeCombatant({
    id: "w",
    adrenaline: new Map([
      [BACKBREAKER, backbreaker],
      [OPENING_CUT, openingCut],
      [WATCH_YOURSELF, watchYourself],
    ]),
  });
}

describe("adrenalinePools", () => {
  it("keys exactly the bar's adrenaline skills, at 0", () => {
    const pools = adrenalinePools([BACKBREAKER, "elementalist.fireball", null, OPENING_CUT]);
    expect([...pools]).toEqual([
      [BACKBREAKER, 0],
      [OPENING_CUT, 0],
    ]);
  });
});

describe("gainStrikes", () => {
  it("fills every skill by 25 a strike, each capped at its own cost", () => {
    const w = warrior(0, 0, 3 * ADRENALINE_PER_STRIKE + 10);
    gainStrikes(w, 2);
    expect([...w.adrenaline.values()]).toEqual([
      2 * ADRENALINE_PER_STRIKE,
      ADRENALINE_PER_STRIKE,
      4 * ADRENALINE_PER_STRIKE,
    ]);
  });

  it("skips a recharging skill", () => {
    const w = warrior(0, 0, 0);
    w.cast.startRecharge(WATCH_YOURSELF, 4);
    gainStrikes(w, 1);
    expect(w.adrenaline.get(WATCH_YOURSELF)).toBe(0);
    expect(w.adrenaline.get(BACKBREAKER)).toBe(ADRENALINE_PER_STRIKE);
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
      adrenaline: new Map([[OPENING_CUT, ADRENALINE_PER_STRIKE]]),
    });
    spendAdrenaline(w, skill(OPENING_CUT));
    expect([...w.adrenaline]).toEqual([[OPENING_CUT, 0]]);
  });

  it("draining a charged skill leaves it one strike short", () => {
    const w = warrior(9 * ADRENALINE_PER_STRIKE, ADRENALINE_PER_STRIKE, 0);
    spendAdrenaline(w, skill(OPENING_CUT));
    expect(canAffordAdrenaline(w, skill(BACKBREAKER))).toBe(false);
    expect(w.adrenaline.get(BACKBREAKER)).toBe(8 * ADRENALINE_PER_STRIKE);
  });
});

describe("canAffordAdrenaline", () => {
  it("needs the whole cost in its own pool: 9 × 25, not one unit less", () => {
    expect(canAffordAdrenaline(warrior(9 * 25 - 1, 0, 1000), skill(BACKBREAKER))).toBe(false);
    expect(canAffordAdrenaline(warrior(9 * 25, 0, 0), skill(BACKBREAKER))).toBe(true);
  });
});

describe("emptyAdrenaline", () => {
  it("sets every pool to 0 and keeps the keys", () => {
    const w = warrior(30, 25, 100);
    emptyAdrenaline(w);
    expect([...w.adrenaline]).toEqual([
      [BACKBREAKER, 0],
      [OPENING_CUT, 0],
      [WATCH_YOURSELF, 0],
    ]);
  });
});
