import * as core from "@strudel/core";
import { describe, expect, it } from "vitest";

import { catchUpTick, leadClock, type LeadClock } from "./lead-clock.js";

/** Onsets at 5 a second, from cycle 0. */
const CPS = 5;
const TICK = 0.1;
/** The cyclist's own lookahead: its interval plus its overlap. */
const LOOKAHEAD = 0.2;
const LEAD = 0.75;

interface Outcome {
  /** Onsets handed over, as cycle numbers. */
  readonly begins: readonly number[];
  /** Onsets handed over after the audio clock had passed them. */
  readonly late: number;
  /** Onsets missing between the first and the last. */
  readonly missing: number;
}

/**
 * Strudel's own scheduler for `seconds` of audio time, ticked every 0.1 s
 * except while the main thread is stalled between `stall.from` and
 * `stall.to`, when it is not ticked at all.
 */
async function run(
  clock: (audio: () => number) => () => number,
  stall: { readonly from: number; readonly to: number },
  seconds: number,
  /** Seconds between ticks outside the stall. */
  every = TICK,
): Promise<Outcome> {
  const getTime = clock(() => audio);
  let audio = 0;
  let tick: (() => void) | undefined;
  const begins: number[] = [];
  let late = 0;
  const cyclist = new core.Cyclist({
    onTrigger: (hap, _deadline, _duration, _cps, t) => {
      begins.push(hap.whole?.begin.valueOf() ?? Number.NaN);
      if (t < audio) {
        late += 1;
      }
    },
    getTime,
    setInterval: (callback) => {
      tick = callback;
      return 1;
    },
    clearInterval: () => undefined,
  });
  cyclist.setCps(CPS);
  await cyclist.setPattern(core.pure({ s: "x" }), true);
  for (audio = every; audio < seconds; audio += every) {
    if (audio < stall.from || audio >= stall.to) {
      const callback = tick;
      if (callback === undefined) {
        continue;
      }
      if ("deficit" in getTime) {
        catchUpTick(getTime as LeadClock, LOOKAHEAD, callback);
      } else {
        callback();
      }
    }
  }
  cyclist.stop();
  const last = Math.max(...begins);
  const first = Math.min(...begins);
  return { begins, late, missing: last - first + 1 - new Set(begins).size };
}

const STALL = { from: 3, to: 3.6 };

describe("lead clock", () => {
  it("drops notes with no lead: a 0.6 s stall outruns the 0.2 s lookahead", async () => {
    const outcome = await run((audio) => audio, STALL, 8);
    expect(outcome.missing).toBeGreaterThan(0);
  });

  it("drops the same notes with a constant lead, which shifts the lookahead too", async () => {
    const outcome = await run((audio) => () => audio() + LEAD, STALL, 8);
    expect(outcome.missing).toBeGreaterThan(0);
  });

  it("loses no note and hands none over late across a 0.6 s stall", async () => {
    const outcome = await run((audio) => leadClock(audio, LEAD, LOOKAHEAD), STALL, 8);
    expect(outcome.missing).toBe(0);
    expect(outcome.late).toBe(0);
  });

  it("skips to live after a stall of 0.9 s, longer than the lead, with nothing late (#1991)", async () => {
    const outcome = await run(
      (audio) => leadClock(audio, LEAD, LOOKAHEAD),
      { from: 3, to: 3.9 },
      8,
    );
    expect(outcome.missing).toBeGreaterThan(0);
    expect(outcome.late).toBe(0);
  });

  it("keeps up with a main thread that delivers a tick only every 0.3 s", async () => {
    const outcome = await run(
      (audio) => leadClock(audio, LEAD, LOOKAHEAD),
      { from: 99, to: 99 },
      12,
      0.3,
    );
    expect(outcome.missing).toBe(0);
    expect(outcome.late).toBe(0);
  });

  it("does not, one tick at a time", async () => {
    const outcome = await run(
      (audio) => {
        const clock = leadClock(audio, LEAD, LOOKAHEAD);
        const plain = () => clock();
        return plain;
      },
      { from: 99, to: 99 },
      12,
      0.3,
    );
    expect(outcome.missing + outcome.late).toBeGreaterThan(0);
  });

  it("is `lead` ahead of the audio clock when ticks are on time", () => {
    let audio = 4;
    const clock = leadClock(() => audio, LEAD, LOOKAHEAD);
    expect(clock()).toBeCloseTo(4.75, 9);
    audio = 4.1;
    expect(clock()).toBeCloseTo(4.85, 9);
  });

  it("moves on by at most a step after a stall, then catches up", () => {
    let audio = 4;
    const clock = leadClock(() => audio, LEAD, LOOKAHEAD);
    clock();
    audio = 4.9;
    expect(clock()).toBeCloseTo(4.95, 9);
    for (let k = 0; k < 10; k += 1) {
      audio += TICK;
      clock();
    }
    expect(clock()).toBeCloseTo(audio + LEAD, 9);
  });

  it("resumes at the audio clock after a stall longer than the lead (#1321)", () => {
    let audio = 4;
    const clock = leadClock(() => audio, LEAD, LOOKAHEAD);
    clock();
    audio = 30;
    expect(clock()).toBeCloseTo(30, 9);
  });

  it("hands nothing over late once a 5 s stall is over (#1321)", async () => {
    const outcome = await run((audio) => leadClock(audio, LEAD, LOOKAHEAD), { from: 3, to: 8 }, 16);
    expect(outcome.late).toBe(0);
  });

  it("runs one tick, at `lead` ahead, after a stall longer than the lead (#1991)", () => {
    let audio = 4;
    const clock = leadClock(() => audio, LEAD, LOOKAHEAD);
    let ticks = 0;
    const tick = (): void => {
      ticks += 1;
      clock();
    };
    catchUpTick(clock, LOOKAHEAD, tick);
    audio = 5;
    ticks = 0;
    catchUpTick(clock, LOOKAHEAD, tick);
    expect(ticks).toBe(1);
    expect(clock()).toBeCloseTo(5.75, 9);
  });

  it("catches up a tick at a time after a stall within the lead", () => {
    let audio = 4;
    const clock = leadClock(() => audio, LEAD, LOOKAHEAD);
    let ticks = 0;
    const tick = (): void => {
      ticks += 1;
      clock();
    };
    catchUpTick(clock, LOOKAHEAD, tick);
    audio = 4.6;
    ticks = 0;
    catchUpTick(clock, LOOKAHEAD, tick);
    expect(ticks).toBeGreaterThan(1);
    expect(clock()).toBeCloseTo(5.35, 9);
  });

  it("starts from the audio clock again after a reset", () => {
    let audio = 1;
    const clock = leadClock(() => audio, LEAD, LOOKAHEAD);
    clock();
    audio = 100;
    clock.reset();
    expect(clock()).toBeCloseTo(100.75, 9);
  });
});
