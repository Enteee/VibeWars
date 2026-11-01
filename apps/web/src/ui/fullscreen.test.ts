import { describe, expect, it, vi } from "vitest";

import { attachFullscreenButton, fullscreenButtonState, fullscreenTarget } from "./fullscreen.js";

/** Just enough of a button: its icon, attributes and click listener. */
class FakeButton {
  hidden = false;
  title = "";
  readonly icon = { src: "" };
  readonly attributes = new Map<string, string>();
  click: (() => void) | undefined;

  querySelector(): { src: string } {
    return this.icon;
  }
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  addEventListener(_type: string, listener: () => void): void {
    this.click = listener;
  }
  removeEventListener(): void {
    this.click = undefined;
  }
}

/** A document whose fullscreen the test flips, as the browser would. */
function fakeDocument(enabled: boolean) {
  let change: (() => void) | undefined;
  const doc = {
    fullscreenEnabled: enabled,
    fullscreenElement: null as Element | null,
    exitFullscreen: vi.fn(() => Promise.resolve()),
    addEventListener: (_type: string, listener: () => void) => {
      change = listener;
    },
    removeEventListener: () => {
      change = undefined;
    },
  };
  return {
    doc,
    /** The browser enters or leaves fullscreen, by a click or its own Esc. */
    set(fullscreen: boolean) {
      doc.fullscreenElement = fullscreen ? ({} as Element) : null;
      change?.();
    },
  };
}

function attach(enabled = true) {
  const button = new FakeButton();
  const target = { requestFullscreen: vi.fn(() => Promise.resolve()) };
  const page = fakeDocument(enabled);
  const detach = attachFullscreenButton(
    button as unknown as HTMLButtonElement,
    target as unknown as HTMLElement,
    page.doc,
  );
  return { button, target, page, detach };
}

describe("the fullscreen button (#454)", () => {
  it("shows the window as it is, not what a click does", () => {
    expect(fullscreenButtonState(false).icon).toMatch(/\/ui\/fullscreen\.svg$/);
    expect(fullscreenButtonState(true).icon).toMatch(/\/ui\/fullscreen-exit\.svg$/);
    expect(fullscreenButtonState(true).pressed).toBe("true");
    expect(fullscreenButtonState(false).title).not.toBe(fullscreenButtonState(true).title);
  });

  it("is hidden where there is no fullscreen to have", () => {
    expect(attach(false).button.hidden).toBe(true);
    expect(attach(true).button.hidden).toBe(false);
  });

  it("asks for fullscreen on the app, and leaves it once in", () => {
    const { button, target, page } = attach();
    button.click?.();
    expect(target.requestFullscreen).toHaveBeenCalledOnce();
    page.set(true);
    button.click?.();
    expect(page.doc.exitFullscreen).toHaveBeenCalledOnce();
  });

  it("follows the window when the browser leaves fullscreen itself", () => {
    const { button, page } = attach();
    page.set(true);
    expect(button.icon.src).toMatch(/fullscreen-exit\.svg$/);
    expect(button.attributes.get("aria-pressed")).toBe("true");
    page.set(false);
    expect(button.icon.src).toMatch(/\/fullscreen\.svg$/);
    expect(button.attributes.get("aria-pressed")).toBe("false");
  });

  it("lets go of the page when detached", () => {
    const { button, page, detach } = attach();
    detach();
    expect(button.click).toBeUndefined();
    page.set(true);
    expect(button.icon.src).toMatch(/\/fullscreen\.svg$/);
  });
});

describe("what goes fullscreen (#2012)", () => {
  it("is the whole document, so tooltips on <body> are drawn too", () => {
    const root = {};
    vi.stubGlobal("document", { documentElement: root });
    try {
      expect(fullscreenTarget()).toBe(root);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
