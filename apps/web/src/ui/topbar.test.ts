import { afterEach, describe, expect, it, vi } from "vitest";

import type * as Kit from "./kit.js";
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
import { COPIED } from "./lobby-screen.js";

const toasts: string[] = [];

// A toast needs a page; what it would say is enough here.
vi.mock("./kit.js", async (original) => ({
  ...(await original<typeof Kit>()),
  toast: (text: string) => {
    toasts.push(text);
    return () => undefined;
  },
}));

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

describe("the title bar's lobby and invite links (#1526, #2100)", () => {
  const OWN = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
  const FRIEND = "_wECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const mount = (): {
    joined: string[];
    left: number[];
    opened: boolean[];
    join: ReturnType<typeof joinControls>;
    lobby: FakeElement;
    share: FakeElement;
    connecting: FakeElement;
    confirm: FakeElement;
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
    const [lobby, share, connecting, confirm] = (join.element as unknown as FakeElement).children;
    if (
      lobby === undefined ||
      share === undefined ||
      connecting === undefined ||
      confirm === undefined
    ) {
      throw new Error("no lobby, share line, connecting or confirm");
    }
    return { joined, left, opened, join, lobby, share, connecting, confirm };
  };

  it("names this tab's own lobby without Leave, and a joined one with it; never its key", () => {
    const { join, left, lobby } = mount();
    const [label, copy, , leave] = lobby.children;
    expect(lobby.hidden).toBe(true);
    join.setLobby({ code: OWN, isHost: true, open: false, party: 1, joining: false });
    expect([lobby.hidden, label?.textContent, copy?.textContent]).toEqual([
      false,
      OWN_LOBBY_LABEL,
      "Copy invite link",
    ]);
    expect(leave?.hidden).toBe(true);
    join.setLobby({ code: FRIEND, isHost: false, open: true, party: 1, joining: false });
    expect([label?.textContent, leave?.hidden]).toEqual([JOINED_LOBBY_LABEL, false]);
    leave?.fire("click");
    expect(left).toEqual([1]);
    const text = (element: FakeElement): string =>
      element.textContent + element.children.map(text).join("");
    expect(text(join.element as unknown as FakeElement)).not.toContain(FRIEND);
    join.setLobby(undefined);
    expect(lobby.hidden).toBe(true);
  });

  it("has no key field", () => {
    const { join } = mount();
    const inputs = (element: FakeElement): FakeElement[] => [
      ...(element.tagName === "input" && element.className !== "editor-share-line"
        ? [element]
        : []),
      ...element.children.flatMap(inputs),
    ];
    expect(inputs(join.element as unknown as FakeElement)).toEqual([]);
  });

  it("copies the lobby's invite link, not its key", async () => {
    const { join, lobby, share } = mount();
    const written: string[] = [];
    vi.stubGlobal("location", { origin: "https://enteee.github.io", pathname: "/VibeWars/" });
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: (text: string) => {
          written.push(text);
          return Promise.resolve();
        },
      },
    });
    join.setLobby({ code: OWN, isHost: true, open: false, party: 1, joining: false });
    lobby.children[1]?.fire("click");
    await vi.waitFor(() => {
      expect(written).toEqual([`https://enteee.github.io/VibeWars/#lobby=${OWN}`]);
    });
    expect([share.hidden, toasts.at(-1)]).toEqual([true, COPIED]);
  });

  it("gives the host a toggle, Closed first, that asks for the other state; a guest none (#1682)", () => {
    const { join, opened, lobby } = mount();
    const toggle = lobby.children[2];
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
    join.setLobby({ code: OWN, isHost: true, open: false, party: 1, joining: false });
    expect(looks()).toEqual([
      false,
      `${CLOSED_GLYPH} ${CLOSED_LABEL}`,
      CLOSED_NAME,
      CLOSED_TOOLTIP,
      "false",
    ]);
    toggle.fire("click");
    join.setLobby({ code: OWN, isHost: true, open: true, party: 1, joining: false });
    expect(looks()).toEqual([
      false,
      `${OPEN_GLYPH} ${OPEN_LABEL}`,
      OPEN_NAME,
      OPEN_TOOLTIP,
      "true",
    ]);
    toggle.fire("click");
    expect(opened).toEqual([true, false]);
    join.setLobby({ code: FRIEND, isHost: false, open: false, party: 1, joining: false });
    expect(toggle.hidden).toBe(true);
  });

  it("joins the lobby an invite link names", () => {
    const { joined, join } = mount();
    expect(join.invite(FRIEND)).toBe(true);
    expect(joined).toEqual([`${FRIEND} Rurik`]);
  });

  it("joins nothing from a bar without the controls, a lobby's or a match's", () => {
    const { joined, join } = mount();
    (join.element as unknown as FakeElement).hidden = true;
    expect(join.invite(FRIEND)).toBe(false);
    expect(joined).toEqual([]);
  });

  it("asks a host with guests first, as they follow it; Join goes, Esc does not (#1553)", () => {
    const { joined, join, confirm } = mount();
    const [text, go] = confirm.children;
    join.setLobby({ code: OWN, isHost: true, open: true, party: 3, joining: false });
    join.invite(FRIEND);
    expect([joined, confirm.hidden, text?.textContent]).toEqual([[], false, partyJoinsNotice(3)]);
    (join.element as unknown as FakeElement).fire("keydown", { key: "Escape" });
    expect(confirm.hidden).toBe(true);
    go?.fire("click");
    expect(joined).toEqual([]);
    join.invite(FRIEND);
    go?.fire("click");
    expect([joined, confirm.hidden]).toEqual([[`${FRIEND} Rurik`], true]);
    // Alone, or a guest: no question.
    join.setLobby({ code: OWN, isHost: true, open: true, party: 1, joining: false });
    join.invite(FRIEND);
    join.setLobby({ code: OWN, isHost: false, open: true, party: 3, joining: false });
    join.invite(FRIEND);
    expect(joined).toHaveLength(3);
  });

  it("names the lobby a guest follows its host to greyed, Joining…, with neither Copy nor Leave (#1553)", () => {
    const { join, lobby } = mount();
    const [label, copy, , leave] = lobby.children;
    join.setLobby({ code: FRIEND, isHost: false, open: false, party: 0, joining: true });
    expect([
      label?.textContent,
      copy?.hidden,
      leave?.hidden,
      lobby.classes.has("is-joining"),
    ]).toEqual([JOINING_LOBBY_LABEL, true, true, true]);
    join.setLobby({ code: FRIEND, isHost: false, open: false, party: 2, joining: false });
    expect([
      label?.textContent,
      copy?.hidden,
      leave?.hidden,
      lobby.classes.has("is-joining"),
    ]).toEqual([JOINED_LOBBY_LABEL, false, false, false]);
  });

  it("says Connecting… once a join runs a while, until the next bar shows", () => {
    vi.useFakeTimers();
    const { join, connecting } = mount();
    join.invite(FRIEND);
    vi.advanceTimersByTime(CONNECTING_NOTICE_MS);
    expect(connecting.hidden).toBe(false);
    join.settle();
    expect(connecting.hidden).toBe(true);
    // A join that ended before the notice was due never shows it.
    join.invite(FRIEND);
    join.settle();
    vi.advanceTimersByTime(CONNECTING_NOTICE_MS);
    expect(connecting.hidden).toBe(true);
  });
});
