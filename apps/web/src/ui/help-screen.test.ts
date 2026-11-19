import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { attachHelpWindow, isHelpOpen, openHelp } from "./help-screen.js";
import { helpDocPages } from "./player-docs.js";
import { attachTopbarPopover, closeTopbarPopover } from "./topbar-popover.js";

type Listener = (event: FakeEvent) => void;

interface FakeEvent {
  key?: string;
  target?: FakeElement;
  stopPropagation?: () => void;
  preventDefault?: () => void;
}

/** Every element focus went to in the fake page, the last one holding it. */
const focusLog: FakeElement[] = [];
const focused = (): FakeElement | undefined => focusLog.at(-1);

/** Just enough DOM for Help's window; the unit tests run in Node. */
class FakeElement {
  className = "";
  textContent = "";
  hidden = false;
  title = "";
  type = "";
  tabIndex = 0;
  value = "";
  scrollTop = 0;
  readonly dataset: Record<string, string> = {};
  readonly style = { setProperty: (): void => undefined };
  parent: FakeElement | undefined;
  readonly tagName: string;
  children: FakeElement[] = [];
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, Listener[]>();

  constructor(tagName: string) {
    this.tagName = tagName;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
    if (name.startsWith("data-")) {
      this.dataset[name.slice("data-".length)] = value;
    }
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((other) => other !== listener),
    );
  }

  appendChild(child: FakeElement): FakeElement {
    child.parent = this;
    this.children.push(child);
    return child;
  }

  append(...children: FakeElement[]): void {
    for (const child of children) {
      this.appendChild(child);
    }
  }

  replaceChildren(...children: FakeElement[]): void {
    this.children = [];
    this.append(...children);
  }

  remove(): void {
    if (this.parent !== undefined) {
      this.parent.children = this.parent.children.filter((child) => child !== this);
      this.parent = undefined;
    }
  }

  contains(node: FakeElement): boolean {
    return node === this || this.children.some((child) => child.contains(node));
  }

  /** Only the one selector Help asks for: a link to another page. */
  closest(selector: string): FakeElement | null {
    expect(selector).toBe("a[data-page]");
    if (this.tagName === "a" && this.dataset.page !== undefined) {
      return this;
    }
    return this.parent?.closest(selector) ?? null;
  }

  getBoundingClientRect(): { bottom: number } {
    return { bottom: 40 };
  }

  focus(): void {
    focusLog.push(this);
  }

  fire(type: string, event: FakeEvent = {}): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ stopPropagation: () => undefined, preventDefault: () => undefined, ...event });
    }
  }

  /** Every element under this one, depth first. */
  all(): FakeElement[] {
    return this.children.flatMap((child) => [child, ...child.all()]);
  }

  find(className: string): FakeElement | undefined {
    return this.all().find((node) => node.className.split(" ").includes(className));
  }
}

const page = new FakeElement("document");
const body = new FakeElement("body");

beforeEach(() => {
  focusLog.length = 0;
  page.listeners.clear();
  body.children = [];
  vi.stubGlobal("Node", FakeElement);
  vi.stubGlobal("Element", FakeElement);
  vi.stubGlobal("__VIBEWARS_RELEASE__", "0.0.0");
  vi.stubGlobal("__VIBEWARS_BUILD__", "test");
  vi.stubGlobal("document", {
    body,
    createElement: (tag: string) => new FakeElement(tag),
    createTextNode: (text: string) =>
      Object.assign(new FakeElement("#text"), { textContent: text }),
    addEventListener: (type: string, listener: Listener) => {
      page.addEventListener(type, listener);
    },
    removeEventListener: (type: string, listener: Listener) => {
      page.removeEventListener(type, listener);
    },
  });
});

afterEach(() => {
  closeTopbarPopover();
  vi.unstubAllGlobals();
});

/** A [?] with Help attached, and the window while it is open. */
function helpButton(): { trigger: FakeElement; window: () => FakeElement | undefined } {
  const trigger = new FakeElement("button");
  attachHelpWindow(trigger as unknown as HTMLButtonElement);
  return { trigger, window: () => body.find("help-window") };
}

const shownPage = (window: FakeElement | undefined): string | undefined =>
  window?.find("help-page")?.dataset.page;

describe("Help as a window from [?] (#3552)", () => {
  const first = helpDocPages()[0]?.id;

  it("opens on the first page, a dialog that leaves the screen under it usable", () => {
    const { trigger, window } = helpButton();
    trigger.fire("click");
    expect(isHelpOpen()).toBe(true);
    expect(window()?.getAttribute("role")).toBe("dialog");
    expect(window()?.getAttribute("aria-modal")).toBe("false");
    expect(shownPage(window())).toBe(first);
    // The page picker has the focus, so the keyboard can choose a page.
    expect(focused()).toBe(window()?.find("help-picker"));
  });

  it("shuts on a second press, Esc and a press outside, and gives focus back to [?]", () => {
    const { trigger, window } = helpButton();
    trigger.fire("click");
    trigger.fire("click");
    expect(window()).toBeUndefined();
    expect(isHelpOpen()).toBe(false);
    expect(focused()).toBe(trigger);

    trigger.fire("click");
    window()?.fire("keydown", { key: "Escape" });
    expect(window()).toBeUndefined();
    expect(focused()).toBe(trigger);

    trigger.fire("click");
    page.fire("pointerdown", { target: new FakeElement("canvas") });
    expect(window()).toBeUndefined();
    expect(focused()).toBe(trigger);
  });

  it("switches page with the picker, and on a link to another page", () => {
    const { trigger, window } = helpButton();
    trigger.fire("click");
    const picker = window()?.find("help-picker");
    expect(picker).toBeDefined();
    if (picker === undefined) {
      return;
    }
    picker.value = "controls";
    picker.fire("change");
    expect(shownPage(window())).toBe("controls");

    const link = new FakeElement("a");
    link.setAttribute("data-page", "glossary");
    window()?.find("help-page")?.appendChild(link);
    window()?.find("help-page")?.fire("click", { target: link });
    expect(shownPage(window())).toBe("glossary");
    expect(picker.value).toBe("glossary");
  });

  it("shuts when another popover opens, one window at a time", () => {
    const { trigger, window } = helpButton();
    const other = new FakeElement("button");
    attachTopbarPopover(
      other as unknown as HTMLButtonElement,
      body as unknown as HTMLElement,
      () => {
        const element = new FakeElement("div");
        return {
          element: element as unknown as HTMLElement,
          focus: element as unknown as HTMLElement,
          dispose: () => undefined,
        };
      },
    );
    trigger.fire("click");
    other.fire("click");
    expect(window()).toBeUndefined();
    expect(isHelpOpen()).toBe(false);
  });

  it("opens on a given page from the [?] attached last", () => {
    const { window } = helpButton();
    openHelp("controls");
    expect(shownPage(window())).toBe("controls");
    // Open already: it moves to the page asked for.
    openHelp("glossary");
    expect(shownPage(window())).toBe("glossary");
  });
});
