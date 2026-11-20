import { describe, expect, it } from "vitest";

import { FOE_COLOUR, FRIEND_COLOUR, HAND, nudgeFromTeams, wheelDistance } from "./colour-wheel.js";

/** `colour`'s brightest and dimmest channel, which a nudge keeps. */
function lightness(colour: number): [number, number] {
  const channels = [(colour >> 16) & 0xff, (colour >> 8) & 0xff, colour & 0xff];
  return [Math.max(...channels), Math.min(...channels)];
}

function clear(colour: number): boolean {
  return wheelDistance(colour, FRIEND_COLOUR) >= HAND && wheelDistance(colour, FOE_COLOUR) >= HAND;
}

describe("nudgeFromTeams (#3628)", () => {
  it.each([
    ["friend blue", FRIEND_COLOUR],
    ["foe red", FOE_COLOUR],
    ["a red a shade off", 0xf07068],
    ["a blue a shade off", 0x4fb8f0],
  ])("turns %s a hand clear of both teams, its lightness kept", (_, colour) => {
    const nudged = nudgeFromTeams(colour);
    expect(nudged).not.toBe(colour);
    expect(clear(nudged)).toBe(true);
    const [high, low] = lightness(nudged);
    const [wasHigh, wasLow] = lightness(colour);
    expect(Math.abs(high - wasHigh)).toBeLessThanOrEqual(1);
    expect(Math.abs(low - wasLow)).toBeLessThanOrEqual(1);
  });

  it.each([
    ["white", 0xf2f2f2],
    ["black", 0x23272e],
    ["grey", 0x808080],
    ["gold", 0xe6c04a],
    ["violet", 0xa078e0],
  ])("leaves %s as it is", (_, colour) => {
    expect(nudgeFromTeams(colour)).toBe(colour);
  });

  it("is idempotent: a nudged colour stays", () => {
    for (let colour = 0; colour <= 0xffffff; colour += 0x0f0f0f) {
      const nudged = nudgeFromTeams(colour);
      expect(nudgeFromTeams(nudged)).toBe(nudged);
      expect(clear(nudged)).toBe(true);
    }
  });

  it("turns a hue away from the nearer team: red past red, blue past blue", () => {
    // Foe red's hue is about 4°: a red at 0° turns down through magenta, not up into orange.
    const red = nudgeFromTeams(0xff7b7b);
    expect(red & 0xff).toBeGreaterThan((red >> 8) & 0xff);
    // Friend blue's is about 202°: a blue at 212° turns on towards violet, its green falling.
    const blue = nudgeFromTeams(0x59a6ff);
    expect((blue >> 8) & 0xff).toBeLessThan(0xa6);
  });
});
