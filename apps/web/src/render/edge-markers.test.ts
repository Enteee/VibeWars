import { describe, expect, it } from "vitest";

import { EDGE_INSET_PX, edgeMarkers, type EdgeBody } from "./edge-markers.js";

const VIEW = { x: 500, y: 500, zoom: 0.5 };
const SCREEN = { width: 800, height: 600 };

const body = (overrides: Partial<EdgeBody>): EdgeBody => ({
  id: "b",
  kind: "foe",
  position: { x: 500, y: 500 },
  dead: false,
  targeted: false,
  ...overrides,
});

describe("edgeMarkers", () => {
  it("puts a body due right on the right inset edge, pointing right", () => {
    const [marker, ...rest] = edgeMarkers([body({ position: { x: 3_000, y: 500 } })], VIEW, SCREEN);
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
      ),
    ).toEqual([]);
  });
});
