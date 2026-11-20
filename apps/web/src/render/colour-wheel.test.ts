import { describe, expect, it, vi } from "vitest";

import {
  FOE_COLOUR,
  FRIEND_COLOUR,
  HAND,
  TEAM_HUE_BAND,
  VIVID_CHROMA,
  nudgeFromTeams,
  wheelDistance,
} from "./colour-wheel.js";

/** `colour`'s brightest and dimmest channel, which a nudge keeps. */
function lightness(colour: number): [number, number] {
  const channels = [(colour >> 16) & 0xff, (colour >> 8) & 0xff, colour & 0xff];
  return [Math.max(...channels), Math.min(...channels)];
}

/** `colour`'s hue in degrees and its chroma, 0 to 1. */
function hueAndChroma(colour: number): [number, number] {
  const r = ((colour >> 16) & 0xff) / 255;
  const g = ((colour >> 8) & 0xff) / 255;
  const b = (colour & 0xff) / 255;
  const max = Math.max(r, g, b);
  const chroma = max - Math.min(r, g, b);
  if (chroma === 0) {
    return [0, 0];
  }
  const hue =
    max === r
      ? ((g - b) / chroma + 6) % 6
      : max === g
        ? (b - r) / chroma + 2
        : (r - g) / chroma + 4;
  return [hue * 60, chroma];
}

function hueGap(a: number, b: number): number {
  const gap = Math.abs(a - b) % 360;
  return Math.min(gap, 360 - gap);
}

function readsAs(colour: number, team: number): boolean {
  const [hue, chroma] = hueAndChroma(colour);
  return (
    wheelDistance(colour, team) < HAND ||
    (chroma >= VIVID_CHROMA && hueGap(hue, hueAndChroma(team)[0]) < TEAM_HUE_BAND)
  );
}

function clear(colour: number): boolean {
  return !readsAs(colour, FRIEND_COLOUR) && !readsAs(colour, FOE_COLOUR);
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

  it("turns a colour once: drawing it again every frame costs no trigonometry", () => {
    const first = nudgeFromTeams(0xfe7a71);
    const cos = vi.spyOn(Math, "cos");
    try {
      expect(nudgeFromTeams(0xfe7a71)).toBe(first);
      expect(cos).not.toHaveBeenCalled();
    } finally {
      cos.mockRestore();
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

describe("nudgeFromTeams by hue (#3698)", () => {
  it.each([
    ["pure red", 0xff0000],
    ["a darker red", 0xe00000],
    ["a red a touch lighter", 0xff3030],
  ])("turns %s, far out on the wheel, a band's width of hue from foe red", (_, colour) => {
    expect(wheelDistance(colour, FOE_COLOUR)).toBeGreaterThanOrEqual(HAND);
    const nudged = nudgeFromTeams(colour);
    expect(nudged).not.toBe(colour);
    expect(hueGap(hueAndChroma(nudged)[0], hueAndChroma(FOE_COLOUR)[0])).toBeGreaterThanOrEqual(
      TEAM_HUE_BAND,
    );
    expect(clear(nudged)).toBe(true);
    const [high, low] = lightness(nudged);
    const [wasHigh, wasLow] = lightness(colour);
    expect(Math.abs(high - wasHigh)).toBeLessThanOrEqual(1);
    expect(Math.abs(low - wasLow)).toBeLessThanOrEqual(1);
  });

  it("turns a vivid blue of friend blue's hue away from it", () => {
    const nudged = nudgeFromTeams(0x0088ff);
    expect(hueGap(hueAndChroma(nudged)[0], hueAndChroma(FRIEND_COLOUR)[0])).toBeGreaterThanOrEqual(
      TEAM_HUE_BAND,
    );
  });

  it.each([
    ["pure blue, 38° from friend blue", 0x0000ff],
    ["gold", 0xffd700],
    ["grey", 0x808080],
    ["a muted red, read by the hand alone", 0x8c6a68],
  ])("leaves %s as it is", (_, colour) => {
    expect(nudgeFromTeams(colour)).toBe(colour);
  });

  it("never turns a colour into the other team's band: the bands are far apart", () => {
    const friendHue = hueAndChroma(FRIEND_COLOUR)[0];
    const foeHue = hueAndChroma(FOE_COLOUR)[0];
    expect(hueGap(friendHue, foeHue)).toBeGreaterThan(2 * TEAM_HUE_BAND);
    for (let colour = 0; colour <= 0xffffff; colour += 0x050a0f) {
      expect(clear(nudgeFromTeams(colour))).toBe(true);
    }
  });
});
