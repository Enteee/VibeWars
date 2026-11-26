import type { WireWeaponSets } from "@vibewars/game-protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWeaponSets } from "./weapon-set-slots.js";

/**
 * The weapon-set slots from the render loop (#489, #1352). The unit tests
 * run in Node, so a slot is a small fake that logs every write the paint
 * makes to it, as a MutationObserver would.
 */

class FakeSlot {
  disabled = true;
  title = "";
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly icons = { replaceChildren: (): void => undefined };

  readonly writes: string[];

  constructor(writes: string[]) {
    this.writes = writes;
  }

  readonly classes = new Set(["weapon-set", "is-empty"]);
  readonly classList = {
    toggle: (name: string, on: boolean): void => {
      // As the DOM's: a class that keeps its state is no change.
      if (this.classes.has(name) !== on) {
        this.writes.push(`class ${name}`);
        if (on) {
          this.classes.add(name);
        } else {
          this.classes.delete(name);
        }
      }
    },
  };

  setAttribute(name: string, value: string): void {
    this.writes.push(name);
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  querySelector(): FakeSlot["icons"] {
    return this.icons;
  }
}

/** Four fake slots, every property write on them logged in `writes`. */
function slots(writes: string[]): FakeSlot[] {
  return [0, 1, 2, 3].map(
    () =>
      new Proxy(new FakeSlot(writes), {
        set(target, property, value: unknown) {
          writes.push(String(property));
          return Reflect.set(target, property, value);
        },
      }),
  );
}

const SETS: WireWeaponSets = {
  sets: [{ weaponId: "sword", offhandId: null }, null, null, null],
  active: 0,
  pending: null,
};

describe("renderWeaponSets (#1352)", () => {
  let writes: string[];
  let root: HTMLElement;
  let all: FakeSlot[];

  beforeEach(() => {
    writes = [];
    all = slots(writes);
    root = { querySelectorAll: () => all } as unknown as HTMLElement;
    vi.stubGlobal("document", { createElement: () => ({}) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("writes nothing when painted again with the same sets", () => {
    renderWeaponSets(root, SETS);
    expect(all.map((slot) => slot.disabled)).toEqual([false, true, true, true]);
    writes.length = 0;
    renderWeaponSets(root, SETS);
    expect(writes).toEqual([]);
  });

  it("writes only what a change changes, the same paint", () => {
    renderWeaponSets(root, SETS);
    writes.length = 0;
    renderWeaponSets(root, { ...SETS, pending: 0 });
    expect(writes).toEqual(["class is-queued"]);
  });
});
