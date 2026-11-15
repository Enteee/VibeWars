import { describe, expect, it } from "vitest";

import { MAX_ROWS, planBalance, REFERENCE } from "./balance-plan.mjs";

/** @type {Record<string, number[]>} */
const seats = { "moss-vale": [1, 2, 4], "arena-canyon": [1, 2, 4, 8] };
/** @param {string} id */
const sizes = (id) => seats[id];

describe("planBalance", () => {
  it("gives a touched map at every size it seats", () => {
    const { rows } = planBalance(["packages/game-maps/maps/moss-vale/map.json"], sizes);
    expect(rows).toEqual([1, 2, 4].map((size) => ({ map: "moss-vale", size })));
  });

  it("gives the reference set for a bot rule change", () => {
    const { rows } = planBalance(["packages/game-core/src/match/bot/steer.ts"], sizes);
    expect(rows).toEqual(REFERENCE);
  });

  it("deduplicates a map and bot rules together", () => {
    const { rows } = planBalance(
      [
        "packages/game-core/src/match/bot/steer.ts",
        "packages/game-maps/maps/arena-canyon/map.json",
      ],
      sizes,
    );
    expect(rows.filter((r) => r.map === "arena-canyon" && r.size === 2)).toHaveLength(1);
    expect(rows).toHaveLength(2 + 3);
  });

  it("caps at the limit and lists what it dropped", () => {
    const many = (id) => (id === "m" ? Array.from({ length: 15 }, (_, i) => i + 1) : undefined);
    const { rows, dropped } = planBalance(["packages/game-maps/maps/m/map.json"], many);
    expect(rows).toHaveLength(MAX_ROWS);
    expect(dropped).toHaveLength(3);
  });

  it("skips a deleted map", () => {
    const { rows, dropped } = planBalance(["packages/game-maps/maps/gone/map.json"], sizes);
    expect(rows).toEqual([]);
    expect(dropped).toEqual([]);
  });
});
