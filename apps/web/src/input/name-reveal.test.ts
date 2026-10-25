import { describe, expect, it, vi } from "vitest";

import { DEFAULT_KEYMAP } from "./keymap.js";
import { attachNameReveal } from "./name-reveal.js";

function page(): {
  readonly keys: EventTarget;
  readonly window: EventTarget;
  readonly document: EventTarget & { visibilityState: string };
} {
  return {
    keys: new EventTarget(),
    window: new EventTarget(),
    document: Object.assign(new EventTarget(), { visibilityState: "visible" }),
  };
}

function key(
  type: "keydown" | "keyup",
  code: string,
  modifiers: { ctrlKey?: boolean } = {},
): Event {
  return Object.assign(new Event(type, { cancelable: true }), {
    code,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    ...modifiers,
  });
}

describe("attachNameReveal (#253, #302)", () => {
  it("is held from Shift's keydown to its keyup", () => {
    const { keys, ...rest } = page();
    const reveal = attachNameReveal(keys, DEFAULT_KEYMAP, rest);
    expect(reveal.held()).toBe(false);
    keys.dispatchEvent(key("keydown", "ShiftLeft"));
    expect(reveal.held()).toBe(true);
    keys.dispatchEvent(key("keyup", "ShiftLeft"));
    expect(reveal.held()).toBe(false);
  });

  it("stays held while either Shift is down", () => {
    const { keys, ...rest } = page();
    const reveal = attachNameReveal(keys, DEFAULT_KEYMAP, rest);
    keys.dispatchEvent(key("keydown", "ShiftLeft"));
    keys.dispatchEvent(key("keydown", "ShiftRight"));
    keys.dispatchEvent(key("keyup", "ShiftLeft"));
    expect(reveal.held()).toBe(true);
    keys.dispatchEvent(key("keyup", "ShiftRight"));
    expect(reveal.held()).toBe(false);
  });

  it("lets go when its own target loses focus, as the stage does to the editor", () => {
    const { keys, ...rest } = page();
    const reveal = attachNameReveal(keys, DEFAULT_KEYMAP, rest);
    keys.dispatchEvent(key("keydown", "ShiftLeft"));
    keys.dispatchEvent(new Event("blur"));
    expect(reveal.held()).toBe(false);
  });

  it("lets go when the page loses focus, or turns hidden", () => {
    const { keys, ...rest } = page();
    const reveal = attachNameReveal(keys, DEFAULT_KEYMAP, rest);
    keys.dispatchEvent(key("keydown", "ShiftLeft"));
    rest.window.dispatchEvent(new Event("blur"));
    expect(reveal.held()).toBe(false);

    keys.dispatchEvent(key("keydown", "ShiftLeft"));
    rest.document.dispatchEvent(new Event("visibilitychange"));
    expect(reveal.held()).toBe(true);
    rest.document.visibilityState = "hidden";
    rest.document.dispatchEvent(new Event("visibilitychange"));
    expect(reveal.held()).toBe(false);
  });

  it("ignores Ctrl, which no keymap binds, and every other key, and never cancels a key", () => {
    const { keys, ...rest } = page();
    const reveal = attachNameReveal(keys, DEFAULT_KEYMAP, rest);
    for (const code of ["ControlLeft", "AltLeft", "MetaLeft", "KeyA", "Digit1"]) {
      const event = key("keydown", code);
      const prevent = vi.spyOn(event, "preventDefault");
      keys.dispatchEvent(event);
      expect(prevent).not.toHaveBeenCalled();
    }
    expect(reveal.held()).toBe(false);
    keys.dispatchEvent(key("keydown", "ShiftLeft", { ctrlKey: true }));
    expect(reveal.held()).toBe(false);
    const shift = key("keydown", "ShiftLeft");
    keys.dispatchEvent(shift);
    expect(shift.defaultPrevented).toBe(false);
  });

  it("stops listening once detached", () => {
    const { keys, ...rest } = page();
    const reveal = attachNameReveal(keys, DEFAULT_KEYMAP, rest);
    reveal.detach();
    keys.dispatchEvent(key("keydown", "ShiftLeft"));
    expect(reveal.held()).toBe(false);
  });
});
