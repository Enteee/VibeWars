import { describe, expect, it } from "vitest";

import { skillSlotForKeyDown } from "./skill-keys.js";

describe("skillSlotForKeyDown", () => {
  it("maps 1–9 to the first nine slots and 0 to the tenth", () => {
    expect(skillSlotForKeyDown({ key: "1", repeat: false }, 10)).toBe(0);
    expect(skillSlotForKeyDown({ key: "9", repeat: false }, 10)).toBe(8);
    expect(skillSlotForKeyDown({ key: "0", repeat: false }, 10)).toBe(9);
  });

  it("casts nothing past the end of the bar, or for any other key", () => {
    expect(skillSlotForKeyDown({ key: "9", repeat: false }, 8)).toBeUndefined();
    expect(skillSlotForKeyDown({ key: "w", repeat: false }, 8)).toBeUndefined();
  });

  it("casts once for a held key, however often the OS repeats it (#43)", () => {
    const held = [
      { key: "1", repeat: false },
      ...Array.from({ length: 60 }, () => ({ key: "1", repeat: true })),
    ];
    const casts = held.map((event) => skillSlotForKeyDown(event, 8)).filter((s) => s !== undefined);
    expect(casts).toEqual([0]);
  });
});
