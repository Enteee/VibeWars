import { PRE_MATCH, PRE_MATCH_E2E } from "@vibewars/game-session";
import { describe, expect, it } from "vitest";
import { preMatchTimes } from "./pre-match-times.js";

describe("preMatchTimes (#3855)", () => {
  it("is the real wait in a player build", () => {
    expect(preMatchTimes(undefined, "")).toBe(PRE_MATCH);
    expect(preMatchTimes(undefined, "?pre-match=real")).toBe(PRE_MATCH);
  });

  it("counts down in 1 s in the e2e build, the join timeout kept", () => {
    expect(preMatchTimes("short", "")).toBe(PRE_MATCH_E2E);
    expect(PRE_MATCH_E2E.countdownSeconds).toBe(1);
    expect(PRE_MATCH_E2E.joinTimeoutSeconds).toBe(PRE_MATCH.joinTimeoutSeconds);
  });

  it("keeps the real wait in the e2e build when the URL asks for it", () => {
    expect(preMatchTimes("short", "?pre-match=real")).toBe(PRE_MATCH);
    expect(preMatchTimes("short", "?lobby=x&pre-match=real")).toBe(PRE_MATCH);
  });
});
