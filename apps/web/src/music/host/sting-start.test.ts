import { describe, expect, it } from "vitest";

import { stingStart } from "./sting-start.js";

describe("stingStart", () => {
  it("starts on the next beat after what was queried", () => {
    expect(stingStart(12.1)).toBe(12.25);
    expect(stingStart(12.6)).toBe(12.75);
    expect(stingStart(12.8)).toBe(13);
  });

  it("starts on a beat the scheduler has just reached", () => {
    expect(stingStart(12.5)).toBe(12.5);
  });

  it("waits for a planned switch to land", () => {
    expect(stingStart(12.1, 16)).toBe(16);
  });

  it("ignores a switch that has already landed", () => {
    expect(stingStart(17.1, 16)).toBe(17.25);
  });
});
