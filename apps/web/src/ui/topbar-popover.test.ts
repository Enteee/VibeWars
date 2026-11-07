import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PartyMember, RailParty } from "./lobby-window.js";
import { PARTY_ALONE } from "./lobby-window.js";
import { lobbyButton, lobbyButtonName } from "./topbar.js";
import { attachTopbarPopover, closeTopbarPopover, isTopbarPopoverOpen } from "./topbar-popover.js";

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

/** Just enough DOM for a popover and the Lobby; the unit tests run in Node. */
class FakeElement {
  className = "";
  textContent = "";
  hidden = false;
  title = "";
  type = "";
  src = "";
  alt = "";
  tabIndex = 0;
  parent: FakeElement | undefined;
  readonly tagName: string;
  children: FakeElement[] = [];
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, Listener[]>();
  readonly classes = new Set<string>();
  readonly classList = {
    add: (name: string): void => {
      this.classes.add(name);
    },
    remove: (name: string): void => {
      this.classes.delete(name);
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

  replaceWith(next: FakeElement): void {
    const parent = this.parent;
    if (parent !== undefined) {
      parent.children = parent.children.map((child) => (child === this ? next : child));
      next.parent = parent;
      this.parent = undefined;
    }
  }

  replaceChildren(...children: FakeElement[]): void {
    this.children = [];
    for (const child of children) {
      this.appendChild(child);
    }
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

  focus(): void {
    focusLog.push(this);
  }

  fire(type: string, event: FakeEvent = {}): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ stopPropagation: () => undefined, preventDefault: () => undefined, ...event });
    }
  }

  /** Every text under this one, in order. */
  texts(): string[] {
    return [
      ...(this.textContent === "" ? [] : [this.textContent]),
      ...this.children.flatMap((child) => child.texts()),
    ];
  }
}

const page = new FakeElement("document");

beforeEach(() => {
  focusLog.length = 0;
  page.listeners.clear();
  vi.stubGlobal("Node", FakeElement);
  vi.stubGlobal("document", {
    createElement: (tag: string) => new FakeElement(tag),
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

/** A popover off a fresh button in `parent`, its content a plain box. */
function popover(
  parent: FakeElement,
  holdsOpen?: () => boolean,
): { trigger: FakeElement; disposed: number[] } {
  const trigger = new FakeElement("button");
  const disposed: number[] = [];
  attachTopbarPopover(
    trigger as unknown as HTMLButtonElement,
    parent as unknown as HTMLElement,
    () => {
      const element = new FakeElement("div");
      return {
        element: element as unknown as HTMLElement,
        focus: element as unknown as HTMLElement,
        ...(holdsOpen === undefined ? {} : { holdsOpen }),
        dispose: () => disposed.push(1),
      };
    },
  );
  return { trigger, disposed };
}

describe("a top-bar popover (#2385)", () => {
  it("opens and shuts on its button, saying so, and gives focus back to it", () => {
    const parent = new FakeElement("div");
    const { trigger, disposed } = popover(parent);
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    trigger.fire("click");
    expect(parent.children).toHaveLength(1);
    expect(parent.children[0]?.getAttribute("role")).toBe("dialog");
    expect(focused()).toBe(parent.children[0]);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    trigger.fire("click");
    expect(parent.children).toHaveLength(0);
    expect(disposed).toHaveLength(1);
    expect(focused()).toBe(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("shuts on Esc inside it, which goes no further, and on a press outside it", () => {
    const parent = new FakeElement("div");
    const { trigger } = popover(parent);
    trigger.fire("click");
    const stopped: number[] = [];
    parent.children[0]?.fire("keydown", { key: "Escape", stopPropagation: () => stopped.push(1) });
    expect(parent.children).toHaveLength(0);
    expect(stopped).toHaveLength(1);
    expect(focused()).toBe(trigger);
    trigger.fire("click");
    const inside = parent.children[0] ?? new FakeElement("missing");
    page.fire("pointerdown", { target: inside });
    expect(parent.children).toHaveLength(1);
    page.fire("pointerdown", { target: new FakeElement("main") });
    expect(parent.children).toHaveLength(0);
  });

  it("is the only one open: opening Lobby shuts Music, and the other way round", () => {
    const parent = new FakeElement("div");
    const music = popover(parent);
    const lobby = popover(parent);
    music.trigger.fire("click");
    lobby.trigger.fire("click");
    expect(parent.children).toHaveLength(1);
    expect(music.trigger.getAttribute("aria-expanded")).toBe("false");
    expect(lobby.trigger.getAttribute("aria-expanded")).toBe("true");
    // The newly opened one keeps the focus.
    expect(focused()).toBe(parent.children[0]);
    music.trigger.fire("click");
    expect(parent.children).toHaveLength(1);
    expect(lobby.trigger.getAttribute("aria-expanded")).toBe("false");
    expect(music.trigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("stays open through a press outside while it holds itself open, as Options rebinding a key (#2386)", () => {
    const parent = new FakeElement("div");
    let capturing = true;
    const { trigger } = popover(parent, () => capturing);
    trigger.fire("click");
    page.fire("pointerdown", { target: new FakeElement("main") });
    expect(parent.children).toHaveLength(1);
    capturing = false;
    page.fire("pointerdown", { target: new FakeElement("main") });
    expect(parent.children).toHaveLength(0);
  });

  it("says whether one is open, for the reload that waits on an idle page (#2386)", () => {
    const parent = new FakeElement("div");
    const { trigger } = popover(parent);
    expect(isTopbarPopoverOpen()).toBe(false);
    trigger.fire("click");
    expect(isTopbarPopoverOpen()).toBe(true);
    trigger.fire("click");
    expect(isTopbarPopoverOpen()).toBe(false);
  });

  it("shuts for Help or a match without taking the focus they want", () => {
    const parent = new FakeElement("div");
    const { trigger, disposed } = popover(parent);
    trigger.fire("click");
    closeTopbarPopover();
    expect(parent.children).toHaveLength(0);
    expect(disposed).toHaveLength(1);
    expect(focused()).not.toBe(trigger);
  });
});

const member = (name: string, isHost = false): PartyMember => ({
  id: name,
  name,
  isHost,
  self: isHost,
  away: false,
});

const party = (...members: PartyMember[]): RailParty => ({
  code: "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8",
  mode: "random-arena",
  isHost: true,
  open: true,
  members,
  queuedMs: null,
  teamSize: 4,
  teams: undefined,
  ascentRound: null,
  inMatch: false,
});

describe("the top bar's Lobby (#2385)", () => {
  const mount = (): { parent: FakeElement; button: FakeElement; badge: FakeElement } & ReturnType<
    typeof lobbyButton
  > => {
    const parent = new FakeElement("div");
    // The lobby's controls (#2385), as the bar's join hands them over.
    const controls = new FakeElement("div");
    controls.textContent = "Copy invite link";
    const lobby = lobbyButton(
      parent as unknown as HTMLElement,
      controls as unknown as HTMLElement,
      () => undefined,
    );
    const button = lobby.element as unknown as FakeElement;
    const badge = button.children.find((child) => child.className === "topbar-badge");
    if (badge === undefined) {
      throw new Error("no badge");
    }
    return { ...lobby, parent, button, badge };
  };

  it("counts the players on its badge and in its name once someone else is in", () => {
    const { button, badge, setParty } = mount();
    expect(button.getAttribute("aria-label")).toBe("Lobby");
    expect(badge.hidden).toBe(true);
    setParty(party(member("me", true)));
    expect(button.getAttribute("aria-label")).toBe("Lobby");
    expect(badge.hidden).toBe(true);
    setParty(party(member("me", true), member("Ann")));
    expect(button.getAttribute("aria-label")).toBe("Lobby, 2 players");
    expect(badge.hidden).toBe(false);
    expect(badge.textContent).toBe("2");
    setParty(party(member("me", true), member("Ann"), member("Bo"), member("Cy")));
    expect(button.getAttribute("aria-label")).toBe(lobbyButtonName(4));
    expect(lobbyButtonName(4)).toBe("Lobby, 4 players");
    expect(badge.textContent).toBe("4");
  });

  it("pulses its badge on a join or a leave while shut, not on a queue's tick", () => {
    const { badge, setParty } = mount();
    setParty(party(member("me", true), member("Ann")));
    expect(badge.classes.has("is-pulsing")).toBe(true);
    badge.fire("animationend");
    expect(badge.classes.has("is-pulsing")).toBe(false);
    setParty({ ...party(member("me", true), member("Ann")), queuedMs: 1_000 });
    expect(badge.classes.has("is-pulsing")).toBe(false);
    setParty(party(member("me", true), member("Ann"), member("Bo")));
    expect(badge.classes.has("is-pulsing")).toBe(true);
  });

  it("says it is just you, alone or in no lobby yet", () => {
    const { parent, button, setParty } = mount();
    button.fire("click");
    expect(parent.children[0]?.texts()).toEqual(["Lobby", "Copy invite link", PARTY_ALONE]);
    setParty(party(member("me", true)));
    expect(parent.children[0]?.texts()).toEqual(["Lobby", "Copy invite link", PARTY_ALONE]);
  });

  it("lists who is in under the lobby's controls, repainting while open on a join or a leave", () => {
    const { parent, button, badge, setParty } = mount();
    setParty(party(member("me", true), member("Ann")));
    badge.fire("animationend");
    button.fire("click");
    const controls = parent.children[0]?.children[1];
    // The host sees an (x) by every other member (#2746).
    expect(parent.children[0]?.texts()).toEqual([
      "Lobby",
      "Copy invite link",
      "me",
      "Host",
      "Ann",
      "×",
    ]);
    setParty(party(member("me", true), member("Ann"), member("Bo")));
    expect(parent.children[0]?.texts()).toEqual([
      "Lobby",
      "Copy invite link",
      "me",
      "Host",
      "Ann",
      "×",
      "Bo",
      "×",
    ]);
    // The controls stay put through a repaint, so one keeps its focus.
    expect(parent.children[0]?.children[1]).toBe(controls);
    // Open, the window shows the join; the badge need not pulse.
    expect(badge.classes.has("is-pulsing")).toBe(false);
    setParty(party(member("me", true)));
    expect(parent.children[0]?.texts()).toEqual(["Lobby", "Copy invite link", PARTY_ALONE]);
  });
});
