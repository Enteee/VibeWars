import { BIOMES, DECK_LOOKS, TRANSITION_LOOKS } from "@vibewars/game-maps/schema";
import { describe, expect, it } from "vitest";

import {
  arenaPalette,
  BIOME,
  BREAKABLE_WALL_LOOK,
  breakableLook,
  pitFloor,
  pitWall,
  shade,
} from "./arena-palette.js";
import { HAND, SIGNALS, wheelDistance } from "./signal-hues.test-support.js";

/** Every colour of a biome's materials. */
function coloursOf(biome: (typeof BIOMES)[number]): number[] {
  const { palette, deck, transition } = BIOME[biome];
  return [palette, ...Object.values(deck), ...Object.values(transition)].flatMap((colours) =>
    Object.values(colours).filter((colour): colour is number => typeof colour === "number"),
  );
}

describe("arenaPalette", () => {
  it("leaves a map of one layer as it was", () => {
    expect(arenaPalette({ layerCount: 1, biome: "hall" })).toMatchObject({
      floor: undefined,
      grid: 0x1a212c,
      wallTop: 0x202836,
    });
  });

  it("gives a layered map direction D", () => {
    expect(arenaPalette({ layerCount: 3, biome: "hall" })).toMatchObject({
      floor: 0x26303f,
      grid: 0x34415a,
      deckTop: 0xa0b2c7,
      wallFace: shade(0x4b5a70, 0.4),
    });
  });
});

describe("BIOME", () => {
  it("draws the hall as it was drawn before biomes", () => {
    expect(BIOME.hall.palette).toEqual({
      floor: 0x26303f,
      grid: 0x34415a,
      wallTop: 0x4b5a70,
      wallFace: shade(0x4b5a70, 0.4),
      wallLit: 0xa9bbd0,
      wallStroke: 0x3b4759,
      support: shade(0x62748c, 0.3),
      deckTop: 0xa0b2c7,
      plank: shade(0xa0b2c7, 0.15),
      slab: shade(0x8fa4bd, 0.4),
      rampTop: 0xa9bbd0,
      rampPanel: shade(0xa9bbd0, 0.15),
      rampChevron: 0x4b5a70,
    });
    expect(BIOME.hall.deck.tower).toEqual({
      top: 0x9aa6b4,
      detail: shade(0x9aa6b4, 0.22),
      side: 0x5c6a7c,
      edgeTop: 0xb8c5d4,
      edgeFace: shade(0x5c6a7c, 0.25),
      support: shade(0x5c6a7c, 0.35),
    });
    expect(BIOME.hall.deck.plinth.edgeTop).toBe(0xe8c27a);
    expect(BIOME.hall.transition.stairs).toEqual({
      top: 0xa2aebd,
      step: 0xccd6e2,
      riser: 0x56637a,
      side: shade(0x8fa4bd, 0.4),
    });
    expect(BIOME.hall.transition.lift).toEqual({
      top: 0xa07a48,
      step: 0xd4a843,
      riser: 0x7a8aa4,
      side: 0x4a3320,
    });
  });

  it("draws the heights in the hall's materials", () => {
    expect(BIOME.heights).toEqual(BIOME.hall);
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
    expect(pitFloor(BIOME.hall.palette)).toBe(shade(0x26303f, 0.45));
    expect(pitWall(BIOME.hall.palette)).toBe(shade(0x4b5a70, 0.6));
    const warm = (colour: number): boolean => colour >> 16 > (colour & 0xff);
    expect(warm(pitFloor(BIOME.desert.palette))).toBe(true);
    expect(warm(pitWall(BIOME.desert.palette))).toBe(true);
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
    expect(palette.floor).toBe(0x232a33);
    expect(palette.wallTop).toBe(0x4a5260);
  });

  it("lays no tile grid on the river ice, and keeps it on every tiled ground", () => {
    expect(BIOME.snow.palette.grid).toBeUndefined();
    for (const biome of BIOMES.filter((name) => name !== "snow")) {
      expect(BIOME[biome].palette.grid, biome).toBeTypeOf("number");
    }
  });

  it.each(["desert", "wilds", "snow", "marsh", "jungle", "cavern"] as const)(
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

describe("shade", () => {
  it("moves each channel toward black", () => {
    expect(shade(0x804020, 0.5)).toBe(0x402010);
  });
});

describe("breakableLook (#3370)", () => {
  it("makes each listed biome's breakable wall its own material, not the stone", () => {
    const looks = (
      ["volcanic", "desert", "snow", "wilds", "marsh", "jungle", "cavern"] as const
    ).map((biome) => breakableLook({ layerCount: 2, biome }));
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
      "blocks",
    ]);
  });

  it("glows only in the volcanic, and keeps the stone in the hall and heights", () => {
    expect(breakableLook({ layerCount: 2, biome: "volcanic" }).glow).toBeDefined();
    for (const biome of ["desert", "snow", "wilds", "hall"] as const) {
      expect(breakableLook({ layerCount: 2, biome }).glow).toBeUndefined();
    }
    expect(breakableLook({ layerCount: 2, biome: "hall" })).toBe(BREAKABLE_WALL_LOOK);
    expect(breakableLook({ layerCount: 2, biome: "heights" })).toBe(BREAKABLE_WALL_LOOK);
  });

  it("is the stone on a map of one layer, whatever its biome", () => {
    for (const biome of BIOMES) {
      expect(breakableLook({ layerCount: 1, biome })).toBe(BREAKABLE_WALL_LOOK);
    }
  });
});
