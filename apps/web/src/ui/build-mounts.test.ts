import { defaultBuildEquipment, type ProfessionId, type WeaponSetIndex } from "@vibewars/game-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CHARACTER_SCHEMA_VERSION, type StoredCharacter } from "../storage/schema.js";
import {
  mountAttributes,
  mountGear,
  mountGearLibrary,
  mountProfessions,
  setProfessions,
  type GearHost,
} from "./build-editor.js";
import { mountPaperDoll } from "./paper-doll.js";
import type { SkillTooltip } from "./skill-tooltip.js";

type Listener = (event: FakeEvent) => void;

interface FakeEvent {
  readonly key: string | undefined;
  readonly target: FakeElement;
  preventDefault(): void;
  stopPropagation(): void;
}

/** Just enough DOM for the Character Builder's parts (#2226); the unit tests run in Node. */
class FakeElement {
  className = "";
  textContent = "";
  title = "";
  src = "";
  alt = "";
  type = "";
  value = "";
  hidden = false;
  disabled = false;
  draggable = false;
  tabIndex = -1;
  parent: FakeElement | undefined;
  readonly children: FakeElement[] = [];
  readonly attributes = new Map<string, string>();
  readonly dataset: Record<string, string> = {};
  readonly listeners = new Map<string, Listener[]>();
  readonly style = {
    left: "",
    top: "",
    width: "",
    background: "",
    setProperty: (): void => undefined,
  };

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
    remove: (...names: string[]): void => {
      for (const name of names) {
        this.classList.toggle(name, false);
      }
    },
    contains: (name: string): boolean => this.className.split(" ").includes(name),
  };

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
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

  removeEventListener(): void {
    // Nothing here is torn down.
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

  append(...children: (FakeElement | string)[]): void {
    for (const child of children) {
      if (typeof child === "string") {
        const text = new FakeElement();
        text.textContent = child;
        this.appendChild(text);
      } else {
        this.appendChild(child);
      }
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

  after(node: FakeElement): void {
    this.parent?.insertBefore(
      node,
      this.parent.children[this.parent.children.indexOf(this) + 1] ?? null,
    );
  }

  remove(): void {
    if (this.parent !== undefined) {
      this.parent.children.splice(this.parent.children.indexOf(this), 1);
      this.parent = undefined;
    }
  }

  focus(): void {
    // Focus is not under test.
  }

  getBoundingClientRect(): {
    left: number;
    right: number;
    top: number;
    bottom: number;
    width: number;
    height: number;
  } {
    return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 };
  }

  /** The first element under this one with class `name`, as `querySelector(".name")`. */
  querySelector(selector: string): FakeElement | null {
    return this.all(selector.replace(/^\./, ""))[0] ?? null;
  }

  querySelectorAll(selector: string): FakeElement[] {
    return this.all(selector.replace(/^\./, ""));
  }

  /** Every element under this one with class `name`, in document order. */
  all(name: string): FakeElement[] {
    return this.children.flatMap((child) => [
      ...(child.classList.contains(name) ? [child] : []),
      ...child.all(name),
    ]);
  }

  fire(type: string): void {
    const event: FakeEvent = {
      key: undefined,
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

/** A Warrior/Monk with a Monk skill on the bar, the build a team member holds. */
function member(): StoredCharacter {
  return {
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    id: "m1",
    name: "Ser Bash",
    primaryProfession: "warrior",
    secondaryProfession: "monk",
    attributes: [],
    skillBar: ["monk.healing-breeze", null, null, null, null, null, null, null],
    equipment: defaultBuildEquipment("warrior"),
    updatedAt: 1,
  };
}

const fake = (element: HTMLElement): FakeElement => element as unknown as FakeElement;
const panel = (): HTMLElement => new FakeElement() as unknown as HTMLElement;

describe("the Character Builder's parts, on any screen that hosts a build (#2226)", () => {
  let character: StoredCharacter;
  let set: WeaponSetIndex;
  let commits: StoredCharacter[];
  let host: GearHost & {
    readonly changeProfessions: (
      primary: ProfessionId,
      secondary: ProfessionId | undefined,
    ) => void;
  };

  beforeEach(() => {
    vi.stubGlobal("Node", FakeElement);
    vi.stubGlobal("document", {
      createElement: () => new FakeElement(),
      createTextNode: (text: string) => Object.assign(new FakeElement(), { textContent: text }),
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    vi.stubGlobal("window", {
      innerWidth: 1366,
      innerHeight: 768,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    character = member();
    set = 0;
    commits = [];
    const tooltip: SkillTooltip = {
      show: () => undefined,
      hide: () => undefined,
      dispose: () => undefined,
    } as unknown as SkillTooltip;
    host = {
      current: () => character,
      commit: (next) => {
        commits.push(next);
        character = next;
      },
      changeProfessions: (primary, secondary) => {
        host.commit(setProfessions(character, primary, secondary));
      },
      tooltip,
      weaponSet: () => set,
      selectWeaponSet: (next) => {
        set = next;
      },
      showLibrary: () => undefined,
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("a pip clicked sets the rank, through the host", () => {
    const root = panel();
    mountAttributes(root, host).update(character);
    const healing = fake(root)
      .all("editor-attribute")
      .find((row) => row.getAttribute("aria-label") === "Healing Prayers");
    healing?.all("attribute-pip")[2]?.click();
    expect(commits).toHaveLength(1);
    expect(character.attributes).toEqual([{ attributeId: "monk.healing-prayers", rank: 3 }]);
  });

  it("a new secondary drops the skills it cannot use", () => {
    const professions = mountProfessions(host);
    professions.update(character);
    fake(professions.element)
      .all("editor-profession")
      .find((opener) => opener.dataset.which === "secondary")
      ?.click();
    const ranger = fake(professions.element)
      .all("profession-cell")
      .filter((cell) => cell.dataset.profession === "ranger")
      .at(-1);
    ranger?.click();
    expect(character.primaryProfession).toBe("warrior");
    expect(character.secondaryProfession).toBe("ranger");
    expect(character.skillBar[0]).toBeNull();
  });

  it("the gear library equips the shown set, and the gear clears its off-hand", () => {
    const library = mountGearLibrary(host);
    library.update(character);
    const longbow = library.elements
      .flatMap((element) => fake(element).all("gear-box"))
      .find((box) =>
        box.all("skill-box-name")[0]?.children.some((n) => n.textContent === "Longbow"),
      );
    longbow?.click();
    expect(character.equipment.weaponSets[0].mainHand.weaponId).toBe("longbow");

    character = member();
    const root = panel();
    const gear = mountGear(root, host, mountPaperDoll(host));
    gear.update(character);
    expect(character.equipment.weaponSets[0].offHand).not.toBeNull();
    fake(root)
      .all("gear-slot")
      .find((slot) => slot.dataset.cause?.endsWith(".offHand") === true)
      ?.all("gear-slot-clear")[0]
      ?.click();
    expect(character.equipment.weaponSets[0].offHand).toBeNull();
  });
});
