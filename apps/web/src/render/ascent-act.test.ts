import { describe, expect, it } from "vitest";

import { fogTintOf } from "./ascent-act.js";
import { FOG_COLOUR } from "./atmosphere.js";

describe("an Ascent act's fog (#3589)", () => {
  it("keeps the plain cool grey off the Ascent, and tints the underworld's banks cold", () => {
    expect(fogTintOf(null).body).toBe(FOG_COLOUR);
    expect(fogTintOf("underworld").body).toBe(0x3d5560);
  });

  it("gives every act a crown paler than its bank", () => {
    const light = (colour: number) =>
      ((colour >> 16) & 255) + ((colour >> 8) & 255) + (colour & 255);
    for (const act of ["volcanic", "underworld", "heavenly"] as const) {
      const { body, crown } = fogTintOf(act);
      expect(light(crown), act).toBeGreaterThan(light(body));
    }
  });
});
