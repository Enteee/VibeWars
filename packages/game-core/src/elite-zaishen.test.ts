import { describe, expect, it } from "vitest";

import { drawZaishen, zaishenMoraleBoost } from "./elite-zaishen.js";
import { getProfession } from "./professions.js";

/** A repeatable `random`, from `seed`. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe("the Elite Zaishen Battle's morale boost (#2692)", () => {
  it.each([
    [0, 10],
    [29, 10],
    [30, 8],
    [59, 8],
    [79, 6],
    [99, 4],
    [119, 2],
    [120, 0],
    [121, 0],
  ])("after %d s gives %d%%", (seconds, morale) => {
    expect(zaishenMoraleBoost(seconds)).toBe(morale);
  });
});

describe("the six Zaishen (#2692)", () => {
  it("are 2 Monks, an Elementalist and 3 distinct of the drawn four", () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const six = drawZaishen(seeded(seed));
      const professions = six.map(({ build }) => build.primaryProfession);
      expect(professions.slice(0, 3)).toEqual(["monk", "monk", "elementalist"]);
      const drawn = professions.slice(3);
      expect(new Set(drawn).size).toBe(3);
      expect(["warrior", "ranger", "mesmer", "necromancer"]).toEqual(expect.arrayContaining(drawn));
    }
  });

  it("are the same for the same seed", () => {
    expect(drawZaishen(seeded(7))).toEqual(drawZaishen(seeded(7)));
  });

  it("are named by profession, a second one numbered", () => {
    const six = drawZaishen(seeded(3));
    expect(six.slice(0, 3).map(({ name }) => name)).toEqual([
      "Zaishen Monk",
      "Zaishen Monk 2",
      "Zaishen Elementalist",
    ]);
    const fourth = six[3];
    expect(fourth?.name).toBe(
      `Zaishen ${getProfession(fourth?.build.primaryProfession ?? "warrior").name}`,
    );
  });
});
