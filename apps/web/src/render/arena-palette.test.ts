import { describe, expect, it } from "vitest";

import { arenaPalette, shade } from "./arena-palette.js";

describe("arenaPalette", () => {
  it("leaves a map of one layer as it was", () => {
    expect(arenaPalette(1)).toMatchObject({
      floor: undefined,
      grid: 0x1a212c,
      wallTop: 0x202836,
    });
  });

  it("gives a layered map direction D", () => {
    expect(arenaPalette(3)).toMatchObject({
      floor: 0x26303f,
      grid: 0x34415a,
      deckTop: 0xa0b2c7,
      wallFace: shade(0x4b5a70, 0.4),
    });
  });
});

describe("shade", () => {
  it("moves each channel toward black", () => {
    expect(shade(0x804020, 0.5)).toBe(0x402010);
  });
});
