import { describe, expect, it } from "vitest";

import { TRAINING_MAPS } from "./maps.js";

describe("TRAINING_MAPS", () => {
  it("holds every training arena, validated, by id", () => {
    expect([...TRAINING_MAPS.keys()].sort()).toEqual([
      "training-field",
      "training-hall",
      "training-pillars",
    ]);
    for (const [id, map] of TRAINING_MAPS) {
      expect(map.id).toBe(id);
      expect(map.width).toBeGreaterThan(0);
      expect(map.spawnPoints.length).toBeGreaterThan(0);
    }
  });
});
