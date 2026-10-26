import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  TOAST_SECONDS,
  chipLabel,
  dismissToast,
  emptyState,
  inlineConfirm,
  screenBar,
  selectableRow,
  syncList,
  toast,
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
  readonly classList = { toggle: (): void => undefined };
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

describe("screenBar's Esc (#578)", () => {
  let page: FakeNode;
  beforeEach(() => {
    page = new FakeNode();
    page.isPage = true;
    vi.stubGlobal("document", { createElement, body: new FakeNode() });
    vi.stubGlobal("window", {
      addEventListener: (_type: string, listener: (event: KeyboardEvent) => void) => {
        escapeListener = listener;
      },
    });
    vi.stubGlobal("HTMLTextAreaElement", FakeTextArea);
    vi.stubGlobal("HTMLInputElement", FakeInput);
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

  /** A screen with a bar on the page, and its back. */
  function screen(putAway: () => boolean = () => false) {
    const onBack = vi.fn();
    const bar = screenBar({ back: { label: "Back", onBack }, actions: [], putAway });
    page.appendChild(bar.element as unknown as FakeNode);
    return { onBack, back: bar.back as unknown as FakeNode };
  }

  it("goes back from the newest bar on the page, as its back button does", () => {
    const old = screen();
    page.children.length = 0;
    const current = screen();
    expect(pressEscape()).toBe(true);
    expect(current.onBack).toHaveBeenCalledOnce();
    expect(old.onBack).not.toHaveBeenCalled();
  });

  it("does nothing while the screens are hidden, as in a match", () => {
    const { onBack } = screen();
    page.style.display = "none";
    expect(pressEscape()).toBe(false);
    expect(onBack).not.toHaveBeenCalled();
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

  it("has nothing to go back to on a screen without a back, such as the main menu", () => {
    const bar = screenBar({ actions: [] });
    page.appendChild(bar.element as unknown as FakeNode);
    expect(bar.back).toBeUndefined();
    expect(() => pressEscape()).not.toThrow();
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
