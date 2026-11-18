import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STORAGE_NAMESPACE } from "../storage/namespace.js";

import type { CoachView } from "./coach-overlay.js";
import { startMenuQuest } from "./menu-quest-session.js";

const KEY = `${STORAGE_NAMESPACE}.tutorial`;

/** A coach that keeps what it was shown, with Skip and Got it to press. */
function fakeCoach(): {
  coach: Parameters<typeof startMenuQuest>[0]["coach"];
  shown: CoachView[];
  removed: () => boolean;
  skip: () => void;
} {
  const shown: CoachView[] = [];
  let removed = false;
  let onSkip = (): void => undefined;
  return {
    coach: (callbacks) => {
      onSkip = callbacks.onSkip;
      return {
        show: (view) => shown.push(view),
        remove: () => {
          removed = true;
        },
      };
    },
    shown,
    removed: () => removed,
    skip: () => {
      onSkip();
    },
  };
}

function gotIt(view: CoachView | undefined): void {
  if (view?.gotIt === undefined) {
    throw new Error("no Got it");
  }
  view.gotIt();
}

describe("the menu quest session", () => {
  const items = new Map<string, string>();
  beforeEach(() => {
    items.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => items.set(key, value),
      removeItem: (key: string) => items.delete(key),
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("saves its step as it starts, and points at the rail first, with Got it", () => {
    const { coach, shown } = fakeCoach();
    startMenuQuest({ from: "menu", coach, onEnd: () => undefined });
    expect(items.get(KEY)).toBe("menu:menu");
    expect(shown.at(-1)?.target).toBe("rail");
    expect(shown.at(-1)?.gotIt).toBeDefined();
    expect(shown.at(-1)?.objectives).toEqual([]);
  });

  it("walks rail, Characters and Teams on Got it, then saves done and goes", () => {
    const { coach, shown, removed } = fakeCoach();
    const onEnd = vi.fn();
    startMenuQuest({ from: "menu", coach, onEnd });
    gotIt(shown.at(-1));
    expect(shown.at(-1)?.target).toBe("rail-characters");
    gotIt(shown.at(-1));
    expect(shown.at(-1)?.target).toBe("rail-teams");
    gotIt(shown.at(-1));
    expect(items.get(KEY)).toBe("done");
    expect(removed()).toBe(true);
    expect(onEnd).toHaveBeenCalledWith("done");
  });

  it("is not moved on by the menu's events while it explains", () => {
    const { coach, shown } = fakeCoach();
    const quest = startMenuQuest({ from: "menu", coach, onEnd: () => undefined });
    quest.event({ kind: "screen-shown", screen: "teams" });
    expect(shown.at(-1)?.target).toBe("rail");
  });

  it("saves skipped on a confirmed Skip, and goes", () => {
    const { coach, removed, skip } = fakeCoach();
    const onEnd = vi.fn();
    startMenuQuest({ from: "menu", coach, onEnd });
    skip();
    expect(items.get(KEY)).toBe("skipped");
    expect(removed()).toBe(true);
    expect(onEnd).toHaveBeenCalledWith("skipped");
  });

  it("keeps its step when stopped for a link, so the next launch resumes", () => {
    const { coach, shown, removed } = fakeCoach();
    const onEnd = vi.fn();
    const quest = startMenuQuest({ from: "menu", coach, onEnd });
    gotIt(shown.at(-1));
    quest.stop();
    expect(items.get(KEY)).toBe("menu:menu");
    expect(removed()).toBe(true);
    expect(onEnd).not.toHaveBeenCalled();
  });
});
