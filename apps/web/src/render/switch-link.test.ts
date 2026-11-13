import { describe, expect, it } from "vitest";

import type { MapData } from "@vibewars/game-maps/schema";

import { arenaMap, mapStructure } from "../net/maps.js";
import { dotsAlong, linkTargets, switchFlashAlpha, switchLinkAlpha } from "./switch-link.js";

function map(id: string): MapData {
  const found = arenaMap(id);
  if (found === undefined) {
    throw new Error(`no map ${id}`);
  }
  return found;
}

describe("linkTargets (#3236)", () => {
  it("finds the portcullis Long Hall's west lever opens, where it is drawn", () => {
    const longHall = map("arena-long-hall");
    expect(linkTargets("crypt-west-lever", longHall)).toEqual([
      {
        id: "crypt-west-portcullis",
        kind: "portcullis",
        source: "gate",
        at: longHall.gates.findIndex((gate) => gate.id === "crypt-west-portcullis"),
        position: { x: 1852, y: 1310 },
        outline: [
          { x: 1840, y: 1260 },
          { x: 1864, y: 1260 },
          { x: 1864, y: 1360 },
          { x: 1840, y: 1360 },
        ],
        layer: 0,
      },
    ]);
  });

  it("calls Canyon's switched rope bridge a bridge", () => {
    const canyon = map("arena-canyon");
    const [lever] = canyon.switches ?? [];
    expect(linkTargets(lever?.id ?? "", canyon)).toEqual([
      expect.objectContaining({
        id: "rope-bridge",
        kind: "bridge",
        source: "deck",
        at: 0,
        position: { x: 1420, y: 815 },
        layer: 2,
      }),
    ]);
  });

  it("finds nothing for a lever the map does not have", () => {
    expect(linkTargets("no-such-lever", map("arena-long-hall"))).toEqual([]);
  });

  it("is in every map's structure, by switch in the map's order", () => {
    const { switchTargets } = mapStructure("arena-long-hall");
    expect(switchTargets.map((targets) => targets.map(({ id }) => id))).toEqual([
      ["crypt-west-portcullis"],
      ["crypt-east-portcullis"],
    ]);
  });
});

describe("the link's look (#3236)", () => {
  it("flashes a thrown lever's targets for 1.5 s, fading", () => {
    expect(switchFlashAlpha(undefined)).toBe(0);
    expect(switchFlashAlpha(0)).toBe(1);
    expect(switchFlashAlpha(0.75)).toBeCloseTo(0.5);
    expect(switchFlashAlpha(1.5)).toBe(0);
  });

  it("pulses, and holds steady under reduced motion", () => {
    const pulse = [0, 0.3, 0.6, 0.9].map((now) => switchLinkAlpha(now, false));
    expect(new Set(pulse).size).toBeGreaterThan(1);
    expect(pulse.every((alpha) => alpha >= 0.4 && alpha <= 1)).toBe(true);
    expect([0, 0.3, 0.6].map((now) => switchLinkAlpha(now, true))).toEqual([1, 1, 1]);
  });

  it("dots the line end to end", () => {
    const dots = dotsAlong({ x: 0, y: 0 }, { x: 0, y: 100 }, 10);
    expect(dots).toHaveLength(11);
    expect(dots[0]).toEqual({ x: 0, y: 0 });
    expect(dots[10]).toEqual({ x: 0, y: 100 });
  });
});
