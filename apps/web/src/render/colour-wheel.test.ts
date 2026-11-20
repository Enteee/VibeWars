import { describe, expect, it } from "vitest";

import { FOE_COLOUR, FRIEND_COLOUR, HAND, nudgeFromTeams, wheelDistance } from "./colour-wheel.js";

/** The farther of `colour`'s distances to the two team colours' nearer one. */
function clearance(colour: number): number {
  return Math.min(wheelDistance(colour, FRIEND_COLOUR), wheelDistance(colour, FOE_COLOUR));
}

/** `colour`'s chroma and lightness, 0 to 255. */
function chromaAndLightness(colour: number): readonly [number, number] {
  const channels = [(colour >> 16) & 0xff, (colour >> 8) & 0xff, colour & 0xff];
  const max = Math.max(...channels);
  const min = Math.min(...channels);
  return [max - min, (max + min) / 2];
}

describe("nudgeFromTeams (#3628)", () => {
  it.each([
    ["friend blue", FRIEND_COLOUR],
    ["foe red", FOE_COLOUR],
    ["a near blue", 0x4cb0f0],
    ["a near red", 0xf06a60],
  ])("turns %s a hand clear of both teams, its chroma and lightness kept", (_, colour) => {
    const nudged = nudgeFromTeams(colour);
    expect(clearance(colour)).toBeLessThan(HAND);
    expect(clearance(nudged)).toBeGreaterThanOrEqual(HAND);
    const [chroma, lightness] = chromaAndLightness(colour);
    const [nudgedChroma, nudgedLightness] = chromaAndLightness(nudged);
    expect(Math.abs(nudgedChroma - chroma)).toBeLessThanOrEqual(1);
    expect(Math.abs(nudgedLightness - lightness)).toBeLessThanOrEqual(1);
  });

  it.each([
    ["grey", 0x808080],
    ["near-grey", 0x7f8085],
    ["white", 0xf2f2f2],
    ["black", 0x23272e],
    ["gold", 0xe6c04a],
    ["violet", 0xa078e0],
  ])("leaves %s as it is", (_, colour) => {
    expect(nudgeFromTeams(colour)).toBe(colour);
  });

  it("is idempotent, and turns away from the nearer team colour", () => {
    for (const colour of [FRIEND_COLOUR, FOE_COLOUR, 0x4cb0f0, 0xf06a60, 0x59c2fe]) {
      const nudged = nudgeFromTeams(colour);
      expect(nudgeFromTeams(nudged)).toBe(nudged);
    }
    // A blue a little greener than friend's turns further to green, not to violet.
    const greener = nudgeFromTeams(0x59d0ff);
    expect((greener >> 8) & 0xff).toBeGreaterThan(0xd0);
  });

  it("never ties: no colour is within a hand of both team colours", () => {
    // So the tie-break, friend blue, decides nothing a player can pick.
    expect(wheelDistance(FRIEND_COLOUR, FOE_COLOUR)).toBeGreaterThan(2 * HAND);
  });
});
