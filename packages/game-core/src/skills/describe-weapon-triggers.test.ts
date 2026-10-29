import { describe, expect, it, vi } from "vitest";

import { describeStatus } from "./describe.js";
import type * as Status from "./status.js";
import type { StatusDefinition } from "./status.js";

/**
 * A test-local status (#1370): two triggers that do the same thing, one
 * bound to an axe and one to no weapon, are two lines, not one line that
 * drops the filter.
 */
vi.mock("./status.js", async (importOriginal) => {
  const original = await importOriginal<typeof Status>();
  const base = original.STATUS_DEFINITIONS["hundred-blades"];
  const [sword] = base.triggers;
  if (sword === undefined) {
    throw new Error("Hundred Blades has no trigger");
  }
  const { weapon: _sword, ...unbound } = sword;
  const axeOrAny: StatusDefinition = {
    ...base,
    triggers: [{ ...unbound, weapon: "axe" }, unbound],
  };
  return {
    ...original,
    findStatusDefinition: (id: string): StatusDefinition | undefined =>
      id === "test-axe-or-any" ? axeOrAny : original.findStatusDefinition(id),
  };
});

describe("weapon-bound trigger lines (#1370)", () => {
  it("say the same effects twice: once with an axe, once with no weapon", () => {
    const text = describeStatus("test-axe-or-any");
    expect(text).toContain("whenever it attacks with an axe");
    expect(text).toMatch(/whenever it attacks(?! with)/);
  });
});
