import { defaultBuildEquipment, type WeaponSetIndex } from "@vibewars/game-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { t } from "../i18n/index.js";
import { CHARACTER_SCHEMA_VERSION, type StoredCharacter } from "../storage/schema.js";
import { setOffhand, setRequirementAttribute, setWeapon } from "./gear-editor.js";
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
  const hand = (which: string): FakeElement => hotspot(which);
  /** The popover's visible columns, by heading. */
  const columns = (): string[] =>
    popover()
      .all("paper-doll-popover-column")
      .filter((node) => !node.hidden)
      .map((node) => node.all("paper-doll-popover-heading")[0]?.textContent ?? "");
  const listOf = (name: string): FakeElement => {
    const found = popover()
      .all("paper-doll-list")
      .find((node) => node.getAttribute("aria-label") === name);
    if (found === undefined) {
      throw new Error(`no list ${name}`);
    }
    return found;
  };
  const names = (list: FakeElement): string[] =>
    list.all("paper-doll-choice-name").map((node) => node.textContent);
  const pills = (): FakeElement[] => popover().all("paper-doll-pill");

  it("has seven hotspots, numbered in order: the armor, then the hands", () => {
    expect(hotspots().map((node) => node.dataset.slot)).toEqual([
      "head",
      "chest",
      "hands",
      "legs",
      "feet",
      "mainHand",
      "offHand",
    ]);
    expect(hotspots().map((node) => node.all("paper-doll-hotspot-number")[0]?.textContent)).toEqual(
      ["1", "2", "3", "4", "5", "6", "7"],
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

  it("holds the shown set's weapons as ⑥ and ⑦, and follows the set tab (#2151)", () => {
    expect(hand("mainHand").title).toContain("Sword");
    expect(hand("offHand").title).toContain("Shield");
    expect(hand("offHand").hidden).toBe(false);
    expect(row("mainHand").text()).toContain("⑥ Sword·Swordsmanship·—·—·—");
    expect(row("offHand").text()).toContain("⑦ Shield");

    character = setWeapon(character, 1, "hammer");
    set = 1;
    doll.update(character);
    expect(hand("mainHand").title).toContain("Hammer");
    // Two hands on the hammer: no ⑦ at all.
    expect(hand("offHand").hidden).toBe(true);
    expect(row("offHand").hidden).toBe(true);

    // Bare hands: ⑥ is there, empty, and opens nothing.
    character = setOffhand(setWeapon(character, 1, "unarmed"), 1, null);
    doll.update(character);
    expect(hand("mainHand").title).toBe("Main hand: empty");
    expect(hand("mainHand").disabled).toBe(true);
    expect(row("mainHand").hidden).toBe(true);
  });

  describe("draws the held weapons in the figure's hands (#2154)", () => {
    /** The held drawings shown, by hand: their source, and whether mirrored. */
    const held = (): Record<string, string> =>
      Object.fromEntries(
        root()
          .all("paper-doll-held")
          .filter((img) => !img.hidden)
          .map((img) => [
            img.dataset.slot ?? "",
            img.src.replace(/^.*\/icons\//, "") +
              (img.classList.contains("is-mirrored") ? " mirrored" : ""),
          ]),
      );

    it("a sword and a shield, each in its hand", () => {
      expect(held()).toEqual({
        mainHand: "paper-doll/held/sword.svg",
        offHand: "paper-doll/held/shield.svg",
      });
    });

    it("daggers in both hands, the off one mirrored", () => {
      character = setWeapon(character, 0, "daggers");
      doll.update(character);
      expect(held()).toEqual({
        mainHand: "paper-doll/held/daggers.svg",
        offHand: "paper-doll/held/daggers.svg mirrored",
      });
    });

    it("a two-handed weapon alone, and nothing for bare hands", () => {
      character = setWeapon(character, 0, "staff");
      doll.update(character);
      expect(held()).toEqual({ mainHand: "paper-doll/held/staff.svg" });

      character = setOffhand(setWeapon(character, 0, "unarmed"), 0, null);
      doll.update(character);
      expect(held()).toEqual({});
    });

    it("sits under every hotspot and takes no click, so ⑥ still opens", () => {
      const stage = root().all("paper-doll-stage")[0];
      const order = stage?.children ?? [];
      const lastArt = Math.max(
        ...root()
          .all("paper-doll-held")
          .map((img) => order.indexOf(img)),
      );
      const firstHotspot = Math.min(...hotspots().map((spot) => order.indexOf(spot)));
      expect(lastArt).toBeLessThan(firstHotspot);
      for (const img of root().all("paper-doll-held")) {
        expect(img.listeners.size).toBe(0);
      }
      hand("mainHand").click();
      expect(hand("mainHand").getAttribute("aria-expanded")).toBe("true");
    });
  });

  it("opens ⑥ on the sword: Prefix, Suffix and Inscription, None first, and no pills", () => {
    hand("mainHand").click();
    expect(popover().hidden).toBe(false);
    expect(popover().all("paper-doll-popover-title")[0]?.textContent).toBe("⑥ Sword");
    expect(columns()).toEqual([
      t("paperDoll.modPrefix"),
      t("paperDoll.modSuffix"),
      t("paperDoll.modInscription"),
    ]);
    for (const slot of [
      t("paperDoll.modPrefix"),
      t("paperDoll.modSuffix"),
      t("paperDoll.modInscription"),
    ]) {
      expect(names(listOf(slot))[0]).toBe(t("paperDoll.none"));
    }
    expect(names(listOf(t("paperDoll.modSuffix")))).toContain("of Fortitude");
    // A sword is always Swordsmanship: nothing to pick.
    expect(popover().all("paper-doll-attribute")[0]?.hidden).toBe(true);
  });

  it("puts a picked mod on, highlighted, on the hotspot and the row, and keeps the popover open", () => {
    hand("mainHand").click();
    choice("of Fortitude").click();
    expect(character.equipment.weaponSets[0].mainHand.upgrades.suffix).toBe("of-fortitude");
    expect(popover().hidden).toBe(false);
    expect(choice("of Fortitude").classList.contains("is-chosen")).toBe(true);
    expect(
      hand("mainHand")
        .all("paper-doll-mod")
        .map((node) => node.title),
    ).toEqual(["of Fortitude"]);
    expect(row("mainHand").text()).toContain("of Fortitude");

    // None takes it off.
    const none = listOf(t("paperDoll.modSuffix")).all("paper-doll-choice")[0];
    none?.click();
    expect(character.equipment.weaponSets[0].mainHand.upgrades.suffix).toBeNull();
    expect(hand("mainHand").all("paper-doll-mod")).toHaveLength(0);
  });

  it("opens ⑦ on the shield: no prefix, its attribute as pills", () => {
    hand("offHand").click();
    expect(popover().all("paper-doll-popover-title")[0]?.textContent).toBe("⑦ Shield");
    expect(columns()).toEqual([t("paperDoll.modSuffix"), t("paperDoll.modInscription")]);
    expect(pills().map((pill) => pill.textContent)).toEqual(["Strength", "Tactics"]);
    const tactics = pills()[1];
    tactics?.click();
    expect(character.equipment.weaponSets[0].offHand?.requirementAttributeId).toBe(
      "warrior.tactics",
    );
    expect(tactics?.getAttribute("aria-checked")).toBe("true");
    expect(pills()[0]?.getAttribute("aria-checked")).toBe("false");
  });

  it("lists every attribute of the primary for a staff, the held one pressed", () => {
    character = setWeapon({ ...character, primaryProfession: "elementalist" }, 0, "staff");
    character = setRequirementAttribute(character, 0, "mainHand", "elementalist.fire-magic");
    doll.update(character);
    hand("mainHand").click();
    expect(pills().map((pill) => pill.textContent)).toContain("Fire Magic");
    expect(pills().map((pill) => pill.textContent)).toContain("Energy Storage");
    const pressed = pills().filter((pill) => pill.getAttribute("aria-checked") === "true");
    expect(pressed.map((pill) => pill.textContent)).toEqual(["Fire Magic"]);
    expect(names(listOf(t("paperDoll.modInscription")))).toContain('"Let the Memory Live Again"');
  });

  it("re-lists an open ⑥ for the new set's weapon, and closes when that hand is empty", () => {
    character = setWeapon(character, 1, "staff");
    hand("mainHand").click();
    expect(popover().all("paper-doll-popover-title")[0]?.textContent).toBe("⑥ Sword");
    set = 1;
    doll.update(character);
    expect(popover().hidden).toBe(false);
    expect(popover().all("paper-doll-popover-title")[0]?.textContent).toBe("⑥ Staff");
    expect(names(listOf(t("paperDoll.modPrefix")))).toContain("Insightful");

    set = 2;
    doll.update(character);
    expect(popover().hidden).toBe(true);
    expect(hand("mainHand").getAttribute("aria-expanded")).toBe("false");
  });

  it("closes ⑥ on Esc and gives the focus back to the hand", () => {
    hand("mainHand").click();
    popover().fire("keydown", "Escape");
    expect(popover().hidden).toBe(true);
    expect(focused.at(-1)).toBe(hand("mainHand"));
  });
});
