import * as core from "@strudel/core";
import { describe, expect, it } from "vitest";

import { crossfade, isTempoMark, overTrack } from "./crossfade.js";

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

/** No sound in these tests rings past its hold. */
const silent = (): boolean => false;

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
    const fired = await play(
      crossfade(voices("old"), voices("new"), 4, 2, { before: 0.5, after: 1.25 }, silent),
      0.5,
      14,
    );

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
    const fired = await play(
      crossfade(voices("old"), voices("new"), 4, 2, { before: 0.5, after: 0.5 }, silent),
      0.5,
      20,
    );
    const old = fired.filter((event) => String(event.sound).startsWith("old"));
    expect(Math.max(...old.map((event) => event.begin))).toBe(5);
  });

  it("plays a sting landing on the switch on its downbeat, the tempo mark still last (#2523)", async () => {
    const sting = core
      .pure({ s: "sting" })
      .filterHaps((hap) => hap.wholeOrPart().begin.valueOf() === 4);
    const fired = await play(
      overTrack(
        crossfade(voices("old"), voices("new"), 4, 2, { before: 0.5, after: 1.25 }, silent),
        sting,
      ),
      0.5,
      14,
    );
    expect(fired.filter((event) => event.t < event.now)).toEqual([]);
    const onset = fired.find((event) => event.sound === "sting");
    expect(onset?.begin).toBe(4);
    expect(onset?.t).toBeCloseTo(8.1, 1);
  });
});

describe("crossfade's outgoing side (#3530)", () => {
  const tempo = { before: 0.5, after: 1 };
  /** Seconds from `cycle` to the end of a fade over [4, 6), the tempo changing on 4. */
  const left = (cycle: number): number => (cycle < 4 ? (4 - cycle) / 0.5 + 2 : 6 - cycle);
  const at = (cycle: number): number => (cycle < 4 ? tempo.before : tempo.after);

  const sounding = (pattern: core.Pattern, name: string) =>
    pattern
      .queryArc(0, 10)
      .filter((hap) => (hap.value as Record<string, unknown>).s === name)
      .map((hap) => {
        const value = hap.value as Record<string, unknown>;
        const begin = hap.whole?.begin.valueOf() ?? Number.NaN;
        return {
          begin,
          value,
          // Hold, release and superdough's 10 ms after it, in seconds.
          lasts: hap.duration.valueOf() / at(begin) + Number(value.release ?? 0.01) + 0.01,
        };
      });

  it("ends a long pad with a long release by the end of the fade", () => {
    // A 2-cycle pad with release(1.6), as the tracks have.
    const pad = core.pure({ s: "pad", release: 1.6, duration: 2 });
    const notes = sounding(crossfade(pad, core.silence, 4, 2, tempo, silent), "pad");
    expect(notes.map((note) => note.begin)).toEqual([0, 1, 2, 3, 4, 5]);
    for (const note of notes) {
      expect(note.lasts).toBeLessThanOrEqual(left(note.begin) + 1e-9);
    }
    // Inside the fade it keeps its envelope's shape: half the time left to release.
    const last = notes.at(-1);
    expect(last?.value.release).toBeCloseTo(0.495);
  });

  it("leaves a note alone that ends in time anyway", () => {
    const notes = sounding(
      crossfade(core.pure({ s: "pluck", release: 0.2 }), core.silence, 4, 2, tempo, silent),
      "pluck",
    );
    expect(notes[0]?.value).toEqual({ s: "pluck", release: 0.2, velocity: 1 });
  });

  it("gives a sample that rings to its end a release that ends it in time", () => {
    const crash = core.pure({ s: "crash" });
    const notes = sounding(
      crossfade(crash, core.silence, 4, 2, tempo, (fields) => fields.s === "crash"),
      "crash",
    );
    for (const note of notes) {
      expect(note.value.release).toBeTypeOf("number");
      expect(note.lasts).toBeLessThanOrEqual(left(note.begin) + 1e-9);
    }
    // Far from the fade, held as it was and fading out over the rest.
    expect(notes[0]?.value.duration).toBeCloseTo(1);
    expect(notes[0]?.value.release).toBeCloseTo(left(0) - 2 - 0.01);
  });

  it("plays nothing of the old track from the end of the fade on", () => {
    const notes = sounding(
      crossfade(core.pure({ s: "pad", release: 1.6 }), core.silence, 4, 2, tempo, silent),
      "pad",
    );
    expect(notes.filter((note) => note.begin >= 6)).toEqual([]);
  });

  it("leaves the incoming side as it is but for the curve", () => {
    const incoming = core.pure({ s: "new", release: 3 });
    const notes = sounding(crossfade(core.silence, incoming, 4, 2, tempo, silent), "new");
    expect(notes.map((note) => note.begin)).toEqual([4, 5, 6, 7, 8, 9]);
    expect(notes[1]?.value).toEqual({ s: "new", release: 3, velocity: Math.sin(Math.PI / 4) });
    expect(notes[2]?.value).toEqual({ s: "new", release: 3, velocity: 1 });
  });
});
