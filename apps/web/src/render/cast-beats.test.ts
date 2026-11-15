import { describe, expect, it } from "vitest";

import { getSkill } from "@vibewars/game-core";

import type { CastBeat } from "./attack-clock.js";
import { FIZZLE_SECONDS, FLASH_SECONDS, castGlow } from "./cast-beats.js";
import { skillColour } from "./skill-colours.js";

const FIREBALL = "elementalist.fireball";
const WARM_GOLD = 0xffd23d;
const WHITE = 0xffffff;

const casting = (progress: number, skillId = FIREBALL): CastBeat => ({
  phase: "casting",
  skillId,
  progress,
});

describe("castGlow (#3320)", () => {
  it("grows with the cast: small at its start, full at its end", () => {
    expect(castGlow(casting(0), false)).toEqual({ radius: 7, alpha: 0.4, colour: WARM_GOLD });
    expect(castGlow(casting(0.5), false)).toEqual({
      radius: 9.5,
      alpha: expect.closeTo(0.475, 9) as number,
      colour: WARM_GOLD,
    });
    expect(castGlow(casting(1), false)).toEqual({ radius: 12, alpha: 0.55, colour: WARM_GOLD });
  });

  it.each([
    ["mesmer.empathy", 0xa77bff],
    ["necromancer.well-of-suffering", 0xa77bff],
    ["mesmer.chaos-storm", 0xa77bff],
    ["monk.protective-spirit", 0xe8c27a],
    ["ranger.winnowing", 0x76c96f],
    ["warrior.watch-yourself", 0x9fdcff],
    ["warrior.balanced-stance", 0xdfe7f1],
    [FIREBALL, WARM_GOLD],
  ])("colours %s by its type", (skillId, colour) => {
    expect(castGlow(casting(0.5, skillId), false)?.colour).toBe(colour);
  });

  it("flashes white on release, then is gone after the flash", () => {
    const released = (since: number): CastBeat => ({ phase: "released", skillId: FIREBALL, since });
    expect(castGlow(released(0), false)).toEqual({ radius: 16, alpha: 0.6, colour: WHITE });
    expect(castGlow(released(FLASH_SECONDS / 2), false)?.alpha).toBeCloseTo(0.3, 9);
    expect(castGlow(released(FLASH_SECONDS), false)).toBeUndefined();
  });

  it("stopped short: never white, greying and shrinking to nothing by the fizzle's end", () => {
    const stopped = (since: number): CastBeat => ({
      phase: "stopped",
      skillId: FIREBALL,
      since,
      progress: 1,
    });
    expect(castGlow(stopped(0), false)).toEqual({ radius: 12, alpha: 0.55, colour: WARM_GOLD });
    const half = castGlow(stopped(FIZZLE_SECONDS / 2), false);
    expect(half?.radius).toBeCloseTo(6, 9);
    expect(half?.colour).not.toBe(WHITE);
    expect(half?.colour).not.toBe(WARM_GOLD);
    expect(castGlow(stopped(FIZZLE_SECONDS - 1e-6), false)?.radius).toBeLessThan(0.001);
    expect(castGlow(stopped(FIZZLE_SECONDS), false)).toBeUndefined();
  });

  it("under reduced motion still grows, but releases with no flash and fades out", () => {
    expect(castGlow(casting(0.5), true)?.radius).toBe(9.5);
    const released = castGlow({ phase: "released", skillId: FIREBALL, since: 0 }, true);
    expect(released).toEqual({ radius: 12, alpha: 0.55, colour: WARM_GOLD });
    const fading = castGlow(
      { phase: "released", skillId: FIREBALL, since: FLASH_SECONDS / 2 },
      true,
    );
    expect(fading?.colour).toBe(WARM_GOLD);
    expect(fading?.alpha).toBeCloseTo(0.275, 9);
    const fizzling = castGlow(
      { phase: "stopped", skillId: FIREBALL, since: FIZZLE_SECONDS / 2, progress: 1 },
      true,
    );
    expect(fizzling?.radius).toBe(12);
    expect(fizzling?.alpha).toBeCloseTo(0.275, 9);
  });

  it("shows nothing with no cast, and nothing for an attack skill", () => {
    expect(castGlow(undefined, false)).toBeUndefined();
    expect(castGlow(casting(0.5, "warrior.swift-chop"), false)).toBeUndefined();
  });
});

describe("skillColour (#3320)", () => {
  it("is warm gold for a plain spell, and for a type the table leaves out", () => {
    const fireball = getSkill(FIREBALL);
    expect(fireball?.type).toBe("spell");
    expect(fireball && skillColour(fireball)).toBe(WARM_GOLD);
  });
});
