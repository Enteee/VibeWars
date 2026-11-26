import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { holdFocus } from "./modal-focus.js";

interface FakeKey {
  readonly key: string;
  readonly shiftKey: boolean;
  defaultPrevented: boolean;
  propagationStopped: boolean;
  preventDefault(): void;
  stopPropagation(): void;
}

type KeyListener = (event: FakeKey) => void;

/** The fake page's focus, and its document's keydown listeners. */
const page = {
  active: null as FakeElement | null,
  keys: new Set<KeyListener>(),
};

/** Just enough of an element for the focus to move between them. */
class FakeElement {
  readonly children: FakeElement[] = [];
  parent: FakeElement | undefined;
  hidden = false;
  isConnected = true;

  readonly name: string;
  tabIndex: number;

  constructor(name: string, tabIndex = 0) {
    this.name = name;
    this.tabIndex = tabIndex;
  }

  append(...children: FakeElement[]): this {
    for (const child of children) {
      child.parent = this;
      this.children.push(child);
    }
    return this;
  }

  focus(): void {
    page.active = this;
  }

  contains(other: unknown): boolean {
    for (let at = other instanceof FakeElement ? other : undefined; at; at = at.parent) {
      if (at === this) {
        return true;
      }
    }
    return false;
  }

  /** The hidden element this is in, if any: the module asks for nothing else. */
  closest(): FakeElement | null {
    return this.hidden ? this : (this.parent?.closest() ?? null);
  }

  /** Every descendant, in document order: the selector is the module's, not checked here. */
  querySelectorAll(): FakeElement[] {
    return this.children.flatMap((child) => [child, ...child.querySelectorAll()]);
  }
}

/** Presses `key` on the fake document, as its capturing listeners hear it. */
function press(key: string, shiftKey = false): FakeKey {
  const event: FakeKey = {
    key,
    shiftKey,
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.propagationStopped = true;
    },
  };
  for (const listener of [...page.keys]) {
    listener(event);
  }
  return event;
}

/** A dialog of three buttons, a text and a skipped (`tabIndex` -1) one between them. */
function dialog(): { panel: FakeElement; first: FakeElement; last: FakeElement } {
  const first = new FakeElement("first");
  const last = new FakeElement("last");
  const panel = new FakeElement("panel", -1).append(
    new FakeElement("text", -1),
    first,
    new FakeElement("middle"),
    last,
  );
  return { panel, first, last };
}

describe("holdFocus (#4090)", () => {
  let opener: FakeElement;

  beforeEach(() => {
    opener = new FakeElement("opener");
    page.active = opener;
    page.keys.clear();
    vi.stubGlobal("HTMLElement", FakeElement);
    vi.stubGlobal("Node", FakeElement);
    vi.stubGlobal("document", {
      get activeElement() {
        return page.active;
      },
      addEventListener: (_type: string, listener: KeyListener) => page.keys.add(listener),
      removeEventListener: (_type: string, listener: KeyListener) => page.keys.delete(listener),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("moves focus to the dialog's first focusable element", () => {
    const { panel, first } = dialog();
    holdFocus(panel as unknown as HTMLElement, () => undefined);
    expect(page.active).toBe(first);
  });

  it("wraps Tab from the last to the first, and Shift+Tab from the first to the last", () => {
    const { panel, first, last } = dialog();
    holdFocus(panel as unknown as HTMLElement, () => undefined);
    expect(press("Tab", true).defaultPrevented).toBe(true);
    expect(page.active).toBe(last);
    expect(press("Tab").defaultPrevented).toBe(true);
    expect(page.active).toBe(first);
    // In between, Tab is the browser's own.
    expect(press("Tab").defaultPrevented).toBe(false);
  });

  it("brings Tab back inside when focus has left the dialog", () => {
    const { panel, first } = dialog();
    holdFocus(panel as unknown as HTMLElement, () => undefined);
    opener.focus();
    press("Tab");
    expect(page.active).toBe(first);
  });

  it("skips a hidden button", () => {
    const { panel, last } = dialog();
    last.hidden = true;
    holdFocus(panel as unknown as HTMLElement, () => undefined);
    press("Tab", true);
    expect(page.active?.name).toBe("middle");
  });

  it("calls onEscape on Esc, which goes no further", () => {
    const { panel } = dialog();
    const escape = vi.fn();
    holdFocus(panel as unknown as HTMLElement, escape);
    const event = press("Escape");
    expect(escape).toHaveBeenCalledOnce();
    expect(event.propagationStopped).toBe(true);
  });

  it("gives focus back on release, and stops answering keys", () => {
    const { panel } = dialog();
    const escape = vi.fn();
    const release = holdFocus(panel as unknown as HTMLElement, escape);
    release();
    expect(page.active).toBe(opener);
    press("Escape");
    expect(escape).not.toHaveBeenCalled();
  });

  it("leaves focus be on release when what had it is gone", () => {
    const { panel, first } = dialog();
    const release = holdFocus(panel as unknown as HTMLElement, () => undefined);
    opener.isConnected = false;
    release();
    expect(page.active).toBe(first);
  });

  it("hands the keys to the dialog on top, and back to the one below when it closes", () => {
    const below = dialog();
    const belowEscape = vi.fn();
    holdFocus(below.panel as unknown as HTMLElement, belowEscape);
    below.last.focus();
    const above = dialog();
    const aboveEscape = vi.fn();
    const release = holdFocus(above.panel as unknown as HTMLElement, aboveEscape);
    expect(page.active).toBe(above.first);
    press("Escape");
    expect([aboveEscape.mock.calls.length, belowEscape.mock.calls.length]).toEqual([1, 0]);
    release();
    expect(page.active).toBe(below.last);
    press("Escape");
    expect(belowEscape).toHaveBeenCalledOnce();
  });
});
