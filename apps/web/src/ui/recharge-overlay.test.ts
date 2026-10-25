import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { paintRecharge, READY_FLASH_MS, rechargeView } from "./recharge-overlay.js";

describe("rechargeView", () => {
  it("shows nothing for a ready skill, or one with no recharge at all", () => {
    expect(rechargeView({ remaining: 0, total: 10 }, "Fireball", false)).toBeUndefined();
    expect(rechargeView({ remaining: 0, total: 0 }, "Fireball", false)).toBeUndefined();
  });

  it("shades the share still to go, and says the whole seconds left", () => {
    expect(rechargeView({ remaining: 7.4, total: 10 }, "Fireball", false)).toEqual({
      fraction: 0.74,
      seconds: "7",
      label: "Fireball, recharging, 7 seconds",
    });
  });

  it("stops the number at 1; the last second is the wipe alone", () => {
    expect(rechargeView({ remaining: 1.2, total: 10 }, "Fireball", false)?.seconds).toBe("1");
    const last = rechargeView({ remaining: 0.4, total: 10 }, "Fireball", false);
    expect(last?.seconds).toBe("");
    expect(last?.label).toBe("Fireball, recharging, 1 second");
  });

  it("snaps the wipe up to the next eighth with reduced motion", () => {
    expect(rechargeView({ remaining: 7.4, total: 10 }, "Fireball", true)?.fraction).toBe(0.75);
    expect(rechargeView({ remaining: 0.1, total: 10 }, "Fireball", true)?.fraction).toBe(0.125);
    expect(rechargeView({ remaining: 10, total: 10 }, "Fireball", true)?.fraction).toBe(1);
  });

  it("never shades more than the whole slot", () => {
    expect(rechargeView({ remaining: 12, total: 10 }, "Fireball", false)?.fraction).toBe(1);
  });
});

/**
 * Just enough of an element for `paintRecharge`, without jsdom: children,
 * classes, attributes, a style, and the one selector it uses.
 */
class FakeElement {
  className = "";
  textContent = "";
  readonly children: FakeElement[] = [];
  #parent: FakeElement | undefined;
  readonly #attributes = new Map<string, string>();
  readonly #style = new Map<string, string>();

  readonly classList = {
    add: (name: string): void => {
      this.className = [...this.#classes(), name].join(" ");
    },
    remove: (name: string): void => {
      this.className = this.#classes()
        .filter((existing) => existing !== name)
        .join(" ");
    },
    contains: (name: string): boolean => this.#classes().includes(name),
  };

  readonly style = {
    getPropertyValue: (name: string): string => this.#style.get(name) ?? "",
    setProperty: (name: string, value: string): void => {
      this.#style.set(name, value);
    },
  };

  get firstElementChild(): FakeElement | null {
    return this.children[0] ?? null;
  }

  appendChild(child: FakeElement): FakeElement {
    child.#parent = this;
    this.children.push(child);
    return child;
  }

  remove(): void {
    const siblings = this.#parent?.children;
    siblings?.splice(siblings.indexOf(this), 1);
    this.#parent = undefined;
  }

  querySelector(selector: string): FakeElement | null {
    const direct = /^:scope > \.([\w-]+)$/.exec(selector);
    if (direct === null) {
      throw new Error(`FakeElement cannot select ${selector}`);
    }
    return this.children.find((child) => child.classList.contains(direct[1] ?? "")) ?? null;
  }

  getAttribute(name: string): string | null {
    return this.#attributes.get(name) ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.#attributes.set(name, value);
  }

  removeAttribute(name: string): void {
    this.#attributes.delete(name);
  }

  #classes(): string[] {
    return this.className.split(" ").filter((name) => name !== "");
  }
}

describe("paintRecharge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("document", { createElement: () => new FakeElement() });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function paint(slot: FakeElement, remaining: number): void {
    paintRecharge(slot as unknown as HTMLElement, { remaining, total: 10 }, "Fireball", false);
  }

  it("puts the seconds in .recharge-seconds, not in the wipe itself", () => {
    const slot = new FakeElement();
    paint(slot, 7.4);

    const overlay = slot.querySelector(":scope > .recharge-overlay");
    expect(overlay?.textContent).toBe("");
    expect(overlay?.children.map((child) => child.className)).toEqual(["recharge-seconds"]);
    expect(overlay?.firstElementChild?.textContent).toBe("7");
    expect(overlay?.style.getPropertyValue("--recharge")).toBe("0.74");

    paint(slot, 3.2);
    expect(overlay?.firstElementChild?.textContent).toBe("3");
  });

  it("marks the slot is-recharging for as long as the overlay, the last second included", () => {
    const slot = new FakeElement();
    paint(slot, 7.4);
    expect(slot.classList.contains("is-recharging")).toBe(true);

    paint(slot, 0.4);
    expect(slot.querySelector(":scope > .recharge-overlay")?.firstElementChild?.textContent).toBe(
      "",
    );
    expect(slot.classList.contains("is-recharging")).toBe(true);

    paint(slot, 0);
    expect(slot.querySelector(":scope > .recharge-overlay")).toBeNull();
    expect(slot.classList.contains("is-recharging")).toBe(false);
    expect(slot.getAttribute("aria-label")).toBeNull();
    // The ready flash still fires, and ends.
    expect(slot.classList.contains("is-ready-flash")).toBe(true);
    vi.advanceTimersByTime(READY_FLASH_MS);
    expect(slot.classList.contains("is-ready-flash")).toBe(false);
  });
});
