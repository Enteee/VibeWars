import * as core from "@strudel/core";
import { describe, expect, it } from "vitest";

import { crossfade, isTempoMark, overTrack, type Rings, type SwitchTempo } from "./crossfade.js";
import { placedAt } from "./layer.js";
import { fadingIn, fadingOut, FULL } from "./transitions.js";

interface Fired {
  readonly begin: number;
  readonly sound: unknown;
  readonly velocity: unknown;
  /** When the event plays, and when it was handed over, in seconds. */
  readonly t: number;
  readonly now: number;
  /** The scheduler's tempo when it was handed over. */
  readonly cps: number;
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
    onTrigger: (hap, _deadline, _duration, cps, t) => {
      if (!isTempoMark(hap.value)) {
        const value = hap.value as Record<string, unknown>;
        fired.push({
          begin: hap.whole?.begin.valueOf() ?? Number.NaN,
          sound: value.s,
          velocity: value.velocity,
          t,
          now,
          cps,
        });
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

/** A switch from `outgoing`, playing from cycle 0, to `incoming`, landing on `lands` after a fade of `cycles`. */
function switched(
  outgoing: core.Pattern,
  incoming: core.Pattern,
  lands: number,
  cycles: number,
  tempo: SwitchTempo,
  rings: Rings = silent,
): core.Pattern {
  return crossfade(
    { pattern: placedAt(outgoing, 0), gain: fadingOut(FULL, lands - cycles, cycles) },
    { pattern: placedAt(incoming, lands), gain: fadingIn(lands, cycles) },
    lands,
    tempo,
    rings,
  );
}

describe("a switch (#3983)", () => {
  // Three voices on every beat, as a track's downbeat has.
  const voices = (name: string): core.Pattern =>
    core
      .stack(
        core.pure({ s: `${name}1` }),
        core.pure({ s: `${name}2` }),
        core.pure({ s: `${name}3` }),
      )
      .fast(4);
  // 66 and 150 BPM, four beats a cycle: the slowest and the fastest tracks.
  const slow = 66 / 60 / 4;
  const fast = 150 / 60 / 4;

  it("fades the outgoing song out at its own tempo, and changes the tempo only once it is silent", async () => {
    const fired = await play(
      switched(voices("old"), voices("new"), 4, 1, { before: slow, after: fast }),
      slow,
      22,
    );
    expect(fired.filter((event) => event.t < event.now)).toEqual([]);
    const old = fired.filter((event) => event.sound === "old1");
    // Every note of the outgoing song is on its own clock.
    for (const event of old) {
      expect(event.t).toBeCloseTo(event.begin / slow + 0.1, 1);
      expect(event.cps).toBe(slow);
    }
    expect(Math.max(...old.map((event) => event.begin))).toBe(3.75);
    expect(old.filter((event) => event.begin < 3).every((event) => event.velocity === 1)).toBe(
      true,
    );
    const fading = old.filter((event) => event.begin >= 3).map((event) => event.velocity);
    expect(fading).toEqual([
      1,
      ...[1, 2, 3].map((beat) => expect.closeTo(Math.cos((beat * Math.PI) / 8))),
    ]);
  });

  it("starts the incoming song on its downbeat at its tempo, fading in over its first cycle", async () => {
    const fired = await play(
      switched(voices("old"), voices("new"), 4, 1, { before: slow, after: fast }),
      slow,
      22,
    );
    const landing = 4 / slow + 0.1;
    const downbeat = fired.filter(
      (event) => event.begin === 4 && String(event.sound).startsWith("new"),
    );
    expect(downbeat.map((event) => event.sound)).toEqual(["new1", "new2", "new3"]);
    for (const event of downbeat) {
      expect(event.t).toBeCloseTo(landing, 1);
    }
    const incoming = fired.filter((event) => event.sound === "new1" && event.begin < 5.5);
    for (const event of incoming) {
      expect(event.t).toBeCloseTo(landing + (event.begin - 4) / fast, 1);
    }
    expect(incoming.map((event) => event.velocity)).toEqual([
      0,
      ...[1, 2, 3].map((beat) => expect.closeTo(Math.sin((beat * Math.PI) / 8))),
      1,
      1,
    ]);
  });

  it("plays a sting landing on the switch on its downbeat, the tempo mark still last (#2523)", async () => {
    const sting = core
      .pure({ s: "sting" })
      .filterHaps((hap) => hap.wholeOrPart().begin.valueOf() === 4);
    const fired = await play(
      overTrack(switched(voices("old"), voices("new"), 4, 1, { before: 0.5, after: 1.25 }), sting),
      0.5,
      14,
    );
    expect(fired.filter((event) => event.t < event.now)).toEqual([]);
    const onset = fired.find((event) => event.sound === "sting");
    expect(onset?.begin).toBe(4);
    expect(onset?.t).toBeCloseTo(8.1, 1);
  });
});

describe("a switch's outgoing side (#3530)", () => {
  const tempo = { before: 0.5, after: 1 };
  /** Seconds from `cycle` to the landing on 4, at the outgoing tempo throughout. */
  const left = (cycle: number): number => (4 - cycle) / tempo.before;

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
          lasts: hap.duration.valueOf() / tempo.before + Number(value.release ?? 0.01) + 0.01,
        };
      });

  it("ends a long pad with a long release by the landing", () => {
    // A 2-cycle pad with release(1.6), as the tracks have.
    const pad = core.pure({ s: "pad", release: 1.6, duration: 2 });
    const notes = sounding(switched(pad, core.silence, 4, 1, tempo), "pad");
    expect(notes.map((note) => note.begin)).toEqual([0, 1, 2, 3]);
    for (const note of notes) {
      expect(note.lasts).toBeLessThanOrEqual(left(note.begin) + 1e-9);
    }
    // Inside the fade it keeps its envelope's shape: half the time left to release.
    const last = notes.at(-1);
    expect(last?.value.release).toBeCloseTo(0.995);
  });

  it("leaves a note alone that ends in time anyway", () => {
    const notes = sounding(
      switched(core.pure({ s: "pluck", release: 0.2 }), core.silence, 4, 1, tempo),
      "pluck",
    );
    expect(notes[0]?.value).toEqual({ s: "pluck", release: 0.2, velocity: 1 });
  });

  it("gives a sample that rings to its end a release that ends it in time", () => {
    const crash = core.pure({ s: "crash" });
    const notes = sounding(
      switched(crash, core.silence, 4, 1, tempo, (fields) => fields.s === "crash"),
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

  it("triggers nothing of the outgoing song from the landing on", () => {
    const notes = sounding(
      switched(core.pure({ s: "pad", release: 1.6 }), core.silence, 4, 1, tempo),
      "pad",
    );
    expect(notes.filter((note) => note.begin >= 4)).toEqual([]);
  });

  it("leaves the incoming side as it is but for the curve", () => {
    const incoming = core.pure({ s: "new", release: 3 }).fast(2);
    const notes = sounding(switched(core.silence, incoming, 4, 1, tempo), "new");
    expect(notes.map((note) => note.begin).slice(0, 4)).toEqual([4, 4.5, 5, 5.5]);
    expect(notes[1]?.value).toEqual({ s: "new", release: 3, velocity: Math.sin(Math.PI / 4) });
    expect(notes[2]?.value).toEqual({ s: "new", release: 3, velocity: 1 });
  });
});
