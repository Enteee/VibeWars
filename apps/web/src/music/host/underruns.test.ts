import { describe, expect, it } from "vitest";

import { createUnderrunProbe, type OutputClock } from "./underruns.js";

/** A context whose clocks the test moves: seconds on the audio clock, ms on the wall clock. */
function fakeContext(): OutputClock & {
  state: AudioContextState;
  contextTime: number;
  performanceTime: number;
  changed(): void;
  listener?: (() => void) | undefined;
} {
  const context = {
    state: "running" as AudioContextState,
    contextTime: 1,
    performanceTime: 1000,
    listener: undefined as (() => void) | undefined,
    getOutputTimestamp() {
      return { contextTime: context.contextTime, performanceTime: context.performanceTime };
    },
    addEventListener(_type: "statechange", listener: () => void) {
      context.listener = listener;
    },
    changed() {
      context.listener?.();
    },
  };
  return context;
}

describe("createUnderrunProbe", () => {
  it("counts nothing while both clocks advance together", () => {
    const context = fakeContext();
    const probe = createUnderrunProbe(context);
    expect(probe.take()).toEqual({ underruns: 0, underrunMs: 0 });
    context.contextTime += 1;
    context.performanceTime += 1000;
    expect(probe.take()).toEqual({ underruns: 0, underrunMs: 0 });
  });

  it("counts the wall time the audio clock stood still as one underrun", () => {
    const context = fakeContext();
    const probe = createUnderrunProbe(context);
    probe.take();
    context.contextTime += 0.95;
    context.performanceTime += 1000;
    const taken = probe.take();
    expect(taken.underruns).toBe(1);
    expect(taken.underrunMs).toBeCloseTo(50, 6);
  });

  it("treats drift under the skew band as none", () => {
    const context = fakeContext();
    const probe = createUnderrunProbe(context);
    probe.take();
    context.contextTime += 0.999;
    context.performanceTime += 1000;
    expect(probe.take()).toEqual({ underruns: 0, underrunMs: 0 });
  });

  it("counts nothing across a suspend and a resume", () => {
    const context = fakeContext();
    const probe = createUnderrunProbe(context);
    probe.take();
    context.state = "suspended";
    context.performanceTime += 1000;
    expect(probe.take()).toEqual({ underruns: 0, underrunMs: 0 });
    context.state = "running";
    context.performanceTime += 5000;
    context.contextTime += 0.1;
    expect(probe.take()).toEqual({ underruns: 0, underrunMs: 0 });
    context.contextTime += 1;
    context.performanceTime += 1000;
    expect(probe.take()).toEqual({ underruns: 0, underrunMs: 0 });
  });

  it("counts nothing when a suspend and a resume fall between two readings", () => {
    const context = fakeContext();
    const probe = createUnderrunProbe(context);
    probe.take();
    context.changed();
    context.performanceTime += 4000;
    context.contextTime += 0.2;
    expect(probe.take()).toEqual({ underruns: 0, underrunMs: 0 });
  });

  it("is null where the API is missing or the context has not played", () => {
    expect(createUnderrunProbe({ state: "running" }).take()).toEqual({
      underruns: null,
      underrunMs: null,
    });
    const context = fakeContext();
    context.contextTime = 0;
    context.performanceTime = 0;
    expect(createUnderrunProbe(context).take()).toEqual({ underruns: null, underrunMs: null });
  });
});
