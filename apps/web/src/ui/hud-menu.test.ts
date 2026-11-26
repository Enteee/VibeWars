import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { attachHudMenu, type HudElements, type HudMenu, type LeaveControl } from "./hud.js";
import { attachTopbarPopover } from "./topbar-popover.js";

type Listener = (event: FakeEvent) => void;

interface FakeEvent {
  readonly target: FakeElement;
  composedPath(): FakeElement[];
}

/** Just enough DOM for ☰ and its list; the unit tests run in Node. */
class FakeElement {
  hidden = false;
  parent: FakeElement | undefined;
  readonly children: FakeElement[] = [];
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, Listener[]>();

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
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

  appendChild<T extends FakeElement>(child: T): T {
    child.parent = this;
    this.children.push(child);
    return child;
  }

  remove(): void {
    this.parent?.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = undefined;
  }

  contains(node: FakeElement): boolean {
    for (let at: FakeElement | undefined = node; at !== undefined; at = at.parent) {
      if (at === this) {
        return true;
      }
    }
    return false;
  }

  focus(): void {
    page.activeElement = this;
  }

  /** A press as the page would deliver it: here, then up through every parent. */
  press(type: string): void {
    const path: FakeElement[] = [this];
    for (let at = this.parent; at !== undefined; at = at.parent) {
      path.push(at);
    }
    const event: FakeEvent = { target: this, composedPath: () => path };
    for (const node of path) {
      for (const listener of node.listeners.get(type) ?? []) {
        listener(event);
      }
    }
    for (const listener of page.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

class FakeButton extends FakeElement {}

/** The page: who holds focus, and its own listeners. */
const page = {
  activeElement: undefined as FakeElement | undefined,
  listeners: new Map<string, Listener[]>(),
  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  },
  removeEventListener(type: string, listener: Listener): void {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((other) => other !== listener),
    );
  },
};

type MenuParts = Pick<HudElements, "menuToggle" | "menu" | "leave" | "help" | "options" | "music">;

interface Rig {
  readonly hud: MenuParts;
  readonly menu: HudMenu;
  readonly toggle: FakeButton;
  readonly list: FakeElement;
  readonly leaveRow: FakeElement;
  readonly mute: FakeButton;
  readonly help: FakeButton;
  readonly asking: () => boolean;
  readonly ask: () => void;
  readonly outside: FakeElement;
}

/** ☰ and its list as `createHud` lays them out, and a leave question that only says if it asks. */
function rig(): Rig {
  const body = new FakeElement();
  const controls = body.appendChild(new FakeElement());
  const toggle = controls.appendChild(new FakeButton());
  const list = controls.appendChild(new FakeElement());
  list.hidden = true;
  const leaveRow = list.appendChild(new FakeElement());
  leaveRow.appendChild(new FakeButton());
  const mute = list.appendChild(new FakeButton());
  const help = list.appendChild(new FakeButton());
  const options = list.appendChild(new FakeButton());
  const music = list.appendChild(new FakeButton());
  let open = false;
  const leave: LeaveControl = {
    open: () => {
      open = true;
    },
    close: () => {
      open = false;
    },
    isOpen: () => open,
    cycleFocus: () => undefined,
  };
  const hud = {
    menuToggle: toggle,
    menu: list,
    leave: leaveRow,
    help,
    options,
    music,
  } as unknown as MenuParts;
  return {
    hud,
    menu: attachHudMenu(hud, leave),
    toggle,
    list,
    leaveRow,
    mute,
    help,
    asking: () => open,
    ask: leave.open,
    outside: body.appendChild(new FakeElement()),
  };
}

beforeEach(() => {
  page.activeElement = undefined;
  page.listeners.clear();
  vi.stubGlobal("document", page);
  vi.stubGlobal("Node", FakeElement);
  vi.stubGlobal("HTMLElement", FakeElement);
  vi.stubGlobal("HTMLButtonElement", FakeButton);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the match's ☰ (#3923)", () => {
  it("opens and shuts its list, and says which", () => {
    const { toggle, list, menu } = rig();
    expect(toggle.attributes.get("aria-expanded")).toBeUndefined();
    toggle.press("click");
    expect(list.hidden).toBe(false);
    expect(menu.isOpen()).toBe(true);
    expect(toggle.attributes.get("aria-expanded")).toBe("true");
    toggle.press("click");
    expect(list.hidden).toBe(true);
    expect(toggle.attributes.get("aria-expanded")).toBe("false");
  });

  it("puts the list away once a row has done its work, but not for leave's", () => {
    const { list, mute, leaveRow, menu } = rig();
    menu.open();
    const leaveButton = leaveRow.children[0];
    if (leaveButton === undefined) {
      throw new Error("no leave button");
    }
    leaveButton.press("click");
    expect(list.hidden).toBe(false);
    mute.press("click");
    expect(list.hidden).toBe(true);
  });

  it("a press on the list but not on a row leaves it open", () => {
    const { list, menu } = rig();
    menu.open();
    list.press("click");
    expect(list.hidden).toBe(false);
  });

  it("a press outside shuts it, and the leave question in it", () => {
    const { list, menu, outside, toggle, asking, leaveRow, ask } = rig();
    menu.open();
    ask();
    leaveRow.press("pointerdown");
    toggle.press("pointerdown");
    expect(list.hidden).toBe(false);
    expect(asking()).toBe(true);
    outside.press("pointerdown");
    expect(list.hidden).toBe(true);
    expect(asking()).toBe(false);
  });

  it("sends focus in the list back to ☰ when it shuts, and leaves focus elsewhere be", () => {
    const { menu, mute, toggle, outside } = rig();
    menu.open();
    mute.focus();
    menu.close();
    expect(page.activeElement).toBe(toggle);
    menu.open();
    outside.focus();
    menu.close();
    expect(page.activeElement).toBe(outside);
  });

  it("a window a row opened gives focus back to ☰ when it shuts, its own button folded away", () => {
    const { menu, help, toggle, outside } = rig();
    const window = new FakeElement();
    let close = (): void => undefined;
    attachTopbarPopover(
      help as unknown as HTMLButtonElement,
      outside as unknown as HTMLElement,
      (shut) => {
        close = shut;
        return {
          element: window as unknown as HTMLElement,
          focus: window as unknown as HTMLElement,
          dispose: () => undefined,
        };
      },
    );
    menu.open();
    help.press("click");
    expect(menu.isOpen()).toBe(false);
    expect(page.activeElement).toBe(window);
    close();
    expect(page.activeElement).toBe(toggle);
  });

  it("opening it shuts a window that is open", () => {
    const { menu, help, outside } = rig();
    let shut = false;
    attachTopbarPopover(
      help as unknown as HTMLButtonElement,
      outside as unknown as HTMLElement,
      () => {
        const window = new FakeElement();
        return {
          element: window as unknown as HTMLElement,
          focus: window as unknown as HTMLElement,
          dispose: () => {
            shut = true;
          },
        };
      },
    );
    help.press("click");
    menu.open();
    expect(shut).toBe(true);
  });

  it("stops listening for presses outside once disposed", () => {
    const { menu, list, outside } = rig();
    menu.open();
    menu.dispose();
    outside.press("pointerdown");
    expect(list.hidden).toBe(false);
  });
});
