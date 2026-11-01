import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  TOAST_SECONDS,
  chipLabel,
  dismissToast,
  emptyState,
  inlineConfirm,
  keepInside,
  screenBar,
  selectableRow,
  setToastHost,
  setTopbarSlots,
  syncList,
  toast,
  type ShownBar,
  type TopbarSlots,
} from "./kit.js";

/**
 * Just enough of a container for `syncList`, without jsdom: an ordered
 * list of children that can insert before one and remove one, and a
 * count of the moves, so a test can tell "kept in place" from "moved".
 */
class FakeContainer {
  readonly children: FakeElement[] = [];
  moves = 0;

  insertBefore(node: FakeElement, before: FakeElement | null): void {
    this.moves += 1;
    node.remove();
    const index = before === null ? -1 : this.children.indexOf(before);
    this.children.splice(index === -1 ? this.children.length : index, 0, node);
    node.parent = this;
  }
}

class FakeElement {
  parent: FakeContainer | undefined;
  text = "";
  updates = 0;

  readonly made: string;

  constructor(made: string) {
    this.made = made;
  }

  remove(): void {
    if (this.parent !== undefined) {
      this.parent.children.splice(this.parent.children.indexOf(this), 1);
      this.parent = undefined;
    }
  }
}

function sync(container: FakeContainer, items: readonly string[]): void {
  syncList(
    container as unknown as HTMLElement,
    items,
    (item) => item,
    (item) => new FakeElement(item) as unknown as HTMLElement,
    (element, item) => {
      const fake = element as unknown as FakeElement;
      fake.text = item.toUpperCase();
      fake.updates += 1;
    },
  );
}

const order = (container: FakeContainer) => container.children.map((child) => child.made);

describe("syncList (#563)", () => {
  it("creates one element per item, in order, and updates each", () => {
    const list = new FakeContainer();
    sync(list, ["a", "b", "c"]);
    expect(order(list)).toEqual(["a", "b", "c"]);
    expect(list.children.map((child) => child.text)).toEqual(["A", "B", "C"]);
  });

  it("keeps the very element for a kept key, updates it, and moves nothing in place", () => {
    const list = new FakeContainer();
    sync(list, ["a", "b", "c"]);
    const [a, b, c] = list.children;
    list.moves = 0;
    sync(list, ["a", "b", "c"]);
    expect(list.children).toEqual([a, b, c]);
    expect(list.moves).toBe(0);
    expect(a?.updates).toBe(2);
  });

  it("inserts a new key where it belongs, around the kept ones", () => {
    const list = new FakeContainer();
    sync(list, ["a", "c"]);
    const [a, c] = list.children;
    sync(list, ["a", "b", "c"]);
    expect(order(list)).toEqual(["a", "b", "c"]);
    expect(list.children[0]).toBe(a);
    expect(list.children[2]).toBe(c);
  });

  it("removes a key that is gone, and anything it did not place", () => {
    const list = new FakeContainer();
    sync(list, ["a", "b", "c"]);
    list.insertBefore(new FakeElement("stranger"), null);
    const [a, , c] = list.children;
    sync(list, ["a", "c"]);
    expect(list.children).toEqual([a, c]);
  });

  it("reorders kept elements without rebuilding them", () => {
    const list = new FakeContainer();
    sync(list, ["a", "b", "c"]);
    const [a, b, c] = list.children;
    sync(list, ["c", "a", "b"]);
    expect(list.children).toEqual([c, a, b]);
  });
});

/**
 * Just enough of the DOM for a toast and an inline confirmation (#566):
 * elements in a tree, a click, the focus, and `document.body`.
 */
class FakeNode {
  className = "";
  textContent = "";
  hidden = false;
  type = "";
  /** The page itself: what is below it is connected (#578). */
  isPage = false;
  readonly style = { display: "" };
  readonly classes = new Set<string>();
  readonly classList = {
    add: (name: string): void => {
      this.classes.add(name);
    },
    toggle: (name: string, on: boolean): void => {
      if (on) {
        this.classes.add(name);
      } else {
        this.classes.delete(name);
      }
    },
  };
  parent: FakeNode | undefined;
  readonly children: FakeNode[] = [];
  readonly #clicks: (() => void)[] = [];

  readonly tag: string;

  constructor(tag = "") {
    this.tag = tag;
  }

  get parentElement(): FakeNode | null {
    return this.parent ?? null;
  }

  get isConnected(): boolean {
    return this.isPage || this.parent?.isConnected === true;
  }

  setAttribute(): void {
    // Roles and labels are not under test here.
  }

  append(...nodes: FakeNode[]): void {
    for (const node of nodes) {
      this.appendChild(node);
    }
  }

  appendChild(node: FakeNode): FakeNode {
    node.remove();
    node.parent = this;
    this.children.push(node);
    return node;
  }

  replaceChildren(...nodes: FakeNode[]): void {
    for (const child of [...this.children]) {
      child.remove();
    }
    this.append(...nodes);
  }

  /** The text of everything below, as the page would read it. */
  get text(): string {
    return this.textContent + this.children.map((child) => child.text).join("");
  }

  after(node: FakeNode): void {
    node.remove();
    const parent = this.parent;
    if (parent !== undefined) {
      parent.children.splice(parent.children.indexOf(this) + 1, 0, node);
      node.parent = parent;
    }
  }

  remove(): void {
    if (this.parent !== undefined) {
      this.parent.children.splice(this.parent.children.indexOf(this), 1);
      this.parent = undefined;
    }
  }

  addEventListener(_type: string, listener: () => void): void {
    this.#clicks.push(listener);
  }

  click(): void {
    for (const listener of this.#clicks) {
      listener();
    }
  }

  focus(): void {
    focusLog.push(this);
  }

  /** The button labelled `label` anywhere below. */
  button(label: string): FakeNode {
    const found = this.children.flatMap((child) =>
      child.textContent === label
        ? [child]
        : child.children.length > 0
          ? [child.button(label)]
          : [],
    )[0];
    if (found === undefined) {
      throw new Error(`no ${label} button`);
    }
    return found;
  }
}

/** Every element focused, latest last. */
const focusLog: FakeNode[] = [];
let body = new FakeNode();

/** What `createElement` makes: a node that knows its tag. */
const createElement = (tag: string): FakeNode => new FakeNode(tag);

describe("toast (#566)", () => {
  beforeEach(() => {
    body = new FakeNode();
    vi.stubGlobal("document", { createElement, body });
    vi.useFakeTimers();
  });
  afterEach(() => {
    setToastHost(null);
    dismissToast();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shows one at a time: a new one replaces the old", () => {
    toast("Saved.");
    toast("Copied.");
    expect(body.children).toHaveLength(1);
    expect(body.children[0]?.children[0]?.textContent).toBe("Copied.");
  });

  it("goes after its seconds, and the replaced one's timer takes nothing down", () => {
    toast("first");
    vi.advanceTimersByTime(TOAST_SECONDS * 1000 - 100);
    toast("second");
    vi.advanceTimersByTime(200);
    expect(body.children).toHaveLength(1);
    vi.advanceTimersByTime(TOAST_SECONDS * 1000);
    expect(body.children).toHaveLength(0);
  });

  it("offers Undo when asked, which undoes once and takes the toast down", () => {
    const undo = vi.fn();
    toast("Removed Barrage.", { undo });
    body.button("Undo").click();
    expect(undo).toHaveBeenCalledOnce();
    expect(body.children).toHaveLength(0);
  });

  it("hands back a dismiss that takes down its own toast, not a newer one", () => {
    const dismissFirst = toast("Removed Barrage.", { undo: vi.fn() });
    toast("Copied.");
    dismissFirst();
    expect(body.children).toHaveLength(1);
    toast("Removed Barrage.", { undo: vi.fn() })();
    expect(body.children).toHaveLength(0);
  });

  describe("with a host (#1465)", () => {
    const host = (): HTMLElement => {
      const node = new FakeNode();
      node.isPage = true;
      return node as unknown as HTMLElement;
    };

    it("goes into the host while one is set, and onto the page again once it is cleared", () => {
      const column = host();
      setToastHost(column);
      toast("Shrines: +2");
      expect((column as unknown as FakeNode).children).toHaveLength(1);
      expect(body.children).toHaveLength(0);
      setToastHost(null);
      toast("Saved.");
      expect(body.children).toHaveLength(1);
    });

    it("shows one at a time across the page and the host", () => {
      const column = host();
      toast("Saved.");
      setToastHost(column);
      toast("Shrines: +2");
      expect(body.children).toHaveLength(0);
      expect((column as unknown as FakeNode).children).toHaveLength(1);
    });

    it("takes a toast in the host down with it, so none outlives the match", () => {
      const column = host();
      setToastHost(column);
      toast("Shrines: +2");
      setToastHost(null);
      expect((column as unknown as FakeNode).children).toHaveLength(0);
    });

    it("leaves a toast on the page up when a host is set", () => {
      toast("Copied.");
      setToastHost(host());
      expect(body.children).toHaveLength(1);
    });

    it("offers Undo there too", () => {
      const column = host();
      setToastHost(column);
      const undo = vi.fn();
      toast("Removed Barrage.", { undo });
      (column as unknown as FakeNode).button("Undo").click();
      expect(undo).toHaveBeenCalledOnce();
      expect((column as unknown as FakeNode).children).toHaveLength(0);
    });
  });
});

describe("inlineConfirm (#566)", () => {
  beforeEach(() => {
    vi.stubGlobal("document", { createElement, body: new FakeNode() });
    focusLog.length = 0;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** An anchor button in a bar, and what asking in its place shows. */
  function asking(onConfirm: () => void) {
    const bar = new FakeNode();
    const anchor = new FakeNode();
    bar.appendChild(anchor);
    const confirm = inlineConfirm(
      anchor as unknown as HTMLElement,
      "Delete Pyro?",
      "delete",
      onConfirm,
    );
    return { bar, anchor, confirm };
  }

  it("asks in the anchor's place, with the focus on cancel", () => {
    const { bar, anchor } = asking(() => undefined);
    expect(anchor.hidden).toBe(true);
    const ask = bar.children[1];
    expect(ask?.children.map((child) => child.textContent)).toEqual([
      "Delete Pyro?",
      "delete",
      "Cancel",
    ]);
    expect(focusLog.at(-1)?.textContent).toBe("Cancel");
  });

  it("runs the action once on confirm, and puts the anchor back", () => {
    const onConfirm = vi.fn();
    const { bar, anchor, confirm } = asking(onConfirm);
    bar.button("delete").click();
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(anchor.hidden).toBe(false);
    expect(bar.children).toEqual([anchor]);
    expect(confirm.isOpen()).toBe(false);
  });

  it("does nothing on cancel or dismiss but put the anchor back", () => {
    const onConfirm = vi.fn();
    const first = asking(onConfirm);
    first.bar.button("Cancel").click();
    expect(first.anchor.hidden).toBe(false);
    expect(focusLog.at(-1)).toBe(first.anchor);
    const second = asking(onConfirm);
    second.confirm.dismiss();
    expect(second.bar.children).toEqual([second.anchor]);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe("chipLabel (#566)", () => {
  it("counts blocking problems first, then hints, else says ready", () => {
    const problem = (blocking: boolean) => ({ text: "x", blocking });
    expect(chipLabel([problem(true), problem(false), problem(true)])).toBe("2 problems");
    expect(chipLabel([problem(true)])).toBe("1 problem");
    expect(chipLabel([problem(false)])).toBe("1 hint");
    expect(chipLabel([])).toBe("Ready");
  });
});

/** The kit's one Esc listener, caught the first time a screen bar adds it. */
let escapeListener: ((event: KeyboardEvent) => void) | undefined;

class FakeTextArea {
  readonly value = "";
}
class FakeInput {
  type = "text";
}

describe("screenBar in the top bar (#578, #1272)", () => {
  let page: FakeNode;
  let topbar: FakeNode;
  let slots: { crumbs: FakeNode; back: FakeNode; status: FakeNode; actions: FakeNode };
  let shown: ShownBar[];
  let overflowOpen: boolean;
  beforeEach(() => {
    page = new FakeNode();
    page.isPage = true;
    topbar = new FakeNode();
    page.appendChild(topbar);
    slots = {
      crumbs: new FakeNode(),
      back: new FakeNode(),
      status: new FakeNode(),
      actions: new FakeNode(),
    };
    topbar.append(slots.crumbs, slots.back, slots.status, slots.actions);
    shown = [];
    overflowOpen = false;
    vi.stubGlobal("document", { createElement, body: new FakeNode() });
    vi.stubGlobal("window", {
      addEventListener: (_type: string, listener: (event: KeyboardEvent) => void) => {
        escapeListener = listener;
      },
    });
    vi.stubGlobal("HTMLTextAreaElement", FakeTextArea);
    vi.stubGlobal("HTMLInputElement", FakeInput);
    setTopbarSlots({
      ...(slots as unknown as Pick<TopbarSlots, "crumbs" | "back" | "status" | "actions">),
      onShow: (next) => {
        shown.push(next);
      },
      putAway: () => {
        const was = overflowOpen;
        overflowOpen = false;
        return was;
      },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Press Esc on `target`; whether the page's default was prevented. */
  function pressEscape(target: unknown = page): boolean {
    let prevented = false;
    const event = {
      key: "Escape",
      repeat: false,
      target,
      get defaultPrevented() {
        return prevented;
      },
      preventDefault() {
        prevented = true;
      },
    };
    escapeListener?.(event as unknown as KeyboardEvent);
    return prevented;
  }

  /** A screen's bar, shown, and its back. */
  function screen(putAway: () => boolean = () => false, title = "Teams") {
    const onBack = vi.fn();
    const bar = screenBar({
      crumbs: ["VibeWars", title],
      back: { label: "Back", onBack },
      actions: [],
      putAway,
    });
    return { onBack, back: bar.back as unknown as FakeNode };
  }

  it("fills the top bar: the crumbs, Back, the status and the screen's buttons", () => {
    const name = new FakeNode("input");
    const status = new FakeNode();
    const save = new FakeNode("button");
    const { back } = screenBar({
      crumbs: ["VibeWars", "Teams", name as unknown as HTMLElement],
      back: { label: "Close", onBack: vi.fn() },
      status: [status as unknown as HTMLElement],
      actions: [save as unknown as HTMLElement],
    });
    expect(slots.crumbs.text).toBe("VibeWars > Teams > ");
    expect(slots.crumbs.children.at(-1)).toBe(name);
    expect(name.classes.has("is-place")).toBe(true);
    expect(slots.crumbs.children[0]?.classes.has("is-place")).toBe(false);
    expect(slots.back.children).toEqual([back]);
    expect(slots.back.text).toBe("‹Close");
    expect(slots.status.children).toEqual([status]);
    expect(slots.actions.children).toEqual([save]);
    // Where it is, as text, so a repaint in place can be told from a move.
    expect(shown.at(-1)?.place).toBe("VibeWars / Teams / ");
  });

  it("tells a repaint in place from a move by its place (#1305)", () => {
    screen(undefined, "Lobby");
    screen(undefined, "Lobby");
    expect(shown.at(-2)?.place).toBe("VibeWars / Lobby");
    expect(shown.at(-1)?.place).toBe("VibeWars / Lobby");
    screen(undefined, "Teams");
    expect(shown.at(-1)?.place).toBe("VibeWars / Teams");
  });

  it("replaces the last screen's bar, and the main menu has no Back", () => {
    screen();
    const menu = screenBar({ crumbs: ["VibeWars"], actions: [] });
    expect(menu.back).toBeUndefined();
    expect(slots.crumbs.text).toBe("VibeWars");
    expect(slots.back.children).toEqual([]);
    expect(() => pressEscape()).not.toThrow();
  });

  it("goes back from the newest bar, as its back button does", () => {
    const old = screen();
    const current = screen();
    expect(pressEscape()).toBe(true);
    expect(current.onBack).toHaveBeenCalledOnce();
    expect(old.onBack).not.toHaveBeenCalled();
  });

  it("leaves through `escape` on a screen with no Back (#1902)", () => {
    const escape = vi.fn();
    let open = true;
    const bar = screenBar({
      crumbs: ["VibeWars", "Team Builder"],
      escape,
      actions: [],
      putAway: () => {
        const was = open;
        open = false;
        return was;
      },
    });
    expect(bar.back).toBeUndefined();
    expect(slots.back.children).toEqual([]);
    // What is open is put away first, as before a Back.
    expect(pressEscape()).toBe(true);
    expect(escape).not.toHaveBeenCalled();
    expect(pressEscape()).toBe(true);
    expect(escape).toHaveBeenCalledOnce();
  });

  it("shows an overlay's bar above the screen's, and the screen's again once it is released (#454)", () => {
    const below = screen();
    const onClose = vi.fn();
    const overlay = screenBar({
      crumbs: ["VibeWars", "Options"],
      back: { label: "Close", onBack: onClose },
      actions: [],
      overlay: true,
      own: "options",
    });
    expect(slots.crumbs.text).toBe("VibeWars > Options");
    expect(shown.at(-1)).toEqual({
      place: "VibeWars / Options",
      own: "options",
      overlay: true,
      join: false,
    });
    // A lobby repaints under it: the overlay's bar stays.
    const repainted = screen(undefined, "Lobby");
    expect(slots.crumbs.text).toBe("VibeWars > Options");
    expect(slots.back.children).toEqual([overlay.back]);
    expect(pressEscape()).toBe(true);
    expect(onClose).toHaveBeenCalledOnce();
    expect(repainted.onBack).not.toHaveBeenCalled();
    expect(below.onBack).not.toHaveBeenCalled();
    // Closed, the screen's bar is back exactly, and so is its Esc.
    overlay.release();
    expect(slots.crumbs.text).toBe("VibeWars > Lobby");
    expect(slots.back.children).toEqual([repainted.back]);
    expect(shown.at(-1)).toEqual({
      place: "VibeWars / Lobby",
      own: undefined,
      overlay: false,
      join: false,
    });
    pressEscape();
    expect(onClose).toHaveBeenCalledOnce();
    expect(repainted.onBack).toHaveBeenCalledOnce();
  });

  it("does nothing while the top bar is hidden, as in a match", () => {
    const { onBack } = screen();
    topbar.hidden = true;
    expect(pressEscape()).toBe(false);
    expect(onBack).not.toHaveBeenCalled();
  });

  it("puts away the bar's open ⋯ before going back", () => {
    const { onBack } = screen();
    overflowOpen = true;
    expect(pressEscape()).toBe(true);
    expect(overflowOpen).toBe(false);
    expect(onBack).not.toHaveBeenCalled();
    pressEscape();
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("cancels an open inline confirmation instead of going back", () => {
    const { onBack, back } = screen();
    const onConfirm = vi.fn();
    const confirm = inlineConfirm(back as unknown as HTMLElement, "Leave?", "Leave", onConfirm);
    pressEscape();
    expect(confirm.isOpen()).toBe(false);
    expect(back.hidden).toBe(false);
    expect(focusLog.at(-1)).toBe(back);
    expect(onBack).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
    pressEscape();
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("lets the screen put away what it has open first", () => {
    let open = true;
    const { onBack } = screen(() => {
      const was = open;
      open = false;
      return was;
    });
    pressEscape();
    expect(onBack).not.toHaveBeenCalled();
    pressEscape();
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("goes back from a text field, and leaves a search field's or a used Esc alone", () => {
    const { onBack } = screen();
    const search = new FakeInput();
    search.type = "search";
    expect(pressEscape(search)).toBe(false);
    expect(pressEscape(new FakeTextArea())).toBe(false);
    expect(onBack).not.toHaveBeenCalled();
    escapeListener?.({
      key: "Escape",
      repeat: false,
      defaultPrevented: true,
      target: page,
    } as unknown as KeyboardEvent);
    expect(onBack).not.toHaveBeenCalled();
    pressEscape(new FakeInput());
    expect(onBack).toHaveBeenCalledOnce();
  });
});

describe("selectableRow (#578)", () => {
  beforeEach(() => {
    vi.stubGlobal("document", { createElement, body: new FakeNode() });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is a real button, chosen by a click, with its actions beside it, not inside", () => {
    const onSelect = vi.fn();
    const onEdit = vi.fn();
    const edit = new FakeNode("button");
    edit.textContent = "Edit";
    edit.addEventListener("click", onEdit);
    const row = selectableRow({
      name: "Pyro",
      subtitle: "Elementalist",
      actions: [edit as unknown as HTMLElement],
      onSelect,
    }) as unknown as FakeNode;
    const [choose, actions] = row.children;
    // A <button type="button"> is in the Tab order, and Enter and Space
    // press it, natively.
    expect(choose?.tag).toBe("button");
    expect(choose?.type).toBe("button");
    expect(choose?.button("Pyro")).toBeDefined();
    expect(actions?.children).toEqual([edit]);
    choose?.click();
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onEdit).not.toHaveBeenCalled();
  });
});

describe("emptyState (#578)", () => {
  beforeEach(() => {
    vi.stubGlobal("document", { createElement, body: new FakeNode() });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("says what is missing next to the button that makes the first one", () => {
    const onAction = vi.fn();
    const state = emptyState("No teams yet.", "New team", onAction) as unknown as FakeNode;
    expect(state.children.map((child) => child.textContent)).toEqual(["No teams yet.", "New team"]);
    state.button("New team").click();
    expect(onAction).toHaveBeenCalledOnce();
  });
});

describe("keepInside (#2028)", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { innerWidth: 1100 });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const panel = (left: number, width: number) => ({
    style: { translate: "4px", maxWidth: "" },
    getBoundingClientRect: () => ({ left, right: left + width }),
  });

  it("moves a panel past the left edge to 8 px inside it", () => {
    const shown = panel(-26, 448);
    keepInside(shown);
    expect(shown.style.translate).toBe("34px");
  });

  it("moves one past the right edge back inside it", () => {
    const shown = panel(800, 400);
    keepInside(shown);
    expect(shown.style.translate).toBe("-108px");
  });

  it("leaves one already inside where its anchor puts it", () => {
    const shown = panel(600, 448);
    keepInside(shown);
    expect(shown.style.translate).toBe("");
  });

  it("is never wider than the window less both margins", () => {
    const shown = panel(8, 448);
    keepInside(shown);
    expect(shown.style.maxWidth).toBe("1084px");
  });
});
