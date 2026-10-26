import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TOAST_SECONDS, chipLabel, dismissToast, inlineConfirm, syncList, toast } from "./kit.js";

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
  parent: FakeNode | undefined;
  readonly children: FakeNode[] = [];
  readonly #clicks: (() => void)[] = [];

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

describe("toast (#566)", () => {
  beforeEach(() => {
    body = new FakeNode();
    vi.stubGlobal("document", { createElement: () => new FakeNode(), body });
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
    body.button("undo").click();
    expect(undo).toHaveBeenCalledOnce();
    expect(body.children).toHaveLength(0);
  });
});

describe("inlineConfirm (#566)", () => {
  beforeEach(() => {
    vi.stubGlobal("document", { createElement: () => new FakeNode(), body: new FakeNode() });
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
      "cancel",
    ]);
    expect(focusLog.at(-1)?.textContent).toBe("cancel");
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
    first.bar.button("cancel").click();
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
    expect(chipLabel([])).toBe("ready");
  });
});
