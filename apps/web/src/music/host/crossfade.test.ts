import * as core from "@strudel/core";
import { describe, expect, it } from "vitest";

import { crossfade, isTempoMark } from "./crossfade.js";

interface Fired {
  readonly begin: number;
  readonly sound: unknown;
  /** When the event plays, and when it was handed over, in seconds. */
  readonly t: number;
  readonly now: number;
}

/**
 * Strudel's own scheduler on a clock the test moves, playing `pattern`
 * from `cps` for `seconds`: every event it hands over, and when.
 */
async function play(pattern: core.Pattern, cps: number, seconds: number): Promise<Fired[]> {
  const fired: Fired[] = [];
  let now = 0;
  let tick: (() => void) | undefined;
  const cyclist = new core.Cyclist({
    onTrigger: (hap, _deadline, _duration, _cps, t) => {
      if (!isTempoMark(hap.value)) {
        const value = hap.value as Record<string, unknown>;
        fired.push({ begin: hap.whole?.begin.valueOf() ?? Number.NaN, sound: value.s, t, now });
      }
    },
    getTime: () => now,
    setInterval: (callback) => {
      tick = callback;
      return 1;
    },
    clearInterval: () => undefined,
  });
  cyclist.setCps(cps);
  await cyclist.setPattern(pattern, true);
  for (let passed = 0; passed < seconds; passed += 0.1) {
    now += 0.1;
    tick?.();
  }
  cyclist.stop();
  return fired;
}

describe("crossfade", () => {
  // Three voices on every cycle, as a track's downbeat has.
  const voices = (name: string): core.Pattern =>
    core.stack(
      core.pure({ s: `${name}1` }),
      core.pure({ s: `${name}2` }),
      core.pure({ s: `${name}3` }),
    );

  it("plays the new track's whole downbeat, on time, at the new tempo", async () => {
    // From 0.5 cycles a second to 1.25, on cycle 4: second 8.
    const fired = await play(crossfade(voices("old"), voices("new"), 4, 2, 1.25), 0.5, 14);

    // Nothing is handed over after its onset, which superdough would drop.
    expect(fired.filter((event) => event.t < event.now)).toEqual([]);
    const downbeat = fired.filter(
      (event) => event.begin === 4 && String(event.sound).startsWith("new"),
    );
    expect(downbeat.map((event) => event.sound)).toEqual(["new1", "new2", "new3"]);
    for (const event of downbeat) {
      expect(event.t).toBeCloseTo(8.1, 1);
    }
    // One cycle later at the new tempo: 0.8 s after the boundary.
    const next = fired.filter((event) => event.begin === 5 && event.sound === "new1");
    expect(next[0]?.t).toBeCloseTo(8.9, 1);
  });

  it("fades the old track out over the crossfade and stops it there", async () => {
    const fired = await play(crossfade(voices("old"), voices("new"), 4, 2, 0.5), 0.5, 20);
    const old = fired.filter((event) => String(event.sound).startsWith("old"));
    expect(Math.max(...old.map((event) => event.begin))).toBe(5);
  });
});
