import { describe, expect, it } from "vitest";
import { holdBots } from "./hold-bots.js";

describe("holdBots (#4146)", () => {
  it("never holds a player build's bots, whatever the URL says", () => {
    expect(holdBots(undefined, "")).toBe(false);
    expect(holdBots(undefined, "?bots=hold")).toBe(false);
  });

  it("holds them in the e2e build only when the URL asks", () => {
    expect(holdBots("hold", "")).toBe(false);
    expect(holdBots("hold", "?bots=hold")).toBe(true);
    expect(holdBots("hold", "?lobby=x&bots=hold")).toBe(true);
  });
});
