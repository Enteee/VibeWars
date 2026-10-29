import { describe, expect, it } from "vitest";

import { playerLabel, playerLabelText } from "./player-label.js";

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
