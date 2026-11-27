import { afterEach, describe, expect, it, vi } from "vitest";

import { capturing, exposeCaptureState } from "./capture-events.js";

describe("capturing (#3811)", () => {
  it("records only when the page asks", () => {
    expect(capturing("?capture")).toBe(true);
    expect(capturing("?splash&capture=1")).toBe(true);
    expect(capturing("")).toBe(false);
    expect(capturing("?captured")).toBe(false);
  });
});

describe("exposeCaptureState (#3982)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is on the window only with ?capture, and reads what it is given", () => {
    const page = {};
    vi.stubGlobal("window", page);
    const read = () => ({ position: { x: 1, y: 2 }, gatesOpen: [true] });
    exposeCaptureState("", read);
    expect(Reflect.get(page, "__captureState")).toBeUndefined();
    exposeCaptureState("?capture", read);
    const exposed = Reflect.get(page, "__captureState") as typeof read;
    expect(exposed()).toEqual({ position: { x: 1, y: 2 }, gatesOpen: [true] });
  });
});
