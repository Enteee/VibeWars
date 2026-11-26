import { ALL_WEAPONS } from "@vibewars/game-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StoredCharacter } from "../storage/schema.js";
import { newCharacter, setProfessions } from "./build-editor.js";
import { mountGearLibrary } from "./gear-library-view.js";

interface FakeKey {
  readonly key: string;
  readonly target: unknown;
  readonly preventDefault: () => void;
}

/** Just enough of an element for the gear library to build into, without jsdom. */
class FakeElement {
  className = "";
  textContent = "";
  draggable = false;
  tabIndex = -1;
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  readonly listeners = new Map<string, (event: FakeKey) => void>();
  readonly classList = { toggle: (): void => undefined };

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  addEventListener(type: string, listener: (event: FakeKey) => void): void {
    this.listeners.set(type, listener);
  }

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }
}

describe("the gear library's boxes (#4090)", () => {
  beforeEach(() => {
    vi.stubGlobal("document", {
      createElement: () => new FakeElement(),
      createTextNode: () => new FakeElement(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("are buttons the keyboard reaches, and Enter or Space on one equips it, as a click does", () => {
    let character: StoredCharacter = setProfessions(newCharacter("c1"), "warrior", undefined);
    const library = mountGearLibrary({
      current: () => character,
      commit: (next) => {
        character = next;
      },
      weaponSet: () => 0,
    });
    const [host] = library.elements as unknown as FakeElement[];
    const weapons = host?.children.find((group) => group.dataset.group === "weapons");
    const boxes = weapons?.children.filter((child) => child.className.includes("gear-box")) ?? [];
    expect(boxes).toHaveLength(ALL_WEAPONS.length);
    const [held, other] = ALL_WEAPONS.filter(
      ({ id }) => id !== character.equipment.weaponSets[0].mainHand.weaponId,
    );
    const boxOf = (id: string | undefined): FakeElement | undefined =>
      boxes[ALL_WEAPONS.findIndex((weapon) => weapon.id === id)];
    const press = (box: FakeElement | undefined, key: string): void => {
      box?.listeners.get("keydown")?.({ key, target: box, preventDefault: () => undefined });
    };
    const box = boxOf(held?.id);
    expect([box?.attributes.get("role"), box?.tabIndex]).toEqual(["button", 0]);
    press(box, "a");
    expect(character.equipment.weaponSets[0].mainHand.weaponId).not.toBe(held?.id);
    press(box, "Enter");
    expect(character.equipment.weaponSets[0].mainHand.weaponId).toBe(held?.id);
    press(boxOf(other?.id), " ");
    expect(character.equipment.weaponSets[0].mainHand.weaponId).toBe(other?.id);
  });
});
