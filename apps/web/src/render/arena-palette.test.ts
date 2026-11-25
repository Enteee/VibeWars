import {
  ASCENT_ACTS,
  type AscentAct,
  type Biome,
  BIOMES,
  DECK_LOOKS,
  TRANSITION_LOOKS,
} from "@vibewars/game-maps/schema";
import { describe, expect, it } from "vitest";

import {
  ACT_TONES,
  ARENA_BACKGROUND,
  arenaPalette,
  BIOME,
  BREAKABLE_WALL_LOOK,
  breakableLook,
  grade,
  materialsOf,
  PIT_FLOOR_SHADE,
  pitFloor,
  pitWall,
  shade,
  ungradedMaterials,
  WALL_STROKE,
} from "./arena-palette.js";
import { HAND, SIGNALS, wheelDistance } from "./signal-hues.test-support.js";

/** Every colour of a biome's materials, under an Ascent act's if it has one. */
function coloursOf(biome: Biome, ascentAct: AscentAct | null = null): number[] {
  const { palette, deck, transition } = materialsOf({ biome, ascentAct });
  return [palette, ...Object.values(deck), ...Object.values(transition)].flatMap((colours) =>
    Object.values(colours).filter((colour): colour is number => typeof colour === "number"),
  );
}

/** The chiselled stone's breakable wall, in the gothic grade but for its glow. */
const GRADED_STONE = {
  ...BREAKABLE_WALL_LOOK,
  ...Object.fromEntries(
    (
      [
        "top",
        "face",
        "lit",
        "mortar",
        "edge",
        "crack",
        "rubble",
        "rubbleFace",
        "dust",
        "shadow",
      ] as const
    ).map((slot) => [slot, grade(BREAKABLE_WALL_LOOK[slot])]),
  ),
};

describe("arenaPalette", () => {
  it("leaves a map of one layer flat, in the gothic grade", () => {
    expect(arenaPalette({ layerCount: 1, biome: "hall", ascentAct: null })).toMatchObject({
      floor: undefined,
      grid: grade(0x1a212c),
      wallTop: grade(0x202836),
      wallStroke: WALL_STROKE,
    });
  });

  it("gives a layered map direction D, in the gothic grade", () => {
    expect(arenaPalette({ layerCount: 3, biome: "hall", ascentAct: null })).toMatchObject({
      floor: grade(0x26303f),
      grid: grade(0x34415a),
      deckTop: grade(0xa0b2c7),
      wallFace: grade(shade(0x4b5a70, 0.4)),
    });
  });
});

describe("BIOME", () => {
  it("draws the hall as it was drawn before biomes, in the gothic grade", () => {
    expect(BIOME.hall.palette).toEqual({
      floor: grade(0x26303f),
      grid: grade(0x34415a),
      wallTop: grade(0x4b5a70),
      wallFace: grade(shade(0x4b5a70, 0.4)),
      wallLit: grade(0xa9bbd0),
      wallStroke: WALL_STROKE,
      support: grade(shade(0x62748c, 0.3)),
      deckTop: grade(0xa0b2c7),
      plank: grade(shade(0xa0b2c7, 0.15)),
      slab: grade(shade(0x8fa4bd, 0.4)),
      rampTop: grade(0xa9bbd0),
      rampPanel: grade(shade(0xa9bbd0, 0.15)),
      rampChevron: grade(0x4b5a70),
    });
    expect(BIOME.hall.deck.tower).toEqual({
      top: grade(0x9aa6b4),
      detail: grade(shade(0x9aa6b4, 0.22)),
      side: grade(0x5c6a7c),
      edgeTop: grade(0xb8c5d4),
      edgeFace: grade(shade(0x5c6a7c, 0.25)),
      support: grade(shade(0x5c6a7c, 0.35)),
    });
    expect(BIOME.hall.deck.plinth.edgeTop).toBe(grade(0xe8c27a));
    expect(BIOME.hall.transition.stairs).toEqual({
      top: grade(0xa2aebd),
      step: grade(0xccd6e2),
      riser: grade(0x56637a),
      side: grade(shade(0x8fa4bd, 0.4)),
    });
    expect(BIOME.hall.transition.lift).toEqual({
      top: grade(0xa07a48),
      step: grade(0xd4a843),
      riser: grade(0x7a8aa4),
      side: grade(0x4a3320),
    });
  });

  it("draws the heights in the hall's materials, under their own ground marks", () => {
    const { dressing: heightsDressing, ...heights } = BIOME.heights;
    const { dressing: hallDressing, ...hall } = BIOME.hall;
    expect(heights).toEqual(hall);
    expect(heightsDressing.grain).toEqual(hallDressing.grain);
  });

  it("gives every biome every deck and transition look", () => {
    for (const biome of BIOMES) {
      expect(Object.keys(BIOME[biome].deck).sort()).toEqual([...DECK_LOOKS].sort());
      expect(Object.keys(BIOME[biome].transition).sort()).toEqual([...TRANSITION_LOOKS].sort());
    }
  });

  it("draws the desert warm, and keeps brass and iron", () => {
    const { palette, deck, transition } = BIOME.desert;
    const warm = (colour: number): boolean => colour >> 16 > (colour & 0xff);
    expect(warm(palette.floor ?? 0)).toBe(true);
    expect(warm(palette.wallTop)).toBe(true);
    expect(warm(deck.tower.top)).toBe(true);
    expect(deck.plinth.edgeTop).toBe(BIOME.hall.deck.plinth.edgeTop);
    expect(transition.lift.riser).toBe(BIOME.hall.transition.lift.riser);
  });

  it("sinks a pit in the biome's own tones, the hall's as they were (#3329)", () => {
    expect(pitFloor(BIOME.hall.palette)).toBe(shade(grade(0x26303f), PIT_FLOOR_SHADE));
    expect(pitWall(BIOME.hall.palette)).toBe(shade(grade(0x4b5a70), 0.6));
    const warm = (colour: number): boolean => colour >> 16 > (colour & 0xff);
    expect(warm(pitFloor(BIOME.desert.palette))).toBe(true);
    expect(warm(pitWall(BIOME.desert.palette))).toBe(true);
  });

  it("lights a pit's floor enough to read, still darker than the ground at its lip (#4037)", () => {
    const luma = (colour: number): number =>
      0.2126 * (colour >> 16) + 0.7152 * ((colour >> 8) & 0xff) + 0.0722 * (colour & 0xff);
    for (const biome of BIOMES) {
      const { palette } = BIOME[biome];
      const floor = palette.floor ?? ARENA_BACKGROUND;
      expect(pitFloor(palette)).toBe(shade(floor, PIT_FLOOR_SHADE));
      expect(luma(pitFloor(palette))).toBeGreaterThanOrEqual(0.6 * luma(floor));
      expect(luma(pitFloor(palette))).toBeLessThanOrEqual(0.85 * luma(floor));
    }
  });

  it("draws the wilds green, and keeps the hall's dressed stone", () => {
    const { palette, deck } = BIOME.wilds;
    const green = (colour: number): boolean => ((colour >> 8) & 0xff) > colour >> 16;
    expect(green(palette.floor ?? 0)).toBe(true);
    expect(deck.tower.top).toBe(BIOME.hall.deck.tower.top);
  });

  it("draws the snow in low-chroma greys, so the friend blue holds on it", () => {
    const { palette, deck } = BIOME.snow;
    const chroma = (colour: number): number => {
      const channels = [colour >> 16, (colour >> 8) & 0xff, colour & 0xff];
      return Math.max(...channels) - Math.min(...channels);
    };
    for (const colour of [palette.floor ?? 0, palette.wallTop, deck.ledge.top, deck.drift.top]) {
      expect(chroma(colour), `#${colour.toString(16)}`).toBeLessThan(0x20);
    }
    expect(deck.plinth.edgeTop).toBe(BIOME.hall.deck.plinth.edgeTop);
  });

  it("draws the marsh as the wilds' ground a little cooler, low in chroma (#3434)", () => {
    const { palette } = BIOME.marsh;
    const blue = (colour: number): number => colour & 0xff;
    expect(blue(palette.floor ?? 0)).toBeGreaterThan(blue(BIOME.wilds.palette.floor ?? 0));
    const chroma = (colour: number): number => {
      const channels = [colour >> 16, (colour >> 8) & 0xff, colour & 0xff];
      return Math.max(...channels) - Math.min(...channels);
    };
    for (const colour of [palette.floor ?? 0, palette.wallTop, palette.wallFace]) {
      expect(chroma(colour), `#${colour.toString(16)}`).toBeLessThan(0x20);
    }
  });

  it("draws the jungle as a dark wet floor and mossy stone, low in chroma (#3436)", () => {
    const { palette } = BIOME.jungle;
    const chroma = (colour: number): number => {
      const channels = [colour >> 16, (colour >> 8) & 0xff, colour & 0xff];
      return Math.max(...channels) - Math.min(...channels);
    };
    for (const colour of [palette.floor ?? 0, palette.wallTop, palette.wallFace]) {
      expect(chroma(colour), `#${colour.toString(16)}`).toBeLessThan(0x20);
    }
    expect(palette.floor).not.toBe(BIOME.marsh.palette.floor);
  });

  it("draws the cavern as cold slate, low in chroma, its violet only in light (#3444)", () => {
    const { palette } = BIOME.cavern;
    const chroma = (colour: number): number => {
      const channels = [colour >> 16, (colour >> 8) & 0xff, colour & 0xff];
      return Math.max(...channels) - Math.min(...channels);
    };
    for (const colour of [palette.floor ?? 0, palette.wallTop, palette.wallFace]) {
      expect(chroma(colour), `#${colour.toString(16)}`).toBeLessThan(0x20);
    }
    expect(palette.floor).toBe(grade(0x232a33));
    expect(palette.wallTop).toBe(grade(0x4a5260));
  });

  it("lays no tile grid on the river ice, and keeps it on every tiled ground", () => {
    expect(BIOME.snow.palette.grid).toBeUndefined();
    for (const biome of BIOMES.filter((name) => name !== "snow")) {
      expect(BIOME[biome].palette.grid, biome).toBeTypeOf("number");
    }
  });

  it.each(["desert", "wilds", "snow", "marsh", "jungle", "coast", "cavern"] as const)(
    "keeps every %s tone a hand's width from every signal",
    (biome) => {
      const hall = new Set(coloursOf("hall"));
      for (const tone of coloursOf(biome).filter((colour) => !hall.has(colour))) {
        for (const signal of SIGNALS) {
          expect(
            wheelDistance(tone, signal),
            `#${tone.toString(16)} near #${signal.toString(16)}`,
          ).toBeGreaterThan(HAND);
        }
      }
    },
  );
});

describe("materialsOf (#3618)", () => {
  it("leaves a map off the Ascent in its biome's materials", () => {
    for (const biome of BIOMES) {
      expect(materialsOf({ biome, ascentAct: null })).toBe(BIOME[biome]);
    }
  });

  it("lays each act's ground and rock over every biome", () => {
    for (const biome of BIOMES) {
      for (const act of ASCENT_ACTS) {
        const { palette } = materialsOf({ biome, ascentAct: act });
        expect(palette.floor, `${biome} ${act}`).toBe(grade(ACT_TONES[act].ground));
        expect(palette.wallTop, `${biome} ${act}`).toBe(grade(ACT_TONES[act].rock));
      }
    }
    expect(BIOME.hall.palette.floor).not.toBe(ACT_TONES.heavenly.ground);
  });

  it("lays the heavenly marble as one sheet, and keeps the grid under the other acts", () => {
    expect(materialsOf({ biome: "hall", ascentAct: "heavenly" }).palette.grid).toBeUndefined();
    expect(materialsOf({ biome: "hall", ascentAct: "underworld" }).palette.grid).toBeTypeOf(
      "number",
    );
  });

  it.each(BIOMES.flatMap((biome) => ASCENT_ACTS.map((act) => [biome, act] as const)))(
    "keeps every %s tone under the %s act a hand's width from every signal",
    (biome, act) => {
      const hall = new Set(coloursOf("hall"));
      for (const tone of coloursOf(biome, act).filter((colour) => !hall.has(colour))) {
        for (const signal of SIGNALS) {
          expect(
            wheelDistance(tone, signal),
            `#${tone.toString(16)} near #${signal.toString(16)}`,
          ).toBeGreaterThan(HAND);
        }
      }
    },
  );
});

describe("shade", () => {
  it("moves each channel toward black", () => {
    expect(shade(0x804020, 0.5)).toBe(0x402010);
  });
});

describe("breakableLook (#3370)", () => {
  it("makes each listed biome's breakable wall its own material, not the stone", () => {
    const looks = (
      ["volcanic", "desert", "snow", "wilds", "marsh", "jungle", "coast", "cavern"] as const
    ).map((biome) => breakableLook({ layerCount: 2, biome, ascentAct: null }));
    for (const look of looks) {
      expect(look).not.toEqual(BREAKABLE_WALL_LOOK);
    }
    expect(new Set(looks.map(({ face }) => face)).size).toBe(looks.length);
    expect(looks.map(({ courses }) => courses)).toEqual([
      "blocks",
      "bricks",
      "ice",
      "fieldstone",
      "fieldstone",
      "fieldstone",
      "fieldstone",
      "blocks",
    ]);
  });

  it("glows only in the volcanic, and keeps the stone in the hall and heights", () => {
    expect(breakableLook({ layerCount: 2, biome: "volcanic", ascentAct: null }).glow).toBeDefined();
    for (const biome of ["desert", "snow", "wilds", "hall"] as const) {
      expect(breakableLook({ layerCount: 2, biome, ascentAct: null }).glow).toBeUndefined();
    }
    expect(breakableLook({ layerCount: 2, biome: "hall", ascentAct: null })).toEqual(GRADED_STONE);
    expect(breakableLook({ layerCount: 2, biome: "heights", ascentAct: null })).toEqual(
      GRADED_STONE,
    );
  });

  it("is a patch of the act's rock on an Ascent map (#3618)", () => {
    for (const biome of ["hall", "marsh"] as const) {
      const look = breakableLook({ layerCount: 2, biome, ascentAct: "heavenly" });
      expect(look, biome).toEqual(materialsOf({ biome, ascentAct: "heavenly" }).breakable);
      expect(look.face, biome).not.toBe(
        breakableLook({ layerCount: 2, biome, ascentAct: null }).face,
      );
    }
    const hall = breakableLook({ layerCount: 2, biome: "hall", ascentAct: "heavenly" });
    // The hall's stone, tinted from its rock to the act's pale one.
    const sum = (colour: number): number =>
      ((colour >> 16) & 0xff) + ((colour >> 8) & 0xff) + (colour & 0xff);
    expect(sum(hall.face)).toBeGreaterThan(sum(BREAKABLE_WALL_LOOK.face));
    expect(hall.courses).toBe(BREAKABLE_WALL_LOOK.courses);
  });

  it("is the stone on a map of one layer, whatever its biome", () => {
    for (const biome of BIOMES) {
      expect(breakableLook({ layerCount: 1, biome, ascentAct: null })).toEqual(GRADED_STONE);
    }
  });
});

describe("grade (#4056)", () => {
  /** HSL lightness, 0 to 1. */
  const lightness = (colour: number): number => {
    const channels = [colour >> 16, (colour >> 8) & 0xff, colour & 0xff];
    return (Math.max(...channels) + Math.min(...channels)) / 2 / 255;
  };

  it("is pure, keeps black black, and never turns a lighter grey darker", () => {
    expect(grade(0x4b5a70)).toBe(grade(0x4b5a70));
    expect(grade(0x000000)).toBe(0x000000);
    let last = -1;
    for (let level = 0; level <= 0xff; level += 1) {
      const graded = lightness(grade(level * 0x010101));
      expect(graded, `grey ${String(level)}`).toBeGreaterThanOrEqual(last);
      last = graded;
    }
  });

  it("lands the hall's floor and wall top within six points of the gothic mock", () => {
    expect(Math.abs(lightness(BIOME.hall.palette.floor ?? 0) - lightness(0x3a3834))).toBeLessThan(
      0.06,
    );
    expect(Math.abs(lightness(BIOME.hall.palette.wallTop) - lightness(0x5e5a54))).toBeLessThan(
      0.06,
    );
  });

  it("puts every material of every biome through the grade once, but decor and the crack glow", () => {
    /** `value` with every colour in it graded. */
    const graded = (value: unknown): unknown =>
      typeof value === "number"
        ? grade(value)
        : Array.isArray(value)
          ? value.map(graded)
          : typeof value === "object" && value !== null
            ? Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, graded(inner)]))
            : value;
    for (const biome of BIOMES) {
      const after = BIOME[biome];
      const { decor, palette, breakable, ...before } = ungradedMaterials(biome);
      expect(after, biome).toMatchObject({
        ...(graded(before) as object),
        palette: { ...(graded(palette) as object), wallStroke: WALL_STROKE },
        breakable: {
          ...(graded(breakable) as object),
          courses: breakable.courses,
          glow: breakable.glow,
        },
        decor,
      });
    }
  });
});
