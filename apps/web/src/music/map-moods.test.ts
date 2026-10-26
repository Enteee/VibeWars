import { describe, expect, it } from "vitest";

import { ARENA_MAPS } from "../net/maps.js";
import { moodsFor } from "./map-moods.js";

describe("moodsFor", () => {
  it("gives every arena moods of its own, not the unknown map's (#444)", () => {
    const unknown = moodsFor("no-such-map");
    for (const map of ARENA_MAPS) {
      expect(moodsFor(map.id), map.id).not.toBe(unknown);
    }
  });
});
