import { describe, expect, it } from "vitest";

import { isTouchOnly } from "./touch-only.js";

/** `matchMedia` for a device that matches exactly `queries`. */
function device(...queries: string[]): (query: string) => boolean {
  return (query) => queries.includes(query);
}

describe("a touch-only device (#1392, #3782)", () => {
  it("is a phone: not a desktop, however narrow, nor a tablet with a mouse", () => {
    expect(isTouchOnly(device("(pointer: coarse)", "(hover: none)", "(any-pointer: coarse)"))).toBe(
      true,
    );
    expect(isTouchOnly(device("(pointer: fine)", "(hover: hover)", "(any-pointer: fine)"))).toBe(
      false,
    );
    expect(
      isTouchOnly(
        device(
          "(pointer: coarse)",
          "(hover: none)",
          "(any-pointer: coarse)",
          "(any-pointer: fine)",
        ),
      ),
    ).toBe(false);
  });
});
