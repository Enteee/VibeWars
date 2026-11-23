import { PRE_MATCH, PRE_MATCH_E2E } from "@vibewars/game-session";
import { describe, expect, it } from "vitest";

import { preMatchTimes } from "./pre-match-times.js";

describe("preMatchTimes (#3855)", () => {
  it("is the real wait when the build does not ask for the short one", () => {
    expect(preMatchTimes(undefined, "")).toBe(PRE_MATCH);
    expect(preMatchTimes("on", "")).toBe(PRE_MATCH);
  });

  it("is the 1 s countdown in the e2e build, with the real join timeout", () => {
    expect(preMatchTimes("short", "")).toBe(PRE_MATCH_E2E);
    expect(PRE_MATCH_E2E.countdownSeconds).toBe(1);
    expect(PRE_MATCH_E2E.joinTimeoutSeconds).toBe(PRE_MATCH.joinTimeoutSeconds);
  });

  it("is the real wait in the e2e build when the URL asks for it", () => {
    expect(preMatchTimes("short", "?pre-match=real")).toBe(PRE_MATCH);
    expect(preMatchTimes("short", "?splash&pre-match=real")).toBe(PRE_MATCH);
  });
});
