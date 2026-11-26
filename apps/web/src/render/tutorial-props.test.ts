import { describe, expect, it } from "vitest";

import { MINIMAL_GW_INSPIRED_PVP_V1 as RULESET } from "@vibewars/game-core";

import { teamColour } from "./arena-snapshot.js";
import { FOE_COLOUR } from "./colour-wheel.js";
import {
  CHAIR_BLUE,
  PARASOL_CREAM,
  PARASOL_HEIGHT,
  PARASOL_PANELS,
  PARASOL_RED,
  PARASOL_RIM,
  PARASOL_WOOD,
  SLEEPER_GLOW,
  SILHOUETTE_FOE,
  SLEEPER_ZS,
  SLEEPER_Z_RISE,
  SLEEPER_Z_SECONDS,
  mistGateCommands,
  parasolCommands,
  sleeperCommands,
  sleeperZAge,
  type SleeperCommand,
} from "./tutorial-props.js";

const AT = { x: 500, y: 300 };

const zsOf = (commands: readonly SleeperCommand[]) =>
  commands.flatMap((command) => (command.kind === "z" ? [command] : []));

describe("the sleeping guard (#3326)", () => {
  it("is a foe's body disc at a fighter's radius, and no head (#3791)", () => {
    const commands = sleeperCommands(AT, 0.4, 0, false);
    const bodies = commands.filter((command) => command.kind === "body");
    expect(bodies).toEqual([
      { kind: "body", at: AT, radius: RULESET.collision.playerRadius, team: "enemy", facing: 0.4 },
    ]);
    expect(teamColour("enemy")).toBe(FOE_COLOUR);
    expect(commands.map(({ kind }) => kind)).not.toContain("head");
  });

  it("is lit by a warm glow drawn under it", () => {
    const commands = sleeperCommands(AT, 0, 0, false);
    expect(commands[0]?.kind).toBe("glow");
    expect(commands[1]?.kind).toBe("body");
    const [glow] = commands;
    expect(glow?.kind === "glow" ? glow.colour : undefined).toBe(SLEEPER_GLOW);
  });

  it("lets its z's rise from over the disc", () => {
    const [z] = zsOf(sleeperCommands(AT, 0, 0, false));
    expect(z?.at.y).toBeLessThan(AT.y - RULESET.collision.playerRadius);
  });

  it("lets three z's rise 32 and fade over 2 s, staggered", () => {
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

describe("the parasol (#3332)", () => {
  const commands = parasolCommands(AT);
  const shapes = commands.flatMap((command) => (command.kind === "shape" ? [command] : []));
  const colours = new Set(shapes.map(({ colour }) => colour));

  it("has a canopy of red and cream panels in turn, high over the pole's foot, edged pale", () => {
    const panels = shapes.filter(({ outline }) => outline.every(({ y }) => y <= AT.y));
    expect(panels.map(({ colour }) => colour)).toEqual(
      Array.from({ length: PARASOL_PANELS }, (_, k) => (k % 2 === 0 ? PARASOL_RED : PARASOL_CREAM)),
    );
    for (const { outline } of panels) {
      expect(Math.min(...outline.map(({ y }) => y))).toBeLessThan(AT.y - PARASOL_HEIGHT + 1);
    }
    const edge = commands.at(-1);
    expect(edge).toMatchObject({ kind: "stroke", colour: PARASOL_RIM });
  });

  it("has a pole from its foot up to the canopy, in wood", () => {
    const pole = commands.find(
      (command) =>
        command.kind === "stroke" &&
        command.points.length === 2 &&
        command.points[0]?.x === AT.x &&
        command.points[1]?.y === AT.y - PARASOL_HEIGHT,
    );
    expect(pole).toMatchObject({ kind: "stroke", colour: PARASOL_WOOD });
  });

  it("has a deck chair east of the pole, in blue and cream stripes, and a shade under it all", () => {
    const chair = shapes.filter(({ colour }) => colour === CHAIR_BLUE);
    expect(chair.length).toBeGreaterThan(0);
    for (const { outline } of chair) {
      expect(Math.min(...outline.map(({ x }) => x))).toBeGreaterThan(AT.x);
    }
    expect(colours.has(CHAIR_BLUE) && colours.has(PARASOL_CREAM)).toBe(true);
    // The shade first, so everything stands on it; translucent.
    expect(commands[0]).toMatchObject({ kind: "shape" });
    expect(shapes[0]?.alpha).toBeLessThan(1);
  });

  it("is static: the same strokes whenever it is drawn", () => {
    expect(parasolCommands(AT)).toEqual(commands);
  });
});

describe("the mist gate (#3334)", () => {
  it("shows the fight beyond as foes' body discs, desaturated, no heads (#3791)", () => {
    const silhouettes = mistGateCommands(AT, 0, false).filter(
      (command) => command.kind === "shape",
    );
    expect(silhouettes.length).toBeGreaterThan(0);
    for (const silhouette of silhouettes) {
      const xs = silhouette.outline.map(({ x }) => x);
      const ys = silhouette.outline.map(({ y }) => y);
      expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(2 * RULESET.collision.playerRadius, 5);
      expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(2 * RULESET.collision.playerRadius, 5);
      expect(silhouette.colour).toBe(SILHOUETTE_FOE);
    }
    // Still a foe's warm red, greyed: not the foe colour itself.
    expect(SILHOUETTE_FOE).not.toBe(FOE_COLOUR);
    expect((SILHOUETTE_FOE >> 16) & 0xff).toBeGreaterThan(SILHOUETTE_FOE & 0xff);
  });
});
