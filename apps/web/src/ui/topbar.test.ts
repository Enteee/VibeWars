import { afterEach, describe, expect, it, vi } from "vitest";

import type { ShownBar } from "./kit.js";
import {
  barHasMore,
  CLOSED_GLYPH,
  CLOSED_LABEL,
  CLOSED_NAME,
  CLOSED_TOOLTIP,
  CONNECTING_NOTICE_MS,
  JOINED_LOBBY_LABEL,
  JOINING_LOBBY_LABEL,
  OPEN_GLYPH,
  OPEN_LABEL,
  OPEN_NAME,
  OPEN_TOOLTIP,
  OWN_LOBBY_LABEL,
  joinControls,
  partyJoinsNotice,
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

describe("the top bar's ⋯ on a phone (#2053)", () => {
  it("comes with the join controls, even beside only a primary button", () => {
    expect(barHasMore([true], true)).toBe(true);
    expect(barHasMore([], true)).toBe(true);
  });

  it("stays away without the join controls or extra buttons", () => {
    expect(barHasMore([true], false)).toBe(false);
    expect(barHasMore([], false)).toBe(false);
    expect(barHasMore([true, false], false)).toBe(true);
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
  title = "";
  readonly tagName: string;
  readonly children: FakeElement[] = [];
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, (event: { key?: string }) => void>();
  readonly classes = new Set<string>();
  readonly classList = {
    toggle: (name: string, on: boolean): void => {
      if (on) {
        this.classes.add(name);
      } else {
        this.classes.delete(name);
      }
    },
  };

  constructor(tagName: string) {
    this.tagName = tagName;
  }

  readonly setAttribute = (name: string, value: string): void => {
    this.attributes.set(name, value);
  };

  readonly getAttribute = (name: string): string | null => this.attributes.get(name) ?? null;

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

describe("the title bar's Lobby Key and Join (#1525, #1526)", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const mount = (): {
    joined: string[];
    left: number[];
    opened: boolean[];
    join: ReturnType<typeof joinControls>;
    parts: FakeElement[];
  } => {
    vi.stubGlobal("document", { createElement: (tag: string) => new FakeElement(tag) });
    const joined: string[] = [];
    const left: number[] = [];
    const opened: boolean[] = [];
    const join = joinControls(
      () => "Rurik",
      (code, name) => joined.push(`${code} ${name}`),
      () => left.push(1),
      (open) => opened.push(open),
    );
    // The lobby this tab is in comes first, then the join.
    const [, ...parts] = (join.element as unknown as FakeElement).children;
    return { joined, left, opened, join, parts };
  };

  it("names this tab's own lobby without Leave, and a joined one with it", () => {
    const { join, left } = mount();
    const [lobby] = (join.element as unknown as FakeElement).children;
    const [label, code, copy, , leave] = lobby?.children ?? [];
    expect(lobby?.hidden).toBe(true);
    join.setLobby({ code: "ACDEFGHJKMNP", isHost: true, open: false, party: 1, joining: false });
    expect([lobby?.hidden, label?.textContent, code?.textContent, copy?.textContent]).toEqual([
      false,
      OWN_LOBBY_LABEL,
      "ACDE-FGHJ-KMNP",
      "Copy",
    ]);
    expect(leave?.hidden).toBe(true);
    join.setLobby({ code: "HJKMNPQRTWXY", isHost: false, open: true, party: 1, joining: false });
    expect([label?.textContent, code?.textContent, leave?.hidden]).toEqual([
      JOINED_LOBBY_LABEL,
      "HJKM-NPQR-TWXY",
      false,
    ]);
    leave?.fire("click");
    expect(left).toEqual([1]);
    join.setLobby(undefined);
    expect(lobby?.hidden).toBe(true);
  });

  it("gives the host a toggle, Closed first, that asks for the other state; a guest none (#1682)", () => {
    const { join, opened } = mount();
    const [lobby] = (join.element as unknown as FakeElement).children;
    const toggle = lobby?.children[3];
    if (toggle === undefined) {
      throw new Error("no toggle");
    }
    const looks = () => [
      toggle.hidden,
      toggle.children.map((part) => part.textContent).join(" "),
      toggle.getAttribute("aria-label"),
      toggle.title,
      toggle.getAttribute("aria-pressed"),
    ];
    join.setLobby({ code: "ACDEFGHJKMNP", isHost: true, open: false, party: 1, joining: false });
    expect(looks()).toEqual([
      false,
      `${CLOSED_GLYPH} ${CLOSED_LABEL}`,
      CLOSED_NAME,
      CLOSED_TOOLTIP,
      "false",
    ]);
    toggle.fire("click");
    join.setLobby({ code: "ACDEFGHJKMNP", isHost: true, open: true, party: 1, joining: false });
    expect(looks()).toEqual([
      false,
      `${OPEN_GLYPH} ${OPEN_LABEL}`,
      OPEN_NAME,
      OPEN_TOOLTIP,
      "true",
    ]);
    toggle.fire("click");
    expect(opened).toEqual([true, false]);
    join.setLobby({ code: "HJKMNPQRTWXY", isHost: false, open: false, party: 1, joining: false });
    expect(toggle.hidden).toBe(true);
  });

  it("keeps a key typed while its own lobby opens, and empties it once joined (#1526)", () => {
    const { join, parts } = mount();
    const input = parts[1];
    if (input === undefined) {
      throw new Error("no field");
    }
    input.value = "ACDE-FGHJ-KMNP";
    join.setLobby({ code: "HJKMNPQRTWXY", isHost: true, open: false, party: 1, joining: false });
    expect(input.value).toBe("ACDE-FGHJ-KMNP");
    join.setLobby({ code: "ACDEFGHJKMNP", isHost: false, open: false, party: 1, joining: false });
    expect(input.value).toBe("");
  });

  it("joins with the key upper-cased as typed, on Enter and on Join", () => {
    const { joined, parts } = mount();
    const [label, input, button] = parts;
    expect(label?.textContent).toBe("Lobby Key:");
    if (input === undefined || button === undefined) {
      throw new Error("no field or button");
    }
    input.value = "acde-fghj-kmnp";
    input.fire("input");
    input.fire("keydown", { key: "a" });
    input.fire("keydown", { key: "Enter" });
    button.fire("click");
    expect(joined).toEqual(["ACDE-FGHJ-KMNP Rurik", "ACDE-FGHJ-KMNP Rurik"]);
  });

  it("asks a host with guests once, as they follow it; Join again goes, Esc does not (#1553)", () => {
    const { joined, join, parts } = mount();
    const [, input, button, , confirm] = parts;
    if (input === undefined || button === undefined || confirm === undefined) {
      throw new Error("no field, button or confirm");
    }
    input.value = "ACDE-FGHJ-KMNP";
    join.setLobby({ code: "HJKMNPQRTWXY", isHost: true, open: true, party: 3, joining: false });
    button.fire("click");
    expect([joined, confirm.hidden, confirm.textContent]).toEqual([[], false, partyJoinsNotice(3)]);
    (join.element as unknown as FakeElement).fire("keydown", { key: "Escape" });
    expect(confirm.hidden).toBe(true);
    input.fire("keydown", { key: "Enter" });
    input.fire("keydown", { key: "Enter" });
    expect([joined, confirm.hidden]).toEqual([["ACDE-FGHJ-KMNP Rurik"], true]);
    // Alone, or a guest: no question.
    join.setLobby({ code: "HJKMNPQRTWXY", isHost: true, open: true, party: 1, joining: false });
    button.fire("click");
    join.setLobby({ code: "HJKMNPQRTWXY", isHost: false, open: true, party: 3, joining: false });
    button.fire("click");
    expect(joined).toHaveLength(3);
  });

  it("names the lobby a guest follows its host to greyed, Joining…, with neither Copy nor Leave (#1553)", () => {
    const { join } = mount();
    const [lobby] = (join.element as unknown as FakeElement).children;
    const [label, code, copy, , leave] = lobby?.children ?? [];
    join.setLobby({ code: "ACDEFGHJKMNP", isHost: false, open: false, party: 0, joining: true });
    expect([
      label?.textContent,
      code?.textContent,
      copy?.hidden,
      leave?.hidden,
      lobby?.classes.has("is-joining"),
    ]).toEqual([JOINING_LOBBY_LABEL, "ACDE-FGHJ-KMNP", true, true, true]);
    join.setLobby({ code: "ACDEFGHJKMNP", isHost: false, open: false, party: 2, joining: false });
    expect([
      label?.textContent,
      copy?.hidden,
      leave?.hidden,
      lobby?.classes.has("is-joining"),
    ]).toEqual([JOINED_LOBBY_LABEL, false, false, false]);
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
