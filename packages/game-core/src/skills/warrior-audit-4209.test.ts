import { describe, expect, it } from "vitest";

import { getSkill } from "./catalog.js";

/**
 * The warrior audit (#4209): four adrenaline costs and a recharge the
 * corpus has otherwise. Executioner's Strike's +39 is in staples.test.ts,
 * Steelfang Slash's 1...5 strikes in match/warrior-staples-3.test.ts.
 */

describe("the warrior audit's costs are the corpus's (#4209)", () => {
  it.each([
    ["warrior.executioners-strike", 7, 0],
    ["warrior.sever-artery", 3, 0],
    ["warrior.disrupting-chop", 5, 0],
  ])("%s: %i strikes of adrenaline, %i s recharge", (id, strikes, recharge) => {
    const skill = getSkill(id);
    expect(skill?.cost).toEqual({ kind: "adrenaline", amount: strikes });
    expect(skill?.rechargeSeconds).toBe(recharge);
  });
});
