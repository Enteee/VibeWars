import { describe, expect, it } from "vitest";

import { busGate, STOP_RAMP_SECONDS, type GainParam } from "./bus-gate.js";

type Call = readonly [string, ...number[]];

/** An `AudioParam` that is a value and a log. A ramp and a set land at once. */
function fakeParam(initial: number): {
  param: GainParam;
  calls: Call[];
  land: (v: number) => void;
} {
  const calls: Call[] = [];
  let value = initial;
  return {
    calls,
    land: (v) => {
      value = v;
    },
    param: {
      get value() {
        return value;
      },
      cancelScheduledValues: (t) => calls.push(["cancel", t]),
      setValueAtTime: (v, t) => calls.push(["set", v, t]),
      linearRampToValueAtTime: (v, t) => calls.push(["ramp", v, t]),
    },
  };
}

const LEAD = 0.75;

function setup(volume = 0.6) {
  const fake = fakeParam(volume);
  let time = 10;
  const gate = busGate(fake.param, () => time, LEAD, volume);
  return {
    ...fake,
    gate,
    at: (t: number) => {
      time = t;
    },
    last: () => fake.calls.splice(0),
  };
}

describe("bus gate", () => {
  it("ramps to silence on stop, from where the gain is", () => {
    const s = setup();
    s.gate.stop();
    expect(s.last()).toEqual([
      ["cancel", 10],
      ["set", 0.6, 10],
      ["ramp", 0, 10 + STOP_RAMP_SECONDS],
    ]);
  });

  it("restores the volume when the first note can sound", () => {
    const s = setup();
    s.gate.stop();
    s.last();
    s.land(0);
    s.at(20);
    s.gate.open();
    expect(s.last()).toEqual([
      ["cancel", 20],
      ["set", 0, 20],
      ["set", 0.6, 20 + LEAD],
    ]);
  });

  it("does nothing on open when nothing was stopped", () => {
    const s = setup();
    s.gate.open();
    expect(s.last()).toEqual([]);
  });

  it("stays silent through a volume change while stopped, and applies it on open", () => {
    const s = setup();
    s.gate.stop();
    s.last();
    s.land(0);
    s.gate.setVolume(0.3, 0.2);
    expect(s.last()).toEqual([]);
    s.at(11);
    s.gate.open();
    expect(s.last()).toContainEqual(["set", 0.3, 11 + LEAD]);
  });

  it("ramps a volume change while playing, as before", () => {
    const s = setup();
    s.gate.setVolume(0.2, 0.25);
    expect(s.last()).toEqual([
      ["cancel", 10],
      ["set", 0.6, 10],
      ["ramp", 0.2, 10.25],
    ]);
  });

  it("opens to the new level when the volume changes before an open lands", () => {
    const s = setup();
    s.gate.stop();
    s.land(0);
    s.at(20);
    s.gate.open();
    s.last();
    s.at(20.2);
    s.gate.setVolume(0.9, 0.1);
    expect(s.last()).toEqual([
      ["cancel", 20.2],
      ["set", 0, 20.2],
      ["set", 0.9, 20 + LEAD],
    ]);
  });

  it("cancels a pending open when it is stopped again", () => {
    const s = setup();
    s.gate.stop();
    s.land(0);
    s.at(20);
    s.gate.open();
    s.land(0);
    s.last();
    s.at(20.1);
    s.gate.stop();
    expect(s.last()).toEqual([
      ["cancel", 20.1],
      ["set", 0, 20.1],
      ["ramp", 0, 20.1 + STOP_RAMP_SECONDS],
    ]);
  });
});
