import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeElement } from "./fake-dom.test-support.js";
import { showSplash, type SplashOptions } from "./splash-screen.js";
import { SPLASH_CRASH_OFFSET_MS, SPLASH_MEET_MS, SPLASH_MUSIC_WAIT_MS } from "./splash-timeline.js";

const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock("./recharge-overlay.js", () => ({ prefersReducedMotion: () => motion.reduced }));

const NOW_EPOCH = 1_780_000_000_000;

describe("the splash's meeting with the music (#2936)", () => {
  let input: ((event: { type: string }) => void) | undefined;
  let frame: (() => void) | undefined;
  let nowMs = 0;

  const advance = (ms: number): void => {
    nowMs += ms;
    frame?.();
  };

  beforeEach(() => {
    motion.reduced = false;
    nowMs = 1000;
    input = undefined;
    vi.stubGlobal("document", { createElement: () => new FakeElement() });
    vi.stubGlobal("window", {
      addEventListener: (_type: string, handler: typeof input) => {
        input = handler;
      },
      removeEventListener: () => undefined,
    });
    vi.stubGlobal("requestAnimationFrame", (callback: () => void) => {
      frame = callback;
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
    vi.spyOn(performance, "now").mockImplementation(() => nowMs);
    vi.spyOn(Date, "now").mockImplementation(() => NOW_EPOCH + nowMs);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const start = (
    playTheme: SplashOptions["playTheme"],
  ): { root: FakeElement; onDone: ReturnType<typeof vi.fn>; end: () => void } => {
    const parent = new FakeElement();
    const onDone = vi.fn();
    const splash = showSplash(parent as unknown as HTMLElement, {
      startFight: () => new Promise(() => undefined),
      playTheme,
      onDone,
    });
    return {
      root: parent.children[0] ?? new FakeElement(),
      onDone,
      end: () => {
        splash.end();
      },
    };
  };
  const press = (): void => {
    input?.({ type: "pointerdown" });
  };

  it("asks for the theme on the first input, timed for the meet, not at the prompt", () => {
    const playTheme = vi.fn(() => false);
    const { root } = start(playTheme);
    expect(playTheme).not.toHaveBeenCalled();
    press();
    expect(playTheme).toHaveBeenCalledTimes(1);
    expect(playTheme.mock.calls[0]?.[0 as never]).toBe(
      NOW_EPOCH + nowMs + SPLASH_MEET_MS - SPLASH_CRASH_OFFSET_MS,
    );
    advance(SPLASH_MEET_MS + 300);
    expect(root.dataset.phase).toBe("prompt");
    expect(playTheme).toHaveBeenCalledTimes(1);
  });

  it("without music keeps the fixed picture", () => {
    const { root } = start(() => false);
    press();
    advance(999);
    expect(root.dataset.phase).toBe("armed");
    advance(1);
    expect(root.dataset.phase).toBe("flying");
    advance(2000);
    expect(root.dataset.phase).toBe("flash");
  });

  it("holds the words until the music says, and flashes on the crash", () => {
    let heard: ((at: number) => void) | undefined;
    const { root } = start((_at, onHeard) => {
      heard = onHeard;
      return true;
    });
    press();
    advance(3500);
    expect(root.dataset.phase).toBe("armed");
    heard?.(NOW_EPOCH + nowMs + 2100);
    advance(100 + SPLASH_CRASH_OFFSET_MS);
    expect(root.dataset.phase).toBe("flying");
    advance(1999);
    expect(root.dataset.phase).toBe("flying");
    advance(1);
    expect(root.dataset.phase).toBe("flash");
  });

  it("past the deadline flies without the music, and a later report is ignored", () => {
    let heard: ((at: number) => void) | undefined;
    const { root } = start((_at, onHeard) => {
      heard = onHeard;
      return true;
    });
    press();
    advance(SPLASH_MUSIC_WAIT_MS);
    expect(root.dataset.phase).toBe("flying");
    heard?.(NOW_EPOCH + nowMs + 60_000);
    advance(2000);
    expect(root.dataset.phase).toBe("flash");
  });

  it("does nothing with a report that comes after the end", () => {
    let heard: ((at: number) => void) | undefined;
    const { onDone, end } = start((_at, onHeard) => {
      heard = onHeard;
      return true;
    });
    press();
    end();
    expect(() => heard?.(NOW_EPOCH + nowMs + 2000)).not.toThrow();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("under reduced motion plays at the prompt, untimed", () => {
    motion.reduced = true;
    const playTheme = vi.fn(() => true);
    const { root } = start(playTheme);
    press();
    expect(playTheme).not.toHaveBeenCalled();
    advance(1000);
    expect(root.dataset.phase).toBe("prompt");
    expect(playTheme.mock.calls[0]?.[0 as never]).toBeNull();
  });
});
