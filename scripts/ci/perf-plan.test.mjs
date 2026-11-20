import { describe, expect, it } from "vitest";

import { REFERENCE_MAPS, benchable, planPerf } from "./perf-plan.mjs";

const all = () => true;

describe("planPerf", () => {
  it("gives the reference maps for a render path", () => {
    expect(planPerf(["apps/web/src/render/arena-scene.ts"], all).maps).toEqual(REFERENCE_MAPS);
  });

  it("gives a touched map next to the references", () => {
    const { maps } = planPerf(["packages/game-maps/maps/frozen-crossing/map.json"], all);
    expect(maps).toEqual([...REFERENCE_MAPS, "frozen-crossing"]);
  });

  it("benches a three-team map when its file is touched", () => {
    const { maps } = planPerf(["packages/game-maps/maps/threefold-keep/map.json"], benchable);
    expect(maps).toEqual([...REFERENCE_MAPS, "threefold-keep"]);
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

  it("skips a map the Hosted lobby never offers", () => {
    const { maps } = planPerf(["packages/game-maps/maps/elite-zaishen-battle/map.json"], all);
    expect(maps).toEqual(REFERENCE_MAPS);
  });

  it("skips a deleted map", () => {
    const { maps } = planPerf(["packages/game-maps/maps/gone/map.json"], (id) => id !== "gone");
    expect(maps).toEqual(REFERENCE_MAPS);
  });
});

describe("benchable", () => {
  it("accepts a two-team map", () => {
    expect(benchable("arena-canyon")).toBe(true);
  });

  it("accepts a three-team map: the menu background fights it too", () => {
    expect(benchable("threefold-keep")).toBe(true);
  });

  it("refuses a map with no folder", () => {
    expect(benchable("no-such-map")).toBe(false);
  });
});
