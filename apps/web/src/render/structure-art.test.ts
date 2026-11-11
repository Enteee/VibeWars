import { describe, expect, it } from "vitest";

import { DECK_LOOKS, TRANSITION_LOOKS } from "@vibewars/game-maps/schema";

import { arenaPalette, DECK_LOOK, TRANSITION_LOOK } from "./arena-palette.js";
import { FLAT_STRUCTURE, type MapStructure } from "./arena-snapshot.js";
import {
  DECK_SLAB,
  deckSideLow,
  openEdges,
  rampDrawing,
  rampFrame,
  type Segment,
} from "./layer-surfaces.js";
import { elevationOf } from "./render-order.js";
import {
  DECK_ART,
  TRANSITION_ART,
  deckPalette,
  transitionPalette,
  type DeckFrame,
  type StructurePainter,
} from "./structure-art.js";

const rect = (x: number, y: number, width: number, height: number) =>
  ({ kind: "rect", x, y, width, height }) as const;

/** A painter that keeps every call, by name, with the colour it was made in. */
function recorder(): StructurePainter & {
  readonly calls: { readonly name: string; readonly colour: number }[];
} {
  const calls: { name: string; colour: number }[] = [];
  let fill = -1;
  let stroke = -1;
  return {
    calls,
    fillStyle: (colour) => {
      fill = colour;
    },
    lineStyle: (_width, colour) => {
      stroke = colour;
    },
    fillRect: () => calls.push({ name: "fillRect", colour: fill }),
    fillTriangle: () => calls.push({ name: "fillTriangle", colour: fill }),
    lineBetween: () => calls.push({ name: "lineBetween", colour: stroke }),
  };
}

/** A tower on a platform, its ladder up the tower's south edge, the platform's ramp up its west. */
const TOWER = rect(380, 120, 110, 110);
const PLATFORM = rect(200, 100, 320, 340);
const STRUCTURE: MapStructure = {
  ...FLAT_STRUCTURE,
  layerCount: 4,
  ground: 1,
  decks: [
    { layer: 2, footprint: PLATFORM, look: "platform" },
    { layer: 3, footprint: TOWER, look: "tower" },
  ],
  transitions: [
    { from: 1, to: 2, area: rect(64, 200, 146, 100), uphill: "e", look: "ramp" },
    { from: 2, to: 3, area: rect(415, 225, 40, 150), uphill: "n", look: "ladder" },
  ],
};
const [platformDeck, towerDeck] = STRUCTURE.decks;
const [rampUp, ladderUp] = STRUCTURE.transitions;

function frameOf(deck: MapStructure["decks"][number], open: readonly Segment[]): DeckFrame {
  return {
    footprint: deck.footprint,
    open,
    top: elevationOf(deck.layer, STRUCTURE.ground),
    low: elevationOf(deck.layer - 1, STRUCTURE.ground),
    base: elevationOf(deck.layer - 1, STRUCTURE.ground),
    line: 1,
    palette: deckPalette(arenaPalette(4), deck.look),
  };
}

describe("openEdges (#3067)", () => {
  it("opens a deck's edge only where a transition of its layer meets it", () => {
    if (towerDeck === undefined) throw new Error("no tower");
    const open = openEdges(STRUCTURE, towerDeck);
    const south = open.filter(({ from, to }) => from.y === 230 && to.y === 230);
    // The ladder, 415 to 455, cuts the south edge in two, 2 units either side.
    expect(south.map(({ from, to }) => [from.x, to.x].sort((a, b) => a - b))).toEqual([
      [457, 490],
      [380, 413],
    ]);
    const others = open.filter(({ from, to }) => !(from.y === 230 && to.y === 230));
    expect(others).toHaveLength(3);
  });

  it("leaves every edge whole on a deck no transition meets", () => {
    if (platformDeck === undefined) throw new Error("no platform");
    const alone = { ...STRUCTURE, transitions: [] };
    expect(openEdges(alone, platformDeck)).toHaveLength(4);
    // The ramp's head opens part of the platform's west edge.
    expect(openEdges(STRUCTURE, platformDeck)).toHaveLength(5);
  });
});

describe("a bridge's side face (#3067)", () => {
  it("is a slab whatever stands under it; a platform is solid down a layer", () => {
    if (platformDeck === undefined) throw new Error("no platform");
    const top = elevationOf(platformDeck.layer, STRUCTURE.ground);
    expect(deckSideLow({ ...platformDeck, look: "bridge-log" }, [], STRUCTURE.ground)).toBe(
      top - DECK_SLAB,
    );
    expect(deckSideLow(platformDeck, [], STRUCTURE.ground)).toBe(
      elevationOf(platformDeck.layer - 1, STRUCTURE.ground),
    );
  });
});

describe("DECK_ART (#3067)", () => {
  it.each(DECK_LOOKS.map((look) => [look] as const))("draws a %s deck", (look) => {
    if (towerDeck === undefined) throw new Error("no tower");
    const deck = { ...towerDeck, look };
    const painter = recorder();
    DECK_ART[look].top(painter, frameOf(deck, openEdges(STRUCTURE, deck)));
    DECK_ART[look].side(painter, frameOf(deck, openEdges(STRUCTURE, deck)));
    expect(painter.calls.length).toBeGreaterThan(0);
  });

  it.each(["tower", "wall-walk", "bridge-stone", "bridge-plank"] as const)(
    "stands a %s's parapet or railing on its open edges only",
    (look) => {
      if (towerDeck === undefined) throw new Error("no tower");
      const deck = { ...towerDeck, look };
      const edge = DECK_LOOK[look].edgeFace;
      const parapet = (open: readonly Segment[]): number => {
        const painter = recorder();
        DECK_ART[look].top(painter, frameOf(deck, open));
        return painter.calls.filter(({ colour }) => colour === edge).length;
      };
      expect(parapet([])).toBe(0);
      expect(parapet(openEdges(STRUCTURE, deck))).toBeGreaterThan(0);
    },
  );

  it.each(["platform", "terrace", "bridge-log"] as const)("stands no parapet on a %s", (look) => {
    if (towerDeck === undefined) throw new Error("no tower");
    const deck = { ...towerDeck, look };
    const painter = recorder();
    DECK_ART[look].top(painter, frameOf(deck, openEdges(STRUCTURE, deck)));
    expect(painter.calls.some(({ colour }) => colour === DECK_LOOK[look].edgeFace)).toBe(false);
  });

  it("courses a tower's masonry down to the layer under it, piers a stone bridge's", () => {
    if (towerDeck === undefined) throw new Error("no tower");
    const tower = recorder();
    DECK_ART.tower.side(tower, frameOf(towerDeck, []));
    expect(tower.calls.filter(({ name }) => name === "lineBetween").length).toBeGreaterThan(4);
    const bridge = recorder();
    DECK_ART["bridge-stone"].side(bridge, frameOf({ ...towerDeck, look: "bridge-stone" }, []));
    expect(bridge.calls.filter(({ name }) => name === "fillRect").length).toBeGreaterThanOrEqual(2);
  });
});

describe("TRANSITION_ART (#3067)", () => {
  it.each(TRANSITION_LOOKS.map((look) => [look] as const))("draws a %s", (look) => {
    if (rampUp === undefined) throw new Error("no ramp");
    const ramp = { ...rampUp, look };
    const painter = recorder();
    TRANSITION_ART[look](painter, {
      drawing: rampDrawing(STRUCTURE, ramp),
      frame: rampFrame(STRUCTURE, ramp),
      line: 1,
      palette: transitionPalette(arenaPalette(4), look),
    });
    expect(painter.calls.length).toBeGreaterThan(0);
  });

  it("rungs a ladder across its climb, by the uphill game-core gives it", () => {
    if (ladderUp === undefined) throw new Error("no ladder");
    const painter = recorder();
    const frame = rampFrame(STRUCTURE, ladderUp);
    TRANSITION_ART.ladder(painter, {
      drawing: rampDrawing(STRUCTURE, ladderUp),
      frame,
      line: 1,
      palette: transitionPalette(arenaPalette(4), "ladder"),
    });
    const rungs = painter.calls.filter(({ colour }) => colour === TRANSITION_LOOK.ladder.step);
    // 150 long, a rung every 8: 19 shares, both ends left out.
    expect(rungs).toHaveLength(18);
    // Uphill north: a rung runs east to west, at one height.
    const first = frame.onRamp(0.5, -0.4);
    const second = frame.onRamp(0.5, 0.4);
    expect(first.y).toBeCloseTo(second.y);
    expect(first.x).not.toBeCloseTo(second.x);
  });
});
