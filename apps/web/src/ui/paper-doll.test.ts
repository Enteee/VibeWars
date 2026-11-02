import { defaultBuildEquipment, type WeaponSetIndex } from "@vibewars/game-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CHARACTER_SCHEMA_VERSION, type StoredCharacter } from "../storage/schema.js";
import { setOffhand, setWeapon } from "./gear-editor.js";
import { mountPaperDoll, type PaperDoll } from "./paper-doll.js";

type Listener = (event: FakeEvent) => void;

interface FakeEvent {
  readonly key: string | undefined;
  readonly target: FakeElement;
  preventDefault(): void;
  stopPropagation(): void;
}

/** The listeners on `document`, by type. */
const documentListeners = new Map<string, Listener[]>();

/** Every element focused, the last one last. */
const focused: FakeElement[] = [];

/** Just enough DOM for the paper-doll; the unit tests run in Node. */
class FakeElement {
  className = "";
  textContent = "";
  title = "";
  src = "";
  alt = "";
  type = "";
  hidden = false;
  disabled = false;
  parent: FakeElement | undefined;
  readonly children: FakeElement[] = [];
  readonly attributes = new Map<string, string>();
  readonly dataset: Record<string, string> = {};
  readonly listeners = new Map<string, Listener[]>();
  readonly style = {
    left: "",
    top: "",
    setProperty: (): void => undefined,
  };

  readonly classList = {
    toggle: (name: string, on: boolean): void => {
      const names = this.className.split(" ").filter((part) => part !== "" && part !== name);
      this.className = (on ? [...names, name] : names).join(" ");
    },
    remove: (name: string): void => {
      this.classList.toggle(name, false);
    },
    contains: (name: string): boolean => this.className.split(" ").includes(name),
  };

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  contains(other: FakeElement): boolean {
    for (let node: FakeElement | undefined = other; node !== undefined; node = node.parent) {
      if (node === this) {
        return true;
      }
    }
    return false;
  }

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  get lastElementChild(): FakeElement | null {
    return this.children.at(-1) ?? null;
  }

  appendChild(child: FakeElement): FakeElement {
    child.remove();
    child.parent = this;
    this.children.push(child);
    return child;
  }

  append(...children: FakeElement[]): void {
    for (const child of children) {
      this.appendChild(child);
    }
  }

  replaceChildren(...children: FakeElement[]): void {
    for (const child of [...this.children]) {
      child.remove();
    }
    this.append(...children);
  }

  insertBefore(node: FakeElement, before: FakeElement | null): void {
    node.remove();
    node.parent = this;
    const index = before === null ? -1 : this.children.indexOf(before);
    this.children.splice(index === -1 ? this.children.length : index, 0, node);
  }

  remove(): void {
    if (this.parent !== undefined) {
      this.parent.children.splice(this.parent.children.indexOf(this), 1);
      this.parent = undefined;
    }
  }

  focus(): void {
    focused.push(this);
  }

  getBoundingClientRect(): {
    left: number;
    right: number;
    top: number;
    width: number;
    height: number;
  } {
    return { left: 0, right: 0, top: 0, width: 0, height: 0 };
  }

  /** The first element under this one with class `name`, as `querySelector(".name")`. */
  querySelector(selector: string): FakeElement | null {
    return this.all(selector.replace(/^\./, ""))[0] ?? null;
  }

  /** Every element under this one with class `name`, in document order. */
  all(name: string): FakeElement[] {
    return this.children.flatMap((child) => [
      ...(child.classList.contains(name) ? [child] : []),
      ...child.all(name),
    ]);
  }

  /** All the text under this one, as a reader would get it. */
  text(): string {
    return this.textContent + this.children.map((child) => child.text()).join("");
  }

  fire(type: string, key?: string): void {
    const event: FakeEvent = {
      key,
      target: this,
      preventDefault: () => undefined,
      stopPropagation: () => undefined,
    };
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  click(): void {
    this.fire("click");
  }
}

function warrior(): StoredCharacter {
  return {
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    id: "a",
    name: "Ser Bash",
    primaryProfession: "warrior",
    secondaryProfession: "monk",
    attributes: [],
    skillBar: [null, null, null, null, null, null, null, null],
    equipment: defaultBuildEquipment("warrior"),
    updatedAt: 1,
  };
}

const fake = (element: HTMLElement): FakeElement => element as unknown as FakeElement;

describe("the armor paper-doll (#2059)", () => {
  let character: StoredCharacter;
  let set: WeaponSetIndex;
  let doll: PaperDoll;

  beforeEach(() => {
    focused.length = 0;
    documentListeners.clear();
    vi.stubGlobal("Node", FakeElement);
    vi.stubGlobal("document", {
      createElement: () => new FakeElement(),
      addEventListener: (type: string, listener: Listener) => {
        documentListeners.set(type, [...(documentListeners.get(type) ?? []), listener]);
      },
      removeEventListener: (type: string, listener: Listener) => {
        documentListeners.set(
          type,
          (documentListeners.get(type) ?? []).filter((each) => each !== listener),
        );
      },
    });
    vi.stubGlobal("window", {
      innerWidth: 1366,
      innerHeight: 768,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    character = warrior();
    set = 0;
    doll = mountPaperDoll({
      current: () => character,
      commit: (next) => {
        character = next;
        doll.update(character);
      },
      weaponSet: () => set,
    });
    doll.update(character);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const root = (): FakeElement => fake(doll.element);
  const hotspots = (): FakeElement[] => root().all("paper-doll-hotspot");
  const hotspot = (slot: string): FakeElement => {
    const found = hotspots().find((node) => node.dataset.slot === slot);
    if (found === undefined) {
      throw new Error(`no hotspot ${slot}`);
    }
    return found;
  };
  const popover = (): FakeElement => root().all("paper-doll-popover")[0] ?? new FakeElement();
  const choice = (name: string): FakeElement => {
    const found = popover()
      .all("paper-doll-choice")
      .find((node) => node.all("paper-doll-choice-name")[0]?.textContent === name);
    if (found === undefined) {
      throw new Error(`no choice ${name}`);
    }
    return found;
  };
  const row = (slot: string): FakeElement => {
    const found = root()
      .all("paper-doll-row")
      .find((node) => node.dataset.slot === slot);
    if (found === undefined) {
      throw new Error(`no row ${slot}`);
    }
    return found;
  };
  const hand = (which: string): FakeElement => {
    const found = root()
      .all("paper-doll-hand")
      .find((node) => node.dataset.hand === which);
    if (found === undefined) {
      throw new Error(`no hand ${which}`);
    }
    return found;
  };

  it("has five hotspots, numbered in order", () => {
    expect(hotspots().map((node) => node.dataset.slot)).toEqual([
      "head",
      "chest",
      "hands",
      "legs",
      "feet",
    ]);
    expect(hotspots().map((node) => node.all("paper-doll-hotspot-number")[0]?.textContent)).toEqual(
      ["1", "2", "3", "4", "5"],
    );
  });

  it("closes on a press outside, not inside, and stops listening once closed", () => {
    const press = (target: FakeElement): void => {
      const event = {
        key: undefined,
        target,
        preventDefault: () => undefined,
        stopPropagation: () => undefined,
      };
      for (const listener of documentListeners.get("pointerdown") ?? []) {
        listener(event);
      }
    };
    hotspot("chest").click();
    press(choice("Survivor Insignia"));
    expect(popover().hidden).toBe(false);
    press(new FakeElement());
    expect(popover().hidden).toBe(true);
    expect(hotspot("chest").getAttribute("aria-expanded")).toBe("false");
    expect(documentListeners.get("pointerdown")).toEqual([]);
    expect(documentListeners.get("scroll")).toEqual([]);
  });

  it("opens a piece's popover on its hotspot, titled for it", () => {
    expect(popover().hidden).toBe(true);
    hotspot("chest").click();
    expect(popover().hidden).toBe(false);
    expect(popover().all("paper-doll-popover-title")[0]?.textContent).toBe("② Chest");
    expect(hotspot("chest").getAttribute("aria-expanded")).toBe("true");
  });

  it("shows a picked insignia on its hotspot and its row, and keeps the popover open", () => {
    hotspot("chest").click();
    choice("Blessed Insignia").click();
    expect(character.equipment.armor.chest.insigniaId).toBe("blessed");
    expect(popover().hidden).toBe(false);
    expect(choice("Blessed Insignia").classList.contains("is-chosen")).toBe(true);
    const icons = hotspot("chest").all("gear-icon");
    expect(icons.map((icon) => icon.alt)).toEqual(["Blessed Insignia"]);
    expect(row("chest").text()).toContain("Blessed Insignia");
    expect(row("legs").text()).not.toContain("Blessed");
  });

  it("applies the shown insignia to all five, and not None", () => {
    hotspot("legs").click();
    const applyAll = popover().all("paper-doll-apply-all")[0];
    expect(applyAll?.disabled).toBe(true);
    choice("Survivor Insignia").click();
    expect(applyAll?.disabled).toBe(false);
    applyAll?.click();
    for (const piece of Object.values(character.equipment.armor)) {
      expect(piece.insigniaId).toBe("survivor");
    }
  });

  it("closes on Esc and gives the focus back to the hotspot", () => {
    hotspot("chest").click();
    popover().fire("keydown", "Escape");
    expect(popover().hidden).toBe(true);
    expect(focused.at(-1)).toBe(hotspot("chest"));
  });

  it("closes on the same hotspot clicked again", () => {
    hotspot("hands").click();
    hotspot("hands").click();
    expect(popover().hidden).toBe(true);
  });

  it("holds the shown set's weapons, and follows the set tab", () => {
    expect(hand("mainHand").all("gear-icon")[0]?.alt).toBe("Sword");
    expect(hand("offHand").all("gear-icon")[0]?.alt).toBe("Shield");

    character = setWeapon(character, 1, "hammer");
    set = 1;
    doll.update(character);
    expect(hand("mainHand").all("gear-icon")[0]?.alt).toBe("Hammer");
    // Two hands on the hammer: nothing in the other.
    expect(hand("offHand").children).toHaveLength(0);

    character = setOffhand(setWeapon(character, 1, "unarmed"), 1, null);
    doll.update(character);
    expect(hand("mainHand").children).toHaveLength(0);
  });
});
