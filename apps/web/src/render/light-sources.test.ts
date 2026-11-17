import { describe, expect, it } from "vitest";

import { BRAZIER_LIFT, BRAZIER_WIDTH, brazierCommands } from "./light-sources.js";

describe("brazierCommands (#3504)", () => {
  const at = { x: 500, y: 300 };
  const commands = brazierCommands({ position: at });

  it("draws the flame and coals unlit and the iron lit", () => {
    for (const command of commands) {
      if (command.kind === "flame") {
        expect(command.lit).toBe(false);
      }
    }
    const lit = commands.filter((command) => command.lit);
    expect(lit.length).toBeGreaterThanOrEqual(5);
    expect(commands.some((command) => command.kind === "flame")).toBe(true);
  });

  it("is about 28 units across and centred on the light", () => {
    const bowls = commands.flatMap((command) => (command.kind === "ellipse" ? [command] : []));
    const widest = bowls.filter((bowl) => bowl.lit).sort((a, b) => b.width - a.width)[0];
    expect(widest?.width).toBe(BRAZIER_WIDTH);
    expect(widest?.at.x).toBe(at.x);
    expect(widest?.at.y).toBe(at.y - BRAZIER_LIFT);
  });

  it("keeps everything within the bowl's width of the light", () => {
    for (const command of commands) {
      if (command.kind === "flame") {
        for (const point of command.outline) {
          expect(Math.abs(point.x - at.x)).toBeLessThanOrEqual(BRAZIER_WIDTH / 2);
        }
      }
    }
  });
});
