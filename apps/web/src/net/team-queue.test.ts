import { describe, expect, it } from "vitest";
import { endsTeamQueue, historyModeOf } from "./team-queue.js";

describe("endsTeamQueue (#1766, #3899)", () => {
  it("keeps the ticket through a warmup: its snapshot has the same nonce", () => {
    expect(endsTeamQueue("n1", false, { queueNonce: "n1" })).toBe(false);
  });

  it("ends it once the party is out of the queue, or in it again under another nonce", () => {
    expect(endsTeamQueue("n1", false, { queueNonce: null })).toBe(true);
    expect(endsTeamQueue("n1", false, { queueNonce: "n2" })).toBe(true);
  });

  it("never ends it while it is parked in its match", () => {
    expect(endsTeamQueue("n1", true, { queueNonce: null })).toBe(false);
  });
});

describe("historyModeOf (#3848, #3899)", () => {
  it("keeps a match under its lobby's mode", () => {
    expect(historyModeOf("team-arena", false)).toBe("team-arena");
  });

  it("keeps no warmup", () => {
    expect(historyModeOf("team-arena", true)).toBeUndefined();
  });
});
