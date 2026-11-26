import { describe, expect, it } from "vitest";

import { diskHold, gib } from "./disk.mjs";

const GIB = 1024 ** 3;

describe("diskHold", () => {
  it("holds below 10 GiB free", () => {
    expect(diskHold({ freeBytes: 9 * GIB, holding: false })).toBe(true);
  });

  it("does not hold at 10 GiB or above", () => {
    expect(diskHold({ freeBytes: 10 * GIB, holding: false })).toBe(false);
    expect(diskHold({ freeBytes: 80 * GIB, holding: false })).toBe(false);
  });

  it("stays held at 11 GiB, so it does not flap at the edge", () => {
    expect(diskHold({ freeBytes: 11 * GIB, holding: true })).toBe(true);
  });

  it("lets go at 12 GiB", () => {
    expect(diskHold({ freeBytes: 12 * GIB, holding: true })).toBe(false);
  });

  it("never holds above 12 GiB", () => {
    for (const holding of [true, false]) {
      expect(diskHold({ freeBytes: 13 * GIB, holding })).toBe(false);
    }
  });
});

describe("gib", () => {
  it("rounds down to whole GiB", () => {
    expect(gib(9.9 * GIB)).toBe("9");
  });
});
