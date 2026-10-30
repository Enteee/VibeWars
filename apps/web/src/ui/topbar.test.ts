import { afterEach, describe, expect, it, vi } from "vitest";

import type { ShownBar } from "./kit.js";
import {
  CONNECTING_NOTICE_MS,
  JOINED_LOBBY_LABEL,
  OWN_LOBBY_LABEL,
  joinControls,
  paintStatus,
  putsMoreAway,
  type StatusElement,
} from "./topbar.js";

function status(): StatusElement {
  return { textContent: "", hidden: false, dataset: {} };
}

describe("the top bar's status (#454)", () => {
  it("says nothing and takes no space when idle", () => {
    const element = status();
    paintStatus(element, "", "offline");
    expect(element.textContent).toBe("");
    expect(element.hidden).toBe(true);
  });

  it("shows what is worth a word, in its state's colour", () => {
    const element = status();
    paintStatus(element, "", "offline");
    paintStatus(element, "could not join", "error");
    expect(element.textContent).toBe("could not join");
    expect(element.dataset.state).toBe("error");
    expect(element.hidden).toBe(false);
  });
});

describe("the top bar's ⋯ on a repaint (#1305)", () => {
  const lobby: ShownBar = {
    place: "VibeWars / Lobby",
    own: undefined,
    overlay: false,
    join: false,
  };

  it("stays open when the same screen repaints, as a lobby does when someone readies", () => {
    expect(putsMoreAway(lobby, { ...lobby }, true)).toBe(false);
  });

  it("goes away on another place, or an overlay over the same place", () => {
    expect(putsMoreAway(lobby, { ...lobby, place: "VibeWars / Teams" }, true)).toBe(true);
    expect(putsMoreAway(lobby, { ...lobby, overlay: true }, true)).toBe(true);
    expect(putsMoreAway(lobby, { ...lobby, own: "options" }, true)).toBe(true);
  });

  it("goes away on the first bar, and when nothing is left in it", () => {
    expect(putsMoreAway(undefined, lobby, true)).toBe(true);
    expect(putsMoreAway(lobby, { ...lobby }, false)).toBe(true);
  });
});

/** Just enough DOM for the bar's join; the unit tests run in Node. */
class FakeElement {
  className = "";
  textContent = "";
  value = "";
  placeholder = "";
  maxLength = -1;
  hidden = false;
  readonly tagName: string;
  readonly children: FakeElement[] = [];
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, (event: { key?: string }) => void>();

  constructor(tagName: string) {
    this.tagName = tagName;
  }

  readonly setAttribute = (name: string, value: string): void => {
    this.attributes.set(name, value);
  };

  readonly addEventListener = (type: string, listener: (event: { key?: string }) => void): void => {
    this.listeners.set(type, listener);
  };

  append(...children: FakeElement[]): void {
    this.children.push(...children);
  }

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }

  fire(type: string, event: { key?: string } = {}): void {
    this.listeners.get(type)?.(event);
  }
}

describe("the title bar's Lobby Code and Join (#1525, #1526)", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const mount = (): {
    joined: string[];
    left: number[];
    join: ReturnType<typeof joinControls>;
    parts: FakeElement[];
  } => {
    vi.stubGlobal("document", { createElement: (tag: string) => new FakeElement(tag) });
    const joined: string[] = [];
    const left: number[] = [];
    const join = joinControls(
      () => "Rurik",
      (code, name) => joined.push(`${code} ${name}`),
      () => left.push(1),
    );
    // The lobby this tab is in comes first, then the join.
    const [, ...parts] = (join.element as unknown as FakeElement).children;
    return { joined, left, join, parts };
  };

  it("names this tab's own lobby without Leave, and a joined one with it", () => {
    const { join, left } = mount();
    const [lobby] = (join.element as unknown as FakeElement).children;
    const [label, code, copy, leave] = lobby?.children ?? [];
    expect(lobby?.hidden).toBe(true);
    join.setLobby({ code: "ACDEFG", isHost: true });
    expect([lobby?.hidden, label?.textContent, code?.textContent, copy?.textContent]).toEqual([
      false,
      OWN_LOBBY_LABEL,
      "ACD-EFG",
      "Copy",
    ]);
    expect(leave?.hidden).toBe(true);
    join.setLobby({ code: "HJKMNP", isHost: false });
    expect([label?.textContent, code?.textContent, leave?.hidden]).toEqual([
      JOINED_LOBBY_LABEL,
      "HJK-MNP",
      false,
    ]);
    leave?.fire("click");
    expect(left).toEqual([1]);
    join.setLobby(undefined);
    expect(lobby?.hidden).toBe(true);
  });

  it("joins with the code upper-cased as typed, on Enter and on Join", () => {
    const { joined, parts } = mount();
    const [label, input, button] = parts;
    expect(label?.textContent).toBe("Lobby Code:");
    if (input === undefined || button === undefined) {
      throw new Error("no field or button");
    }
    input.value = "abc-def";
    input.fire("input");
    input.fire("keydown", { key: "a" });
    input.fire("keydown", { key: "Enter" });
    button.fire("click");
    expect(joined).toEqual(["ABC-DEF Rurik", "ABC-DEF Rurik"]);
  });

  it("says Connecting… once a join runs a while, until the next bar shows", () => {
    vi.useFakeTimers();
    const { join, parts } = mount();
    const connecting = parts[3];
    parts[2]?.fire("click");
    vi.advanceTimersByTime(CONNECTING_NOTICE_MS);
    expect(connecting?.hidden).toBe(false);
    join.settle();
    expect(connecting?.hidden).toBe(true);
    // A join that ended before the notice was due never shows it.
    parts[2]?.fire("click");
    join.settle();
    vi.advanceTimersByTime(CONNECTING_NOTICE_MS);
    expect(connecting?.hidden).toBe(true);
  });
});
