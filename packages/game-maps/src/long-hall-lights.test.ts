import { describe, expect, it } from "vitest";

import { validateMapData } from "./schema.js";
import longHallData from "../maps/arena-long-hall/map.json" with { type: "json" };

const MAP = validateMapData(longHallData);
/** How near a mouth its torch stands (#3236). */
const NEAR = 80;

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function boxOf(id: string, boxes: readonly { id: string; area?: unknown; footprint?: unknown }[]) {
  const found = boxes.find((each) => each.id === id);
  const box = (found?.area ?? found?.footprint) as Box | undefined;
  if (box === undefined) throw new Error(`no ${id}`);
  return box;
}

/** The light on `layer` nearest `at`, and how far it is. */
function nearestLight(at: { x: number; y: number }, layer: number) {
  const lights = (MAP.lighting?.lights ?? []).filter((light) => light.layer === layer);
  return lights
    .map((light) => ({
      light,
      distance: Math.hypot(light.position.x - at.x, light.position.y - at.y),
    }))
    .sort((a, b) => a.distance - b.distance)[0];
}

describe("Long Hall's crypt mouths (#3236)", () => {
  const westSteps = boxOf("crypt-west-steps", MAP.transitions);
  const eastSteps = boxOf("crypt-east-steps", MAP.transitions);
  const westVault = boxOf("crypt-west-vault", MAP.tunnels);
  const eastVault = boxOf("crypt-east-vault", MAP.tunnels);
  // A stair's head is its uphill edge; a vault's end is where it opens on its dais.
  const mouths = {
    west: [
      { at: { x: westSteps.x + westSteps.width / 2, y: westSteps.y + westSteps.height }, layer: 1 },
      { at: { x: westVault.x + westVault.width, y: westVault.y + westVault.height / 2 }, layer: 0 },
    ],
    east: [
      { at: { x: eastSteps.x + eastSteps.width / 2, y: eastSteps.y }, layer: 1 },
      { at: { x: eastVault.x, y: eastVault.y + eastVault.height / 2 }, layer: 0 },
    ],
  };

  it("lights each stair head and each vault end within 80 units, on its own layer", () => {
    for (const { at, layer } of [...mouths.west, ...mouths.east]) {
      expect(nearestLight(at, layer)?.distance).toBeLessThanOrEqual(NEAR);
    }
  });

  it("lights a passage's two ends alike: warm in the west, cold in the east", () => {
    const colours = (side: keyof typeof mouths) =>
      mouths[side].map(({ at, layer }) => nearestLight(at, layer)?.light.colour);
    expect(colours("west")).toEqual([0xffb060, 0xffb060]);
    expect(colours("east")).toEqual([0x9fc4ff, 0x9fc4ff]);
  });
});
