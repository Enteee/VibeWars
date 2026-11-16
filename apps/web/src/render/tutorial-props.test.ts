import { describe, expect, it } from "vitest";

import { MINIMAL_GW_INSPIRED_PVP_V1 as RULESET } from "@vibewars/game-core";

import { teamColour } from "./arena-snapshot.js";
import {
  CHAIR_BLUE,
  PARASOL_CREAM,
  PARASOL_HEIGHT,
  PARASOL_PANELS,
  PARASOL_RED,
  PARASOL_RIM,
  PARASOL_WOOD,
  SLEEPER_GLOW,
  SLEEPER_GREY,
  SLEEPER_RADIUS,
  SLEEPER_RIM,
  SLEEPER_ZS,
  SLEEPER_Z_RISE,
  SLEEPER_Z_SECONDS,
  parasolCommands,
  sleeperCommands,
  sleeperZAge,
  type SleeperCommand,
} from "./tutorial-props.js";

const AT = { x: 500, y: 300 };

/** A colour's channels summed: enough to tell the paler of two greys. */
const lightness = (colour: number): number =>
  ((colour >> 16) & 0xff) + ((colour >> 8) & 0xff) + (colour & 0xff);

const zsOf = (commands: readonly SleeperCommand[]) =>
  commands.flatMap((command) => (command.kind === "z" ? [command] : []));

describe("the sleeping guard (#3326)", () => {
  it("lies flat, head to feet longer than a fighter's disc is wide", () => {
    const commands = sleeperCommands(AT, 0, 0, false);
    const body = commands.find((command) => command.kind === "body");
    const head = commands.find((command) => command.kind === "head");
    if (body?.kind !== "body" || head?.kind !== "head") {
      throw new Error("no body or no head");
    }
    const xs = [...body.outline.map(({ x }) => x), head.at.x + head.radius];
    const ys = body.outline.map(({ y }) => y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(2 * SLEEPER_RADIUS, 0);
    expect(2 * SLEEPER_RADIUS).toBeGreaterThan(2 * RULESET.collision.playerRadius);
    // Flattened across its facing, as a knocked-down body is.
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(SLEEPER_RADIUS);
    // The head at the end it faces, apart from the body.
    expect(head.at.x).toBeGreaterThan(AT.x);
    expect(head.at.x - head.radius).toBeGreaterThanOrEqual(
      Math.max(...body.outline.map(({ x }) => x)) - 0.01,
    );
  });

  it("is pale-rimmed, and lit by a warm glow drawn under it", () => {
    const commands = sleeperCommands(AT, 0, 0, false);
    expect(commands[0]?.kind).toBe("glow");
    expect(commands[0]?.colour).toBe(SLEEPER_GLOW);
    for (const command of commands) {
      if (command.kind === "body" || command.kind === "head") {
        expect(command.rim).toBe(SLEEPER_RIM);
        expect(lightness(command.rim)).toBeGreaterThan(lightness(command.colour));
      }
    }
  });

  it("wears no team's colour", () => {
    const colours = sleeperCommands(AT, 0, 0.7, false).map(({ colour }) => colour);
    for (const team of ["ally", "enemy", "third", "self"] as const) {
      expect(colours).not.toContain(teamColour(team));
    }
    expect(colours).toContain(SLEEPER_GREY);
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
