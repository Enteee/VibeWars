import type { ClientIntent } from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import { LOOK_STATION, lockedIntent } from "./movement-lock.js";

const WALKING: readonly ClientIntent[] = [
  { kind: "move", dirX: 0, dirY: -1 },
  { kind: "walk-to", x: 10, y: 20, layer: 0 },
];
const OTHERS: readonly ClientIntent[] = [
  { kind: "use-skill", slot: 0 },
  { kind: "target", targetSessionId: "tutor" },
  { kind: "stop" },
];

describe("lockedIntent (#3970)", () => {
  it("drops walking, by keys or by a click, during the look station", () => {
    for (const intent of WALKING) {
      expect(lockedIntent(LOOK_STATION, intent)).toBe(true);
    }
  });

  it("passes casting, targeting and stopping during the look station", () => {
    for (const intent of OTHERS) {
      expect(lockedIntent(LOOK_STATION, intent)).toBe(false);
    }
  });

  it("passes everything during any other station, and with none running", () => {
    for (const station of ["walk", "step-in", undefined]) {
      for (const intent of [...WALKING, ...OTHERS]) {
        expect(lockedIntent(station, intent)).toBe(false);
      }
    }
  });
});
