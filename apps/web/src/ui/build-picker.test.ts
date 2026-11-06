import fs from "node:fs";

import { defaultBuildEquipment } from "@vibewars/game-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CHARACTER_SCHEMA_VERSION, type StoredCharacter } from "../storage/schema.js";
import { mountBuildPicker, type BuildPicker, type BuildPickerHost } from "./build-picker.js";
import { FakeElement } from "./fake-dom.test-support.js";

const SEVER = "warrior.sever-artery";
const HEALING_BREEZE = "monk.healing-breeze";

/** A Warrior/Monk holding Healing Breeze in slot 1. */
function warrior(): StoredCharacter {
  return {
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    id: "w1",
    name: "Ser Bash",
    primaryProfession: "warrior",
    secondaryProfession: "monk",
    attributes: [],
    skillBar: [HEALING_BREEZE, null, null, null, null, null, null, null],
    equipment: defaultBuildEquipment("warrior"),
    updatedAt: 1,
  };
}

const fake = (element: HTMLElement): FakeElement => element as unknown as FakeElement;

describe("the build picker (#2565)", () => {
  let character: StoredCharacter;
  let selected: number | undefined;

  beforeEach(() => {
    vi.stubGlobal("Node", FakeElement);
    vi.stubGlobal("Element", FakeElement);
    vi.stubGlobal("HTMLElement", FakeElement);
    vi.stubGlobal("HTMLButtonElement", FakeElement);
    vi.stubGlobal("document", {
      createElement: () => new FakeElement(),
      createTextNode: (text: string) => Object.assign(new FakeElement(), { textContent: text }),
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      body: new FakeElement(),
    });
    vi.stubGlobal("window", {
      innerWidth: 1366,
      innerHeight: 768,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
    character = warrior();
    selected = undefined;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mount(extra: Partial<BuildPickerHost<StoredCharacter>> = {}): BuildPicker {
    const host: BuildPickerHost<StoredCharacter> = {
      current: () => character,
      commit: (next) => {
        character = next;
      },
      bars: () => [character],
      shown: () => 0,
      commitBars: ([next]) => {
        character = next ?? character;
      },
      selected: () => selected,
      select: (slot) => {
        selected = slot;
      },
      refresh: () => undefined,
      tooltip: {
        show: () => undefined,
        hide: () => undefined,
        update: () => undefined,
        dispose: () => undefined,
      },
      ...extra,
    };
    const picker = mountBuildPicker(new FakeElement() as unknown as HTMLElement, host);
    picker.update();
    return picker;
  }

  /** Open every library group, then press Equip on `skillId`'s card. */
  function equip(picker: BuildPicker, skillId: string): void {
    for (const header of fake(picker.element).all("skill-group-header")) {
      header.click();
    }
    fake(picker.element)
      .all("skill-box")
      .find((box) => box.dataset.skillId === skillId)
      ?.all("skill-box-equip")[0]
      ?.click();
  }

  /** The tab buttons' labels, and which is open. */
  function tabs(picker: BuildPicker): { labels: string[]; open: string | undefined } {
    const buttons = fake(picker.element).all("library-tab");
    return {
      labels: buttons.map((tab) => tab.textContent),
      open: buttons.find((tab) => tab.getAttribute("aria-selected") === "true")?.textContent,
    };
  }

  it("equips to the picked slot, and lets the pick go", () => {
    selected = 5;
    equip(mount(), SEVER);
    expect(character.skillBar[5]).toBe(SEVER);
    expect(selected).toBeUndefined();
  });

  it("equips to the first empty slot with none picked", () => {
    equip(mount(), SEVER);
    expect(character.skillBar.slice(0, 3)).toEqual([HEALING_BREEZE, SEVER, null]);
  });

  it("puts the screen's own tabs before Skills and Gear, and opens the one asked for", () => {
    const characters = new FakeElement() as unknown as HTMLElement;
    const picker = mount({
      extraTabs: [{ id: "characters", label: "My characters", element: characters }],
      tab: "characters",
    });
    expect(tabs(picker)).toEqual({
      labels: ["My characters", "Skills", "Gear"],
      open: "My characters",
    });
    expect(fake(picker.element).contains(fake(characters))).toBe(true);
    expect(tabs(mount())).toEqual({ labels: ["Skills", "Gear"], open: "Skills" });
  });

  it("showLibrary opens the tab asked for, and says so to the screen", () => {
    const opened: string[] = [];
    const picker = mount({
      onTab: (tab) => {
        opened.push(tab);
      },
    });
    picker.showLibrary("gear", "weapons");
    expect(tabs(picker).open).toBe("Gear");
    expect(fake(picker.element).all("gear-box").length).toBeGreaterThan(0);
    expect(fake(picker.element).all("skill-search")).toHaveLength(0);
    picker.showLibrary("skills");
    expect(tabs(picker).open).toBe("Skills");
    expect(opened).toEqual(["gear", "skills"]);
  });

  it("toasts what new professions dropped, and Undo puts it back", () => {
    const picker = mount();
    const host = {
      current: () => character,
      commit: (next: StoredCharacter) => {
        character = next;
      },
    };
    picker.changeProfessions(host, "warrior", "ranger");
    expect(character.skillBar[0]).toBeNull();
    const shown = fake(document.body).all("toast")[0];
    expect(shown?.all("toast-text")[0]?.textContent).toBe("Removed: Healing Breeze from the bar");
    shown?.children.find((child) => child.textContent === "Undo")?.click();
    expect(character.secondaryProfession).toBe("monk");
    expect(character.skillBar[0]).toBe(HEALING_BREEZE);
  });
});

describe("one picker, no copies (#2565)", () => {
  it.each(["build-editor.ts", "team-editor.ts"])(
    "%s mounts the libraries only through the build picker",
    (file) => {
      const source = fs.readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
      expect(source).not.toMatch(/\bmount(Skill|Gear)Library\b/);
    },
  );
});
