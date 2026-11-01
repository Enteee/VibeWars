import type { ChatLine } from "@vibewars/game-session";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CHAT_LINES_KEPT,
  CHAT_LINE_SHOWN_SECONDS,
  ChatLog,
  chatSide,
  chatToSend,
  mountChat,
  type ChatPanel,
} from "./chat.js";

const line = (fromId: string, team: 0 | 1 | null, text = "hi"): ChatLine => ({
  channel: "all",
  fromId,
  name: fromId,
  team,
  text,
});

describe("chatToSend (#479)", () => {
  it("sends on the chosen channel, trimmed", () => {
    expect(chatToSend("  gg  ", "team", true)).toEqual({ channel: "team", text: "gg" });
  });

  it("takes GW1's prefixes over the chosen channel: ! all, # team", () => {
    expect(chatToSend("!glhf", "team", true)).toEqual({ channel: "all", text: "glhf" });
    expect(chatToSend("# spike", "all", true)).toEqual({ channel: "team", text: "spike" });
  });

  it("sends nothing for an empty line, or a spectator's team chat", () => {
    expect(chatToSend("   ", "all", true)).toBeUndefined();
    expect(chatToSend("!", "all", true)).toBeUndefined();
    expect(chatToSend("#psst", "all", false)).toBeUndefined();
    expect(chatToSend("hi", "all", false)).toEqual({ channel: "all", text: "hi" });
  });
});

describe("chatSide (#479)", () => {
  it("colours a line by the sender's side as this player sees it", () => {
    expect(chatSide(line("me", 0), "me", 0)).toBe("self");
    expect(chatSide(line("ann", 0), "me", 0)).toBe("ally");
    expect(chatSide(line("bob", 1), "me", 0)).toBe("enemy");
    expect(chatSide(line("sam", null), "me", 0)).toBe("spectator");
  });

  it("shows a spectator every player in the friendly hue", () => {
    expect(chatSide(line("bob", 1), "me", null)).toBe("ally");
  });
});

describe("ChatLog (#479)", () => {
  it(`keeps the last ${String(CHAT_LINES_KEPT)} lines`, () => {
    const log = new ChatLog();
    for (let i = 0; i < CHAT_LINES_KEPT + 5; i += 1) {
      log.add(line("ann", 0, String(i)), 0);
    }
    const kept = log.visible();
    expect(kept).toHaveLength(CHAT_LINES_KEPT);
    expect(kept[0]?.line.text).toBe("5");
  });

  it("hides a muted sender's lines, kept and new, until unmuted", () => {
    const log = new ChatLog();
    log.add(line("ann", 0, "one"), 0);
    log.add(line("bob", 1, "two"), 0);
    log.mute("bob", true);
    expect(log.add(line("bob", 1, "three"), 0)).toBe(false);
    expect(log.visible().map(({ line: kept }) => kept.text)).toEqual(["one"]);
    log.mute("bob", false);
    expect(log.visible().map(({ line: kept }) => kept.text)).toEqual(["one", "two", "three"]);
  });
});

/** Just enough DOM for the panel; the unit tests run in Node. */
class FakeElement {
  className = "";
  textContent = "";
  value = "";
  title = "";
  type = "";
  placeholder = "";
  alt = "";
  src = "";
  maxLength = 0;
  disabled = false;
  scrollTop = 0;
  readonly scrollHeight = 0;
  readonly isConnected = true;
  readonly isContentEditable = false;
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  readonly listeners = new Map<string, ((event: unknown) => void)[]>();
  parent: FakeElement | undefined;

  readonly tagName: string;

  constructor(tagName: string) {
    this.tagName = tagName;
  }

  readonly classList = {
    add: (name: string): void => {
      this.classList.toggle(name, true);
    },
    remove: (name: string): void => {
      this.classList.toggle(name, false);
    },
    contains: (name: string): boolean => this.className.split(" ").includes(name),
    toggle: (name: string, on: boolean): void => {
      const names = this.className.split(" ").filter((n) => n !== "" && n !== name);
      this.className = (on ? [...names, name] : names).join(" ");
    },
  };

  get childElementCount(): number {
    return this.children.length;
  }

  get firstElementChild(): FakeElement | undefined {
    return this.children[0];
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  dispatch(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  appendChild(child: FakeElement): FakeElement {
    child.parent = this;
    this.children.push(child);
    return child;
  }

  append(...nodes: (FakeElement | string)[]): void {
    for (const node of nodes) {
      if (typeof node === "string") {
        this.textContent += node;
      } else {
        this.appendChild(node);
      }
    }
  }

  replaceChildren(...nodes: FakeElement[]): void {
    this.children.length = 0;
    this.append(...nodes);
  }

  remove(): void {
    const siblings = this.parent?.children ?? [];
    siblings.splice(siblings.indexOf(this), 1);
  }

  focus(): void {
    fakeDocument.activeElement = this;
  }

  blur(): void {
    if (fakeDocument.activeElement === this) {
      fakeDocument.activeElement = null;
    }
  }

  click(): void {
    this.dispatch("click", {});
  }

  /** The first element under this one with class `name`. */
  find(name: string): FakeElement {
    const found = this.all(name)[0];
    if (found === undefined) {
      throw new Error(`no .${name}`);
    }
    return found;
  }

  all(name: string): FakeElement[] {
    return this.children.flatMap((child) => [
      ...(child.className.split(" ").includes(name) ? [child] : []),
      ...child.all(name),
    ]);
  }
}

const fakeDocument: {
  activeElement: FakeElement | null;
  createElement: (tag: string) => FakeElement;
} = {
  activeElement: null,
  createElement: (tag) => new FakeElement(tag),
};

/** A key press as the panel reads one: nothing else has used it. */
const key = (name: string) => ({
  key: name,
  target: null,
  repeat: false,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  defaultPrevented: false,
  preventDefault: () => undefined,
  stopPropagation: () => undefined,
});

describe("mountChat: closed and open (#2018)", () => {
  const windowListeners: ((event: unknown) => void)[] = [];
  let sent: string[];
  let chat: ChatPanel;
  let root: FakeElement;
  let input: FakeElement;
  let toggle: FakeElement;
  const isOpen = (): boolean => root.classList.contains("is-open");

  beforeEach(() => {
    vi.useFakeTimers();
    windowListeners.length = 0;
    sent = [];
    fakeDocument.activeElement = null;
    vi.stubGlobal("document", fakeDocument);
    vi.stubGlobal("window", {
      addEventListener: (_type: string, listener: (event: unknown) => void) => {
        windowListeners.push(listener);
      },
      removeEventListener: () => undefined,
    });
    for (const name of [
      "HTMLElement",
      "HTMLInputElement",
      "HTMLTextAreaElement",
      "HTMLSelectElement",
      "HTMLButtonElement",
      "HTMLAnchorElement",
    ]) {
      vi.stubGlobal(name, FakeElement);
    }
    chat = mountChat({
      selfId: "me",
      selfTeam: () => 0,
      send: (channel, text) => sent.push(`${channel}:${text}`),
    });
    root = chat.root as unknown as FakeElement;
    input = root.find("chat-input");
    toggle = root.find("chat-toggle");
  });

  afterEach(() => {
    chat.dispose();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("mounts closed, in and out of a match, with its icon named for Enter", () => {
    expect(isOpen()).toBe(false);
    chat.setInMatch(true);
    expect(isOpen()).toBe(false);
    expect(toggle.attributes.get("aria-label")).toBe("Chat (Enter)");
    expect(toggle.attributes.get("aria-expanded")).toBe("false");
  });

  it("opens and closes on the icon, focusing the box", () => {
    toggle.click();
    expect(isOpen()).toBe(true);
    expect(fakeDocument.activeElement).toBe(input);
    expect(input.placeholder).toBe("! all · # team");
    toggle.click();
    expect(isOpen()).toBe(false);
  });

  it("opens on Enter from the page", () => {
    for (const listener of windowListeners) {
      listener(key("Enter"));
    }
    expect(isOpen()).toBe(true);
  });

  it("closes on Enter: an empty line sends nothing, a line is sent", () => {
    toggle.click();
    input.dispatch("keydown", key("Enter"));
    expect(isOpen()).toBe(false);
    expect(sent).toEqual([]);
    toggle.click();
    input.value = "gg";
    input.dispatch("keydown", key("Enter"));
    expect(isOpen()).toBe(false);
    expect(sent).toEqual(["all:gg"]);
    expect(input.value).toBe("");
  });

  it("closes on Esc, sending nothing", () => {
    toggle.click();
    input.value = "half a thought";
    input.dispatch("keydown", key("Escape"));
    expect(isOpen()).toBe(false);
    expect(sent).toEqual([]);
  });

  it(`fades a line once it has shown ${String(CHAT_LINE_SHOWN_SECONDS)} s, and shows it again open`, () => {
    chat.add({ channel: "all", fromId: "ann", name: "Ann", team: 0, text: "hi" });
    const row = root.find("chat-line");
    vi.advanceTimersByTime(7000);
    expect(row.classList.contains("is-faded")).toBe(false);
    vi.advanceTimersByTime(2000);
    expect(row.classList.contains("is-faded")).toBe(true);
    // The panel hides a faded line only while closed.
    toggle.click();
    expect(isOpen()).toBe(true);
  });
});
