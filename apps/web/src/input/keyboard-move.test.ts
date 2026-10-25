import { describe, expect, it, vi } from "vitest";

import { attachKeyboardMoveInput, computeMoveDirection } from "./keyboard-move.js";
import { DEFAULT_KEYMAP, KEYMAP_PRESETS } from "./keymap.js";
import { ZERO, length } from "@vibewars/game-core";

describe("computeMoveDirection", () => {
  it("returns ZERO for no actions held", () => {
    expect(computeMoveDirection(new Set())).toBe(ZERO);
  });

  it("moves in the cardinal direction for a single action", () => {
    expect(computeMoveDirection(new Set(["move-right"]))).toEqual({ x: 1, y: 0 });
    expect(computeMoveDirection(new Set(["move-left"]))).toEqual({ x: -1, y: 0 });
    expect(computeMoveDirection(new Set(["move-up"]))).toEqual({ x: 0, y: -1 });
    expect(computeMoveDirection(new Set(["move-down"]))).toEqual({ x: 0, y: 1 });
  });

  it("cancels out opposite actions back to ZERO", () => {
    expect(computeMoveDirection(new Set(["move-left", "move-right"]))).toBe(ZERO);
    expect(computeMoveDirection(new Set(["move-up", "move-down"]))).toBe(ZERO);
    expect(computeMoveDirection(new Set(["move-up", "move-left", "move-down", "move-right"]))).toBe(
      ZERO,
    );
  });

  it("normalizes a diagonal combination to unit length", () => {
    const diagonal = computeMoveDirection(new Set(["move-up", "move-right"]));
    expect(length(diagonal)).toBeCloseTo(1, 10);
    expect(diagonal.x).toBeGreaterThan(0);
    expect(diagonal.y).toBeLessThan(0);
  });

  it("ignores actions that are not movement", () => {
    expect(computeMoveDirection(new Set(["show-names", "skill-1", "move-right"]))).toEqual({
      x: 1,
      y: 0,
    });
  });
});

/** Minimal fake EventTarget — exercises the real listener logic without jsdom. */
function createFakeTarget(): {
  target: EventTarget;
  dispatch: (type: string, code: string, modifiers?: { ctrlKey?: boolean }) => void;
} {
  const handlers = new Map<string, Set<(event: Event) => void>>();
  const target: EventTarget = {
    addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
      const set = handlers.get(type) ?? new Set();
      set.add(listener as (event: Event) => void);
      handlers.set(type, set);
    },
    removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
      handlers.get(type)?.delete(listener as (event: Event) => void);
    },
    dispatchEvent: () => true,
  };
  // An arrow function, not a method: it has no own `this`, so destructuring
  // `dispatch` out of the returned object below cannot lose a binding it
  // never had.
  const dispatch = (type: string, code: string, modifiers: { ctrlKey?: boolean } = {}): void => {
    const event = {
      code,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      ...modifiers,
    } as unknown as Event;
    for (const listener of handlers.get(type) ?? []) {
      listener(event);
    }
  };
  return { target, dispatch };
}

describe("attachKeyboardMoveInput", () => {
  it("calls onChange when a key is first pressed", () => {
    const { target, dispatch } = createFakeTarget();
    const onChange = vi.fn();
    attachKeyboardMoveInput(target, DEFAULT_KEYMAP, onChange);

    dispatch("keydown", "ArrowRight");

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ x: 1, y: 0 });
  });

  it("does not call onChange again for OS key-repeat of an already-pressed key", () => {
    const { target, dispatch } = createFakeTarget();
    const onChange = vi.fn();
    attachKeyboardMoveInput(target, DEFAULT_KEYMAP, onChange);

    dispatch("keydown", "ArrowRight");
    dispatch("keydown", "ArrowRight");
    dispatch("keydown", "ArrowRight");

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("calls onChange with ZERO once the only pressed key is released", () => {
    const { target, dispatch } = createFakeTarget();
    const onChange = vi.fn();
    attachKeyboardMoveInput(target, DEFAULT_KEYMAP, onChange);

    dispatch("keydown", "ArrowRight");
    dispatch("keyup", "ArrowRight");

    expect(onChange).toHaveBeenLastCalledWith(ZERO);
  });

  it("does not move on a skill key: W casts in the default keymap (#302)", () => {
    const { target, dispatch } = createFakeTarget();
    const onChange = vi.fn();
    attachKeyboardMoveInput(target, DEFAULT_KEYMAP, onChange);

    dispatch("keydown", "KeyW");
    dispatch("keydown", "ShiftLeft");
    dispatch("keyup", "ShiftLeft");

    expect(onChange).not.toHaveBeenCalled();
  });

  it("leaves a press with Ctrl held to the browser, but always hears the release", () => {
    const { target, dispatch } = createFakeTarget();
    const onChange = vi.fn();
    attachKeyboardMoveInput(target, DEFAULT_KEYMAP, onChange);

    dispatch("keydown", "ArrowUp", { ctrlKey: true });
    expect(onChange).not.toHaveBeenCalled();

    dispatch("keydown", "ArrowUp");
    dispatch("keyup", "ArrowUp", { ctrlKey: true });
    expect(onChange).toHaveBeenLastCalledWith(ZERO);
  });

  it("keeps moving while the second key on one action is still held (Classic)", () => {
    const { target, dispatch } = createFakeTarget();
    const onChange = vi.fn();
    attachKeyboardMoveInput(target, KEYMAP_PRESETS.classic, onChange);

    dispatch("keydown", "KeyW");
    dispatch("keydown", "ArrowUp");
    dispatch("keyup", "KeyW");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith({ x: 0, y: -1 });

    // W and the down arrow cancel out, as W and S do.
    dispatch("keydown", "ArrowDown");
    expect(onChange).toHaveBeenLastCalledWith(ZERO);
  });

  it("recomputes direction correctly across overlapping key holds", () => {
    const { target, dispatch } = createFakeTarget();
    const onChange = vi.fn();
    attachKeyboardMoveInput(target, DEFAULT_KEYMAP, onChange);

    dispatch("keydown", "ArrowUp");
    dispatch("keydown", "ArrowRight");
    dispatch("keyup", "ArrowUp");

    expect(onChange).toHaveBeenLastCalledWith({ x: 1, y: 0 });
  });

  it("losing focus stops a held move, whose keyup will never come", () => {
    const { target, dispatch } = createFakeTarget();
    const onChange = vi.fn();
    attachKeyboardMoveInput(target, DEFAULT_KEYMAP, onChange);

    dispatch("keydown", "ArrowRight");
    dispatch("blur", "");
    expect(onChange).toHaveBeenLastCalledWith(ZERO);

    // Pressed again after focus returns, it moves again.
    dispatch("keydown", "ArrowRight");
    expect(onChange).toHaveBeenLastCalledWith({ x: 1, y: 0 });
  });

  it("a blur with nothing held sends nothing", () => {
    const { target, dispatch } = createFakeTarget();
    const onChange = vi.fn();
    attachKeyboardMoveInput(target, DEFAULT_KEYMAP, onChange);

    dispatch("blur", "");

    expect(onChange).not.toHaveBeenCalled();
  });

  it("the returned cleanup function removes every listener", () => {
    const { target, dispatch } = createFakeTarget();
    const onChange = vi.fn();
    const cleanup = attachKeyboardMoveInput(target, DEFAULT_KEYMAP, onChange);

    cleanup();
    dispatch("keydown", "ArrowRight");
    dispatch("blur", "");

    expect(onChange).not.toHaveBeenCalled();
  });
});
