import { describe, expect, it } from "vitest";

import { REFERENCE_MAPS, planPerf } from "./perf-plan.mjs";

const all = () => true;

describe("planPerf", () => {
  it("gives the reference maps for a render path", () => {
    expect(planPerf(["apps/web/src/render/arena-scene.ts"], all).maps).toEqual(REFERENCE_MAPS);
  });

  it("gives a touched map next to the references", () => {
    const { maps } = planPerf(["packages/game-maps/maps/frozen-crossing/map.json"], all);
    expect(maps).toEqual([...REFERENCE_MAPS, "frozen-crossing"]);
  });

  it("lists a map once, even when it is a reference or touched twice", () => {
    const { maps } = planPerf(
      [
        "packages/game-maps/maps/arena-canyon/map.json",
        "packages/game-maps/maps/arena-canyon/art.json",
      ],
      all,
    );
    expect(maps).toEqual(REFERENCE_MAPS);
  });

  it("skips a deleted map", () => {
    const { maps } = planPerf(["packages/game-maps/maps/gone/map.json"], (id) => id !== "gone");
    expect(maps).toEqual(REFERENCE_MAPS);
  });
});
