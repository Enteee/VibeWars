import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WEAPON_MOTION } from "../render/weapon-pose.js";
import {
  IDLE_SECONDS,
  WALK_SECONDS,
  createCosmeticsPreview,
  loopBeat,
  swingFrame,
  type PreviewHost,
} from "./cosmetics-preview.js";
import { FakeElement } from "./fake-dom.test-support.js";

/** A page whose frames run only when the test says, and are counted. */
function fakeHost(): PreviewHost & {
  readonly pending: Map<number, (now: number) => void>;
  tick(now: number): void;
  hidden: boolean;
  readonly visibility: (() => void)[];
} {
  const pending = new Map<number, (now: number) => void>();
  const visibility: (() => void)[] = [];
  let next = 1;
  const host = {
    pending,
    visibility,
    hidden: false,
    requestFrame: (callback: (now: number) => void) => {
      pending.set(next, callback);
      next += 1;
      return next - 1;
    },
    cancelFrame: (handle: number) => {
      pending.delete(handle);
    },
    reducedMotion: () => false,
    visible: () => !host.hidden,
    onVisibility: (listener: () => void) => {
      visibility.push(listener);
      return () => {
        visibility.splice(visibility.indexOf(listener), 1);
      };
    },
    tick: (now: number) => {
      const due = [...pending.values()];
      pending.clear();
      for (const callback of due) {
        callback(now);
      }
    },
  };
  return host;
}

describe("the cosmetics preview (#3989)", () => {
  beforeEach(() => {
    // A canvas with no 2D context: the loop runs, and paints nothing.
    vi.stubGlobal("document", {
      createElement: () => Object.assign(new FakeElement(), { getContext: () => null }),
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const preview = (host: PreviewHost) =>
    createCosmeticsPreview(
      () => ({}),
      Promise.resolve(undefined),
      () => ({ name: "Aria", guildTag: null }),
      host,
    );

  it("asks for a frame after each frame while started, and none once stopped", () => {
    const host = fakeHost();
    const shown = preview(host);
    expect(host.pending.size).toBe(0);
    shown.start();
    expect(host.pending.size).toBe(1);
    host.tick(16);
    host.tick(32);
    expect(host.pending.size).toBe(1);
    shown.stop();
    expect(host.pending.size).toBe(0);
    expect(host.visibility).toHaveLength(0);
  });

  it("sleeps while the page is hidden and wakes when it is shown", () => {
    const host = fakeHost();
    const shown = preview(host);
    shown.start();
    host.hidden = true;
    for (const listener of host.visibility) {
      listener();
    }
    expect(host.pending.size).toBe(0);
    host.hidden = false;
    for (const listener of host.visibility) {
      listener();
    }
    expect(host.pending.size).toBe(1);
    shown.stop();
  });

  it("names the player on its nameplate", () => {
    const host = fakeHost();
    const shown = preview(host);
    shown.start();
    host.tick(16);
    const plate = (shown.element as unknown as FakeElement).all("cosmetics-preview-plate")[0];
    expect(plate?.all("player-label-name")[0]?.textContent).toBe("Aria");
    shown.stop();
  });

  it("idles, walks, then swings, round and round", () => {
    expect(loopBeat(0.5, 1).kind).toBe("idle");
    expect(loopBeat(IDLE_SECONDS + 1, 1)).toEqual({ kind: "walk", at: 1 });
    expect(loopBeat(IDLE_SECONDS + WALK_SECONDS + 0.2, 1).kind).toBe("swing");
    // With no weapon to swing, the loop is idle and walk only.
    const again = loopBeat(IDLE_SECONDS + WALK_SECONDS + 0.2, 0);
    expect(again.kind).toBe("idle");
    expect(again.at).toBeCloseTo(0.2);
  });

  it("swings through wind-up, strike, hold and recovery, then rests", () => {
    const m = WEAPON_MOTION.sword;
    expect(swingFrame(m, m.windUp / 2).clip.phase).toBe("wind-up");
    expect(swingFrame(m, m.windUp + m.strike / 2).clip.phase).toBe("strike");
    expect(swingFrame(m, m.windUp + m.strike + m.hold / 2).clip.phase).toBe("hold");
    expect(swingFrame(m, m.windUp + m.strike + m.hold + m.recover / 2).clip.phase).toBe("recover");
    expect(swingFrame(m, m.windUp + m.strike + m.hold + m.recover + 0.01).clip.phase).toBe("rest");
  });
});
