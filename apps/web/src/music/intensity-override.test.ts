import { describe, expect, it } from "vitest";

import {
  createIntensityOverride,
  intensityOverride,
  playedIntensity,
} from "./intensity-override.js";

describe("the intensity override (#425)", () => {
  it("starts on Auto, the page's too", () => {
    expect(createIntensityOverride().get()).toBe("auto");
    expect(intensityOverride.get()).toBe("auto");
  });

  it("sets, gets and tells each listener of a change, once", () => {
    const override = createIntensityOverride();
    const heard: unknown[] = [];
    const off = override.subscribe((value) => heard.push(value));
    override.set(2);
    override.set(2);
    override.set("auto");
    off();
    override.set(1);
    expect(override.get()).toBe(1);
    expect(heard).toEqual([2, "auto"]);
  });

  it("plays the fixed level, or the director's on Auto", () => {
    expect(playedIntensity("auto", 2)).toBe(2);
    expect(playedIntensity(0, 3)).toBe(0);
    expect(playedIntensity(3, 0)).toBe(3);
  });
});
