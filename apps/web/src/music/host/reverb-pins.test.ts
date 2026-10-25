import { describe, expect, it } from "vitest";

import { reverbPins } from "./reverb-pins.js";

describe("reverbPins", () => {
  it("keeps the first room each orbit asks for", () => {
    const pins = reverbPins();
    expect(pins.pin({ s: "supersaw", room: 0.8, roomsize: 7, orbit: 2 })).toEqual({
      s: "supersaw",
      room: 0.8,
      roomsize: 7,
      orbit: 2,
    });
    expect(pins.pin({ s: "recorder", room: 0.7, roomsize: 6, orbit: 2 })).toEqual({
      s: "recorder",
      room: 0.7,
      roomsize: 7,
      orbit: 2,
    });
  });

  it("leaves another orbit's room, and an event that sets none, alone", () => {
    const pins = reverbPins();
    pins.pin({ room: 0.8, roomsize: 7, orbit: 2 });
    expect(pins.pin({ room: 0.5, roomsize: 3 })).toEqual({ room: 0.5, roomsize: 3 });
    const unset = { s: "harp", room: 0.6, orbit: 2 };
    expect(pins.pin(unset)).toBe(unset);
  });

  it("pins every field that rebuilds the reverb, and copies rather than edits", () => {
    const pins = reverbPins();
    pins.pin({ roomsize: 7, roomfade: 0.1, roomlp: 8000, roomdim: 400, orbit: 2 });
    const asked = { roomsize: 5, roomfade: 0.5, roomlp: 2000, roomdim: 900, orbit: 2 };
    expect(pins.pin(asked)).toEqual({
      roomsize: 7,
      roomfade: 0.1,
      roomlp: 8000,
      roomdim: 400,
      orbit: 2,
    });
    expect(asked.roomsize).toBe(5);
  });

  it("lets the next track set its own room after a reset", () => {
    const pins = reverbPins();
    pins.pin({ roomsize: 7, orbit: 2 });
    pins.reset();
    expect(pins.pin({ roomsize: 9, orbit: 2 })).toEqual({ roomsize: 9, orbit: 2 });
  });

  it("passes a value that is not an object through", () => {
    expect(reverbPins().pin(3)).toBe(3);
  });
});
