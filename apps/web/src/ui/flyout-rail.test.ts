import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mountFlyoutRail } from "./flyout-rail.js";

type Listener = (event: FakeEvent) => void;

interface FakeEvent {
  key?: string;
  stopPropagation?: () => void;
  preventDefault?: () => void;
}

/** Just enough DOM for the rail; the unit tests run in Node. */
class FakeElement {
  className = "";
  textContent = "";
  type = "";
  tabIndex = 0;
  readonly dataset: Record<string, string> = {};
  readonly tagName: string;
  children: FakeElement[] = [];
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, Listener[]>();
  readonly classList = {
    add: (name: string): void => {
      this.classList.toggle(name, true);
    },
    remove: (name: string): void => {
      this.classList.toggle(name, false);
    },
    contains: (name: string): boolean => this.className.split(" ").includes(name),
    toggle: (name: string, on: boolean): void => {
      const names = this.className.split(" ").filter((other) => other !== "" && other !== name);
      this.className = (on ? [...names, name] : names).join(" ");
    },
  };

  constructor(tagName: string) {
    this.tagName = tagName;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
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

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }

  append(...children: FakeElement[]): void {
    for (const child of children) {
      this.appendChild(child);
    }
  }

  focus(): void {
    focusLog.push(this);
  }

  /** `event` to this element's listeners; whether one stopped it going further. */
  fire(type: string, event: FakeEvent = {}): boolean {
    let stopped = false;
    for (const listener of this.listeners.get(type) ?? []) {
      listener({
        stopPropagation: () => {
          stopped = true;
        },
        preventDefault: () => undefined,
        ...event,
      });
    }
    return stopped;
  }

  all(): FakeElement[] {
    return this.children.flatMap((child) => [child, ...child.all()]);
  }

  find(className: string): FakeElement | undefined {
    return this.all().find((node) => node.className.split(" ").includes(className));
  }

  entry(id: string): FakeElement | undefined {
    return this.all().find((node) => node.dataset.id === id);
  }
}

/** Every element focus went to, the last one holding it. */
const focusLog: FakeElement[] = [];
const active = (): FakeElement | undefined => focusLog.at(-1);
let narrow = false;

beforeEach(() => {
  focusLog.length = 0;
  narrow = false;
  vi.stubGlobal("document", {
    createElement: (tag: string) => new FakeElement(tag),
    get activeElement() {
      return active();
    },
  });
  vi.stubGlobal("matchMedia", () => ({ matches: narrow }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const ENTRIES = [
  { id: "one", title: "One" },
  { id: "two", title: "Two" },
  { id: "three", title: "Three" },
];

/** A rail over `ENTRIES`, and every page it was asked to show, in order. */
function rail(initial?: string, drilled?: boolean) {
  const shown: string[] = [];
  const pane = new FakeElement("section");
  const mounted = mountFlyoutRail({
    label: "Pages",
    entries: ENTRIES,
    pane: pane as unknown as HTMLElement,
    show: (id) => {
      shown.push(id);
    },
    initial,
    drilled,
  });
  const element = mounted.element as unknown as FakeElement;
  return { ...mounted, element, shown };
}

const current = (element: FakeElement): (string | undefined)[] =>
  element
    .all()
    .filter((node) => node.getAttribute("aria-current") === "page")
    .map((node) => node.dataset.id);

describe("mountFlyoutRail (#4216)", () => {
  it("opens on the first page, or the one asked for, and an unknown one opens the first", () => {
    expect(rail().shown).toEqual(["one"]);
    expect(rail("two").shown).toEqual(["two"]);
    expect(rail("nowhere").shown).toEqual(["one"]);
  });

  it("marks the selected entry with aria-current, and only it", () => {
    const { element, select, shown } = rail();
    expect(current(element)).toEqual(["one"]);
    select("three");
    expect(current(element)).toEqual(["three"]);
    expect(shown).toEqual(["one", "three"]);
    select("nowhere");
    expect(current(element)).toEqual(["three"]);
  });

  it("moves focus along the rail with ↑ ↓ Home End, stopping at the ends", () => {
    const { element } = rail();
    const nav = element.find("flyout-rail-nav");
    element.entry("one")?.focus();
    for (const [key, id] of [
      ["ArrowDown", "two"],
      ["ArrowDown", "three"],
      ["ArrowDown", "three"],
      ["Home", "one"],
      ["ArrowUp", "one"],
      ["End", "three"],
      ["ArrowUp", "two"],
    ] as const) {
      nav?.fire("keydown", { key });
      expect(active()?.dataset.id).toBe(id);
    }
  });

  it("narrow, shows the list until an entry is opened, then the page with focus on its title", () => {
    narrow = true;
    const { element, focusTarget } = rail();
    expect(element.classList.contains("is-drilled")).toBe(false);
    expect(focusTarget()).toBe(element.entry("one"));
    element.entry("two")?.fire("click");
    expect(element.classList.contains("is-drilled")).toBe(true);
    expect(current(element)).toEqual(["two"]);
    const title = element.find("flyout-rail-title");
    expect(title?.textContent).toBe("Two");
    expect(active()).toBe(title);
  });

  it("narrow, back returns to the list on the entry that was open", () => {
    narrow = true;
    const { element } = rail();
    element.entry("three")?.fire("click");
    element.find("flyout-rail-back-button")?.fire("click");
    expect(element.classList.contains("is-drilled")).toBe(false);
    expect(active()).toBe(element.entry("three"));
  });

  it("narrow, Esc on a page goes back and stops there; Esc on the list goes on to close", () => {
    narrow = true;
    const { element } = rail();
    element.entry("two")?.fire("click");
    expect(element.fire("keydown", { key: "Escape" })).toBe(true);
    expect(element.classList.contains("is-drilled")).toBe(false);
    expect(active()).toBe(element.entry("two"));
    expect(element.fire("keydown", { key: "Escape" })).toBe(false);
  });

  it("wide, Esc is the flyout's even after an entry was opened", () => {
    const { element } = rail();
    element.entry("two")?.fire("click");
    expect(element.fire("keydown", { key: "Escape" })).toBe(false);
    expect(active()).toBeUndefined();
  });

  it("opened on a page by a link, narrow, starts drilled in with focus to go to its title", () => {
    narrow = true;
    const { element, focusTarget } = rail("two", true);
    expect(element.classList.contains("is-drilled")).toBe(true);
    expect(focusTarget()).toBe(element.find("flyout-rail-title"));
  });
});
