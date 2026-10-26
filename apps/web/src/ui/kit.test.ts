import { describe, expect, it } from "vitest";

import { syncList } from "./kit.js";

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
