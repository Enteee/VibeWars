import { describe, expect, it } from "vitest";

import { capturing } from "./capture-events.js";

describe("capturing (#3811)", () => {
  it("records only when the page asks", () => {
    expect(capturing("?capture")).toBe(true);
    expect(capturing("?splash&capture=1")).toBe(true);
    expect(capturing("")).toBe(false);
    expect(capturing("?captured")).toBe(false);
  });
});
