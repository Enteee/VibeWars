import { describe, expect, it } from "vitest";

import { OPTIONS_SECTIONS } from "./options-sections.js";

describe("OPTIONS_SECTIONS (#423)", () => {
  it("opens on Controls, and no two sections share an id", () => {
    const ids = OPTIONS_SECTIONS.map((section) => section.id);
    expect(ids[0]).toBe("controls");
    expect(new Set(ids).size).toBe(ids.length);
  });
});
