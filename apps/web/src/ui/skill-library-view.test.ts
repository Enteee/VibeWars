import { defaultBuildEquipment, type Skill } from "@vibewars/game-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { t } from "../i18n/index.js";
import { equippableSkills } from "../storage/build-validation.js";
import type { TeamCharacter } from "../storage/schema.js";
import type { SkillTooltip } from "./skill-tooltip.js";
import { mountSkillLibrary, type SkillLibraryBody } from "./skill-library-view.js";

type Listener = (event: FakeEvent) => void;

interface FakeEvent {
  readonly key: string | undefined;
  readonly target: FakeElement;
  preventDefault(): void;
  stopPropagation(): void;
}

/** The element focus is on, as `document.activeElement`. */
const focus: { current?: FakeElement } = {};

/** Just enough DOM for the skill library's filters (#2463); the unit tests run in Node. */
class FakeElement {
  className = "";
  textContent = "";
  type = "";
  value = "";
  hidden = false;
  disabled = false;
  draggable = false;
  open = false;
  parent: FakeElement | undefined;
  readonly children: FakeElement[] = [];
  readonly attributes = new Map<string, string>();
  readonly dataset: Record<string, string> = {};
  readonly listeners = new Map<string, Listener[]>();

  readonly classList = {
    add: (...names: string[]): void => {
      for (const name of names) {
        this.classList.toggle(name, true);
      }
    },
    toggle: (name: string, on: boolean): void => {
      const names = this.className.split(" ").filter((part) => part !== "" && part !== name);
      this.className = (on ? [...names, name] : names).join(" ");
    },
    contains: (name: string): boolean => this.className.split(" ").includes(name),
  };

  get childElementCount(): number {
    return this.children.length;
  }

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

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((there) => there !== listener),
    );
  }

  appendChild(child: FakeElement): FakeElement {
    child.remove();
    child.parent = this;
    this.children.push(child);
    return child;
  }

  append(...children: (FakeElement | string)[]): void {
    for (const child of children) {
      this.appendChild(
        typeof child === "string"
          ? Object.assign(new FakeElement(), { textContent: child })
          : child,
      );
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

  insertAdjacentHTML(): void {
    // Icons and badges are not under test.
  }

  remove(): void {
    if (this.parent !== undefined) {
      this.parent.children.splice(this.parent.children.indexOf(this), 1);
      this.parent = undefined;
    }
  }

  focus(): void {
    focus.current = this;
  }

  /** The first element under this one with class `.name`, or `button`. */
  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): FakeElement[] {
    return selector === "button"
      ? this.all((node) => node.type === "button")
      : this.all((node) => node.classList.contains(selector.replace(/^\./, "")));
  }

  all(match: (node: FakeElement) => boolean): FakeElement[] {
    return this.children.flatMap((child) => [
      ...(match(child) ? [child] : []),
      ...child.all(match),
    ]);
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

/** The page's own listeners: the popover's click outside. */
const page = new FakeElement();
/** The page's body, where a drag image waits off-screen (#2533). */
const body = new FakeElement();
/** Callbacks waiting for the next animation frame. */
const frames: (() => void)[] = [];

/** A Mesmer/Necromancer, whose lines have hexes and elites both. */
const character: TeamCharacter = {
  id: "c1",
  name: "Hexer",
  primaryProfession: "mesmer",
  secondaryProfession: "necromancer",
  attributes: [],
  skillBar: [null, null, null, null, null, null, null, null],
  equipment: defaultBuildEquipment("mesmer"),
};

const tooltip: SkillTooltip = {
  show: () => undefined,
  update: () => undefined,
  hide: () => undefined,
  dispose: () => undefined,
};

const fake = (element: HTMLElement): FakeElement => element as unknown as FakeElement;

describe("the skill library's Filters popover (#2463)", () => {
  let library: SkillLibraryBody;
  let root: FakeElement;
  const one = (className: string): FakeElement => {
    const found = root.querySelector(`.${className}`);
    if (found === null) {
      throw new Error(`no .${className}`);
    }
    return found;
  };
  const filterButton = (): FakeElement => one("skill-filter-button");
  const popover = (): FakeElement | undefined => root.querySelectorAll(".skill-filter-popover")[0];
  const chip = (label: string): FakeElement => {
    const found = root
      .querySelectorAll(".skill-type-chip")
      .find((node) => node.textContent === label);
    if (found === undefined) {
      throw new Error(`no chip ${label}`);
    }
    return found;
  };
  const tagTexts = (): string[] =>
    one("skill-filter-tags").children.map((node) => node.textContent);
  const listed = (): string[] =>
    root.querySelectorAll(".skill-box").map((node) => node.dataset.skillId ?? "");
  const ids = (skills: readonly Skill[]): string[] => skills.map((skill) => skill.id).sort();

  beforeEach(() => {
    delete focus.current;
    body.replaceChildren();
    frames.length = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: () => void) => frames.push(callback));
    vi.stubGlobal("Node", FakeElement);
    vi.stubGlobal("HTMLElement", FakeElement);
    vi.stubGlobal("HTMLButtonElement", FakeElement);
    vi.stubGlobal("document", {
      createElement: () => new FakeElement(),
      body,
      addEventListener: (type: string, listener: Listener) => {
        page.addEventListener(type, listener);
      },
      removeEventListener: (type: string, listener: Listener) => {
        page.removeEventListener(type, listener);
      },
    });
    library = mountSkillLibrary({
      current: () => character,
      tooltip,
      showTip: () => undefined,
      selected: () => undefined,
      equipTo: () => undefined,
      slotLabel: (slot) => String(slot + 1),
    });
    root = new FakeElement();
    root.append(...library.elements.map(fake));
    library.update(character);
  });

  afterEach(() => {
    library.dispose();
    vi.unstubAllGlobals();
  });

  it("opens from the Filters button, Done closes it, and focus goes back to the button", () => {
    expect(filterButton().textContent).toBe(t("skillLibrary.filters"));
    expect(tagTexts()).toEqual([]);
    filterButton().click();
    expect(popover()).toBeDefined();
    expect(filterButton().getAttribute("aria-expanded")).toBe("true");
    expect(focus.current).toBe(popover()?.querySelector("button"));
    one("skill-filter-done").click();
    expect(popover()).toBeUndefined();
    expect(focus.current).toBe(filterButton());
  });

  it("shuts on Esc and on a click outside, but not on a chip", () => {
    filterButton().click();
    chip("hex").click();
    expect(popover()).toBeDefined();
    popover()?.fire("keydown", "Escape");
    expect(popover()).toBeUndefined();
    expect(focus.current).toBe(filterButton());
    filterButton().click();
    page.fire("pointerdown");
    expect(popover()).toBeUndefined();
  });

  it("counts hex and Elite as 2, tags each, and lists only elite hexes", () => {
    filterButton().click();
    chip("hex").click();
    chip(t("skillLibrary.eliteOnly")).click();
    expect(filterButton().textContent).toBe("Filters · 2");
    expect(filterButton().getAttribute("aria-label")).toBe("Filters, 2 active");
    expect(tagTexts()).toEqual(["hex ×", "elite ×", "clear ×"]);
    const eliteHexes = equippableSkills(character).filter(
      (skill) => skill.elite && skill.type === "hex",
    );
    expect(eliteHexes.length).toBeGreaterThan(0);
    expect(listed().sort()).toEqual(ids(eliteHexes));
  });

  it("Elite on its own lists only elite skills", () => {
    filterButton().click();
    chip(t("skillLibrary.eliteOnly")).click();
    expect(chip(t("skillLibrary.eliteOnly")).getAttribute("aria-pressed")).toBe("true");
    expect(tagTexts()).toEqual(["elite ×"]);
    expect(listed().sort()).toEqual(ids(equippableSkills(character).filter((s) => s.elite)));
  });

  it("a tag's × turns its filter off, and focus moves to the next tag, then the button", () => {
    filterButton().click();
    chip("hex").click();
    chip(t("skillLibrary.eliteOnly")).click();
    one("skill-filter-done").click();
    const [hexTag] = one("skill-filter-tags").children;
    hexTag?.click();
    expect(tagTexts()).toEqual(["elite ×"]);
    expect(filterButton().textContent).toBe("Filters · 1");
    expect(focus.current).toBe(one("skill-filter-tags").children[0]);
    expect(listed().sort()).toEqual(ids(equippableSkills(character).filter((s) => s.elite)));
    one("skill-filter-tags").children[0]?.click();
    expect(tagTexts()).toEqual([]);
    expect(focus.current).toBe(filterButton());
    filterButton().click();
    expect(chip("hex").getAttribute("aria-pressed")).toBe("false");
    expect(chip(t("skillLibrary.eliteOnly")).getAttribute("aria-pressed")).toBe("false");
  });

  it("a tag's × moves focus back to the tag left before it, never to clear", () => {
    filterButton().click();
    chip("hex").click();
    chip(t("skillLibrary.eliteOnly")).click();
    one("skill-filter-done").click();
    expect(tagTexts()).toEqual(["hex ×", "elite ×", "clear ×"]);
    one("skill-filter-tags").children[1]?.click();
    expect(tagTexts()).toEqual(["hex ×"]);
    expect(focus.current).toBe(one("skill-filter-tags").children[0]);
  });

  it("clear turns every filter off", () => {
    filterButton().click();
    chip("hex").click();
    chip("enchantment").click();
    chip(t("skillLibrary.eliteOnly")).click();
    one("skill-filter-done").click();
    one("skill-filter-tags").children.at(-1)?.click();
    expect(tagTexts()).toEqual([]);
    expect(filterButton().textContent).toBe(t("skillLibrary.filters"));
    expect(focus.current).toBe(filterButton());
    filterButton().click();
    for (const label of ["hex", "enchantment", t("skillLibrary.eliteOnly")]) {
      expect(chip(label).getAttribute("aria-pressed")).toBe("false");
    }
  });

  it("offers no Not in the game yet chip: every corpus skill plays (#2518)", () => {
    filterButton().click();
    expect(chip(t("skillLibrary.eliteOnly"))).toBeDefined();
    expect(() => chip("Not in the game yet")).toThrow("no chip");
  });

  it("a re-render while open keeps the popover open", () => {
    filterButton().click();
    chip("hex").click();
    library.update(character);
    expect(popover()).toBeDefined();
  });

  it("drags a skill's 32 px icon alone, at the pointer, and leaves nothing behind (#2533)", () => {
    filterButton().click();
    chip(t("skillLibrary.eliteOnly")).click();
    const box = root.querySelectorAll(".skill-box")[0];
    const skillId = box?.dataset.skillId ?? "";
    expect(skillId).not.toBe("");
    const data: string[] = [];
    const images: [FakeElement, number, number][] = [];
    const dataTransfer = {
      setData: (_type: string, value: string) => data.push(value),
      setDragImage: (image: FakeElement, x: number, y: number) => images.push([image, x, y]),
    };
    for (const listener of box?.listeners.get("dragstart") ?? []) {
      listener({ dataTransfer } as unknown as FakeEvent);
    }
    expect(data).toEqual([`library:${skillId}`]);
    expect(images).toHaveLength(1);
    const [icon, x, y] = images[0] ?? [];
    expect([x, y]).toEqual([0, 0]);
    expect(icon).toEqual(
      expect.objectContaining({
        width: 32,
        height: 32,
        src: expect.stringContaining(skillId) as unknown,
        className: "skill-icon skill-drag-image",
      }),
    );
    expect(icon?.attributes.has("loading")).toBe(false);
    expect(body.children).toEqual([icon]);
    for (const frame of frames) {
      frame();
    }
    expect(body.children).toEqual([]);
  });

  it("starts a drag with no data transfer without throwing (#2533)", () => {
    filterButton().click();
    chip(t("skillLibrary.eliteOnly")).click();
    const box = root.querySelectorAll(".skill-box")[0];
    expect(() => {
      for (const listener of box?.listeners.get("dragstart") ?? []) {
        listener({} as unknown as FakeEvent);
      }
    }).not.toThrow();
    expect(body.children).toEqual([]);
  });
});
