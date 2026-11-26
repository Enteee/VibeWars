import { describe, expect, it } from "vitest";

import { NO_COVER, type ScreenRect } from "./camera-rig.js";
import { EDGE_INSET_PX, edgeMarkers, type EdgeThing } from "./edge-markers.js";

const VIEW = { x: 500, y: 500, zoom: 0.5 };
const SCREEN = { width: 800, height: 600 };

const body = (overrides: Partial<EdgeThing>): EdgeThing => ({
  id: "b",
  kind: "foe",
  colour: undefined,
  position: { x: 500, y: 500 },
  dead: false,
  targeted: false,
  ...overrides,
});

describe("edgeMarkers", () => {
  it("puts a body due right on the right inset edge, pointing right", () => {
    const [marker, ...rest] = edgeMarkers(
      [body({ position: { x: 3_000, y: 500 } })],
      VIEW,
      SCREEN,
      NO_COVER,
    );
    expect(rest).toEqual([]);
    expect(marker).toMatchObject({ id: "b", kind: "foe", targeted: false, angle: 0 });
    expect(marker?.x).toBeCloseTo(SCREEN.width - EDGE_INSET_PX);
    expect(marker?.y).toBeCloseTo(SCREEN.height / 2);
  });

  it("follows the ray from the centre to a corner", () => {
    const [marker] = edgeMarkers(
      [body({ kind: "friend", targeted: true, position: { x: -1_000, y: -1_000 } })],
      VIEW,
      SCREEN,
      NO_COVER,
    );
    expect(marker).toMatchObject({ kind: "friend", targeted: true });
    expect(marker?.angle).toBeCloseTo((-3 * Math.PI) / 4);
    // Due up-left, the shorter reach (the height) decides where it crosses.
    expect(marker?.y).toBeCloseTo(EDGE_INSET_PX);
    expect(marker?.x).toBeCloseTo(SCREEN.width / 2 - (SCREEN.height / 2 - EDGE_INSET_PX));
  });

  it("marks no body on screen, and no dead one", () => {
    expect(
      edgeMarkers(
        [
          body({ position: { x: 600, y: 400 } }),
          body({ id: "corpse", dead: true, position: { x: 3_000, y: 500 } }),
        ],
        VIEW,
        SCREEN,
        NO_COVER,
      ),
    ).toEqual([]);
  });

  it("keeps a marker out from under the HUD, and marks a body under it", () => {
    const cover = { top: 40, bottom: 160, keepOut: [] };
    // On screen at y 500, but behind the skill bar.
    const [south] = edgeMarkers([body({ position: { x: 500, y: 900 } })], VIEW, SCREEN, cover);
    expect(south?.y).toBeCloseTo(SCREEN.height - cover.bottom - EDGE_INSET_PX);
    expect(south?.x).toBeCloseTo(SCREEN.width / 2);
    expect(south?.angle).toBeCloseTo(Math.PI / 2);
    const [north] = edgeMarkers([body({ position: { x: 500, y: -2_000 } })], VIEW, SCREEN, cover);
    expect(north?.y).toBeCloseTo(cover.top + EDGE_INSET_PX);
  });

  it("marks an objective under the top cover, in its kind and colour, and none in view (#1413)", () => {
    const cover = { top: 120, bottom: 160, keepOut: [] };
    const shrine = body({ id: "capture-point/0", kind: "objective", colour: 0x8b949e });
    // Inside the viewport at y 50, but under the target panel.
    const [marker, ...rest] = edgeMarkers(
      [
        { ...shrine, position: { x: 500, y: 0 } },
        { ...shrine, id: "capture-point/1", position: { x: 500, y: 500 } },
      ],
      VIEW,
      SCREEN,
      cover,
    );
    expect(rest).toEqual([]);
    expect(marker).toMatchObject({
      id: "capture-point/0",
      kind: "objective",
      colour: 0x8b949e,
      targeted: false,
    });
    expect(marker?.y).toBeCloseTo(cover.top + EDGE_INSET_PX);
    expect(marker?.angle).toBeCloseTo(-Math.PI / 2);
  });
});

describe("edgeMarkers' keep-out panels (#1424)", () => {
  // Due right lands on (778, 300); due up on (400, 22).
  const DUE_RIGHT = body({ position: { x: 3_000, y: 500 } });
  const DUE_UP = body({ position: { x: 500, y: -3_000 } });
  // Half a marker and the gap: where a slid marker sits past a panel's end.
  const CLEAR = 6 + 8;

  const markerWith = (thing: EdgeThing, keepOut: readonly ScreenRect[]) =>
    edgeMarkers([thing], VIEW, SCREEN, { ...NO_COVER, keepOut })[0];

  it("slides a marker on the right edge to the panel's nearer end, still pointing at its body", () => {
    const below = markerWith(DUE_RIGHT, [{ left: 700, top: 250, right: 800, bottom: 320 }]);
    expect(below?.x).toBeCloseTo(SCREEN.width - EDGE_INSET_PX);
    expect(below?.y).toBeCloseTo(320 + CLEAR);
    expect(below?.angle).toBeCloseTo(0);
    const above = markerWith(DUE_RIGHT, [{ left: 700, top: 280, right: 800, bottom: 400 }]);
    expect(above?.y).toBeCloseTo(280 - CLEAR);
  });

  it("slides a marker on the top edge left of a panel nearer its left end", () => {
    const marker = markerWith(DUE_UP, [{ left: 380, top: 0, right: 520, bottom: 60 }]);
    expect(marker?.x).toBeCloseTo(380 - CLEAR);
    expect(marker?.y).toBeCloseTo(EDGE_INSET_PX);
    expect(marker?.angle).toBeCloseTo(-Math.PI / 2);
  });

  it("takes the other end when the nearer one is past the corner", () => {
    // The compass in the top right corner: up is out of reach, so below it.
    const right = markerWith(DUE_RIGHT, [{ left: 650, top: 0, right: 800, bottom: 320 }]);
    expect(right?.y).toBeCloseTo(320 + CLEAR);
    const top = markerWith(DUE_UP, [{ left: 390, top: 0, right: 800, bottom: 60 }]);
    expect(top?.x).toBeCloseTo(390 - CLEAR);
  });

  it("does not slide onto a second panel", () => {
    const marker = markerWith(DUE_RIGHT, [
      { left: 700, top: 250, right: 800, bottom: 320 },
      { left: 700, top: 325, right: 800, bottom: 500 },
    ]);
    expect(marker?.y).toBeCloseTo(250 - CLEAR);
  });

  it("steps inward past both panels when together they cover the whole edge in reach", () => {
    // A short window: the compass, then a wider party window right under it.
    const marker = markerWith(DUE_RIGHT, [
      { left: 680, top: 0, right: 800, bottom: 300 },
      { left: 640, top: 302, right: 800, bottom: 600 },
    ]);
    expect(marker?.x).toBeCloseTo(640 - CLEAR);
    expect(marker?.y).toBeCloseTo(300);
    expect(marker?.angle).toBeCloseTo(0);
  });

  it("leaves a marker no panel covers where it was", () => {
    const keepOut = [{ left: 650, top: 0, right: 800, bottom: 200 }];
    expect(markerWith(DUE_RIGHT, keepOut)).toEqual(markerWith(DUE_RIGHT, []));
    expect(markerWith(DUE_RIGHT, [])).toEqual(edgeMarkers([DUE_RIGHT], VIEW, SCREEN, NO_COVER)[0]);
  });
});
