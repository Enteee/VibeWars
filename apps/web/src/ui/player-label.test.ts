import { describe, expect, it } from "vitest";

import { nameplateName, playerLabel, playerLabelText } from "./player-label.js";

describe("playerLabel (#1406)", () => {
  it("puts a player's guild tag after their name, in brackets", () => {
    expect(playerLabel("Ente", "VIBE")).toEqual({ name: "Ente", tag: "[VIBE]" });
    expect(playerLabelText("Ente", "VIBE")).toBe("Ente [VIBE]");
  });

  it("is the bare name without a tag, from the snapshot's undefined or the wire's null", () => {
    expect(playerLabel("Ente", undefined)).toEqual({ name: "Ente", tag: undefined });
    expect(playerLabelText("Ente", null)).toBe("Ente");
  });
});

describe("nameplateName (#2636)", () => {
  it("keeps a name of up to 24 graphemes whole", () => {
    expect(nameplateName("Ente")).toBe("Ente");
    expect(nameplateName("Wastrel's Collapse (A/E)")).toBe("Wastrel's Collapse (A/E)");
    const family = "\u{1F468}‍\u{1F469}‍\u{1F467}".repeat(24);
    expect(nameplateName(family)).toBe(family);
    expect(nameplateName(family)).toBe(family);
  });

  it("cuts a longer one to 23 and an ellipsis, never inside a grapheme", () => {
    expect(nameplateName("Balthazar FFF Zaishen Trappers 3 (R/Mo)")).toBe(
      "Balthazar FFF Zaishen T…",
    );
    const family = "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}";
    expect(nameplateName(family.repeat(30))).toBe(`${family.repeat(23)}…`);
  });

  it("drops a space before the ellipsis", () => {
    expect(nameplateName("Twenty two letters abc defgh")).toBe("Twenty two letters abc…");
  });
});
