import type { WireWeaponSets } from "@vibewars/game-protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWeaponSets } from "./weapon-set-slots.js";

/**
 * The weapon-set slots repaint every frame (#1352): a frame that changes
 * nothing must write nothing, since every DOM write costs a style pass.
 * The unit tests run in Node, so a slot here is a fake that logs writes.
 */

/** `target`, every property write it takes logged in `writes` as `<name>.<key>`. */
function recorded<T extends object>(target: T, name: string, writes: string[]): T {
  return new Proxy(target, {
    set(object, key, value) {
      writes.push(`${name}.${String(key)}`);
      return Reflect.set(object, key, value);
    },
  });
}

/** A slot, as an empty one is built; a class toggle that changes nothing is no write. */
function fakeSlot(index: number, writes: string[]) {
  const name = `slot${String(index)}`;
  const classes = new Set(["is-empty"]);
  const attributes = new Map<string, string>();
  return recorded(
    {
      disabled: true,
      title: "",
      dataset: recorded<Record<string, string>>({}, `${name}.dataset`, writes),
      classList: {
        toggle: (token: string, on: boolean): void => {
          if (classes.has(token) !== on) {
            writes.push(`${name}.class.${token}`);
            if (on) classes.add(token);
            else classes.delete(token);
          }
        },
      },
      setAttribute: (key: string, value: string): void => {
        writes.push(`${name}.@${key}`);
        attributes.set(key, value);
      },
      getAttribute: (key: string): string | null => attributes.get(key) ?? null,
      querySelector: () => ({
        replaceChildren: (): void => {
          writes.push(`${name}.icons`);
        },
      }),
    },
    name,
    writes,
  );
}

describe("renderWeaponSets (#1352)", () => {
  let writes: string[];
  let root: HTMLElement;

  beforeEach(() => {
    writes = [];
    const slots = [0, 1, 2, 3].map((index) => fakeSlot(index, writes));
    root = { querySelectorAll: () => slots } as unknown as HTMLElement;
    vi.stubGlobal("document", {
      createElement: () => ({ className: "", src: "", alt: "" }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const wand: WireWeaponSets = {
    sets: [{ weaponId: "wand", offhandId: "focus" }, null, null, null],
    active: 0,
    pending: null,
  };

  it("writes nothing on a second paint of the same sets", () => {
    renderWeaponSets(root, wand);
    writes.length = 0;
    renderWeaponSets(root, wand);
    expect(writes).toEqual([]);
  });

  it("writes only what changed: a slot filled", () => {
    renderWeaponSets(root, undefined);
    writes.length = 0;
    renderWeaponSets(root, undefined);
    expect(writes).toEqual([]);
    renderWeaponSets(root, wand);
    expect(writes.filter((write) => !write.startsWith("slot0."))).toEqual([]);
    expect(writes).toContain("slot0.disabled");
  });
});
