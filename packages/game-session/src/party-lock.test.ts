import { describe, expect, it } from "vitest";
import { keepsParty } from "./party-lock.js";

describe("keepsParty (#3815)", () => {
  const lock = { claimers: ["a", null, "b", null] };
  const here = (...ids: string[]) => ids.map((id) => ({ id, away: false }));

  it("keeps the same members", () => {
    expect(keepsParty(lock, here("b", "a"))).toBe(true);
  });

  it("does not keep one with a member away", () => {
    expect(keepsParty(lock, [...here("a"), { id: "b", away: true }])).toBe(false);
  });

  it("does not keep one with a member gone", () => {
    expect(keepsParty(lock, here("a"))).toBe(false);
  });

  it("does not keep one with a newcomer", () => {
    expect(keepsParty(lock, here("a", "b", "c"))).toBe(false);
  });

  it("counts bots' and vacant slots for nothing", () => {
    expect(keepsParty({ claimers: [null, "a", null, null] }, here("a"))).toBe(true);
  });
});
