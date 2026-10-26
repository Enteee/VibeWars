import { describe, expect, it } from "vitest";

import { validated } from "./music-stress-validation.mjs";

const readings = (/** @type {(number | null)[]} */ [none, some, full]) => [
  { audioStress: 0, underrunMs: none ?? null },
  { audioStress: 1.5, underrunMs: some ?? null },
  { audioStress: 2.5, underrunMs: full ?? null },
];

describe("validated", () => {
  it("is true when the baseline is quiet and underruns rise with the stress", () => {
    expect(validated(readings([0, 120, 900]))).toBe(true);
  });

  it("is false when stress changes nothing", () => {
    expect(validated(readings([0, 2, 3]))).toBe(false);
  });

  it("is false when the baseline already underruns", () => {
    expect(validated(readings([400, 500, 900]))).toBe(false);
  });

  it("is false when less stress underruns more than full stress", () => {
    expect(validated(readings([0, 900, 300]))).toBe(false);
  });

  it("is false when the browser cannot say, or a load is missing", () => {
    expect(validated(readings([0, null, 900]))).toBe(false);
    expect(validated(readings([0, 100, 900]).slice(0, 2))).toBe(false);
  });
});
