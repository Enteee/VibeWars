import { describe, expect, it, vi } from "vitest";

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

function key(type: "keydown" | "keyup", name: string): Event {
  return Object.assign(new Event(type, { cancelable: true }), { key: name });
}

describe("attachNameReveal (#253)", () => {
  it("is held from Control's keydown to its keyup", () => {
    const { keys, ...rest } = page();
    const reveal = attachNameReveal(keys, rest);
    expect(reveal.held()).toBe(false);
    keys.dispatchEvent(key("keydown", "Control"));
    expect(reveal.held()).toBe(true);
    keys.dispatchEvent(key("keyup", "Control"));
    expect(reveal.held()).toBe(false);
  });

  it("lets go when the page loses focus, or turns hidden", () => {
    const { keys, ...rest } = page();
    const reveal = attachNameReveal(keys, rest);
    keys.dispatchEvent(key("keydown", "Control"));
    rest.window.dispatchEvent(new Event("blur"));
    expect(reveal.held()).toBe(false);

    keys.dispatchEvent(key("keydown", "Control"));
    rest.document.dispatchEvent(new Event("visibilitychange"));
    expect(reveal.held()).toBe(true);
    rest.document.visibilityState = "hidden";
    rest.document.dispatchEvent(new Event("visibilitychange"));
    expect(reveal.held()).toBe(false);
  });

  it("ignores every other key, and never cancels a key", () => {
    const { keys, ...rest } = page();
    const reveal = attachNameReveal(keys, rest);
    for (const name of ["Alt", "Shift", "Meta", "a", "1"]) {
      const event = key("keydown", name);
      const prevent = vi.spyOn(event, "preventDefault");
      keys.dispatchEvent(event);
      expect(prevent).not.toHaveBeenCalled();
    }
    expect(reveal.held()).toBe(false);
    const control = key("keydown", "Control");
    keys.dispatchEvent(control);
    expect(control.defaultPrevented).toBe(false);
  });

  it("stops listening once detached", () => {
    const { keys, ...rest } = page();
    const reveal = attachNameReveal(keys, rest);
    reveal.detach();
    keys.dispatchEvent(key("keydown", "Control"));
    expect(reveal.held()).toBe(false);
  });
});
