import { describe, expect, it } from "vitest";

import { teamColour } from "./arena-snapshot.js";
import {
  SLEEPER_GREY,
  SLEEPER_RADIUS,
  SLEEPER_ZS,
  SLEEPER_Z_RISE,
  SLEEPER_Z_SECONDS,
  sleeperCommands,
  sleeperZAge,
  type SleeperCommand,
} from "./sleeper-prop.js";

const AT = { x: 500, y: 300 };

const zsOf = (commands: readonly SleeperCommand[]) =>
  commands.flatMap((command) => (command.kind === "z" ? [command] : []));

describe("the sleeping guard (#3326)", () => {
  it("lies flat, a body's disc at radius 10", () => {
    const [body] = sleeperCommands(AT, 0, 0, false);
    if (body?.kind !== "body") {
      throw new Error("no body first");
    }
    const xs = body.outline.map(({ x }) => x);
    const ys = body.outline.map(({ y }) => y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(2 * SLEEPER_RADIUS, 0);
    // Flattened across its facing, as a knocked-down body is.
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(1.5 * SLEEPER_RADIUS);
  });

  it("wears no team's colour", () => {
    const colours = sleeperCommands(AT, 0, 0.7, false).map(({ colour }) => colour);
    for (const team of ["ally", "enemy", "third", "self"] as const) {
      expect(colours).not.toContain(teamColour(team));
    }
    expect(colours).toContain(SLEEPER_GREY);
  });

  it("lets three z's rise 12 and fade over 2 s, staggered", () => {
    const zs = zsOf(sleeperCommands(AT, 0, 0, false));
    expect(zs).toHaveLength(SLEEPER_ZS);
    expect(new Set(zs.map(({ alpha }) => alpha.toFixed(3))).size).toBe(SLEEPER_ZS);

    const start = sleeperZAge(0, 0);
    expect(start).toBe(0);
    const [born] = zsOf(sleeperCommands(AT, 0, 0, false));
    const [old] = zsOf(sleeperCommands(AT, 0, SLEEPER_Z_SECONDS * 0.99, false));
    if (born === undefined || old === undefined) {
      throw new Error("no z");
    }
    expect(born.alpha).toBe(1);
    expect(old.alpha).toBeLessThan(0.05);
    expect(born.at.y - old.at.y).toBeCloseTo(SLEEPER_Z_RISE * 0.99, 5);
    // A full cycle on, it is born again.
    const [again] = zsOf(sleeperCommands(AT, 0, SLEEPER_Z_SECONDS, false));
    expect(again?.alpha).toBeCloseTo(1, 5);
  });

  it("stands two z's still under reduced motion", () => {
    const early = sleeperCommands(AT, 0, 0.3, true);
    const late = sleeperCommands(AT, 0, 1.4, true);
    expect(zsOf(early)).toHaveLength(2);
    expect(late).toEqual(early);
  });
});
