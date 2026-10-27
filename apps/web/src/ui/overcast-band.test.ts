import { describe, expect, it } from "vitest";

import { energyLabel, overcastShare, renderOvercastBand } from "./overcast-band.js";

describe("the overcast band (#461)", () => {
  it("greys overcast / maxEnergy of the bar, and nothing without overcast", () => {
    const band = { hidden: true, style: { width: "" } };
    renderOvercastBand(band, 10, 40);
    expect(band).toEqual({ hidden: false, style: { width: "25%" } });
    renderOvercastBand(band, 0, 40);
    expect(band.hidden).toBe(true);
  });

  it("covers the whole bar at most, past a ceiling below 0", () => {
    expect(overcastShare(60, 40)).toBe(1);
    expect(overcastShare(5, 0)).toBe(0);
  });

  it("counts energy to the ceiling overcast leaves", () => {
    expect(energyLabel(20, 30, 10)).toBe("20 / 20");
    expect(energyLabel(0, 30, 40)).toBe("0 / -10");
    expect(energyLabel(29.6, 50, 0)).toBe("30 / 50");
  });
});
