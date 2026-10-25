import { pure } from "@strudel/core";
import { describe, expect, it } from "vitest";

import { makeLayer, type TrackClock } from "./layer.js";
import type { LevelChange } from "./transitions.js";

describe("layer", () => {
  it("reads the intensity on the scheduler's clock for a track placed after cycle 0", () => {
    // The fight starts on cycle 20; the track came in on cycle 19.
    const levels: LevelChange[] = [{ from: 20, level: 3 }];
    const clock: TrackClock = { origin: 0 };
    const layer = makeLayer(
      () => levels,
      () => clock,
    );
    const track = layer(3, pure("drums"));
    clock.origin = 19;
    const placed = track.late(clock.origin);
    expect(placed.queryArc(19, 20)).toHaveLength(0);
    expect(placed.queryArc(20, 21)).toHaveLength(1);
  });

  it("keeps each track's own clock, so both sides of a crossfade hear the same level", () => {
    const levels: LevelChange[] = [{ from: 8, level: 2 }];
    let compiling: TrackClock = { origin: 0 };
    const layer = makeLayer(
      () => levels,
      () => compiling,
    );
    const old = layer(2, pure("old"));
    compiling = { origin: 8 };
    const next = layer(2, pure("new")).late(8);
    expect(old.queryArc(8, 9)).toHaveLength(1);
    expect(next.queryArc(8, 9)).toHaveLength(1);
    expect(old.queryArc(7, 8)).toHaveLength(0);
  });
});
