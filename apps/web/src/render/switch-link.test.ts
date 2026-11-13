import { describe, expect, it } from "vitest";

import type { MapData } from "@vibewars/game-maps/schema";

import { arenaMap, mapStructure } from "../net/maps.js";
import { linkTargets } from "./switch-link.js";

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
