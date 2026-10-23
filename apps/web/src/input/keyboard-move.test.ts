import { describe, expect, it, vi } from "vitest";

import { attachKeyboardMoveInput, computeMoveDirection } from "./keyboard-move.js";
import { ZERO, length } from "@vibewars/game-core";

describe("computeMoveDirection", () => {
  it("returns ZERO for no keys pressed", () => {
    expect(computeMoveDirection(new Set())).toBe(ZERO);
  });

  it("moves in the cardinal direction for a single key", () => {
    expect(computeMoveDirection(new Set(["d"]))).toEqual({ x: 1, y: 0 });
    expect(computeMoveDirection(new Set(["a"]))).toEqual({ x: -1, y: 0 });
    expect(computeMoveDirection(new Set(["w"]))).toEqual({ x: 0, y: -1 });
    expect(computeMoveDirection(new Set(["s"]))).toEqual({ x: 0, y: 1 });
  });

  it("cancels out opposite keys back to ZERO", () => {
    expect(computeMoveDirection(new Set(["a", "d"]))).toBe(ZERO);
    expect(computeMoveDirection(new Set(["w", "s"]))).toBe(ZERO);
    expect(computeMoveDirection(new Set(["w", "a", "s", "d"]))).toBe(ZERO);
  });

  it("normalizes a diagonal combination to unit length", () => {
    const diagonal = computeMoveDirection(new Set(["w", "d"]));
    expect(length(diagonal)).toBeCloseTo(1, 10);
    expect(diagonal.x).toBeGreaterThan(0);
    expect(diagonal.y).toBeLessThan(0);
  });

  it("ignores keys outside WASD", () => {
    expect(computeMoveDirection(new Set(["shift", "q", "d"]))).toEqual({ x: 1, y: 0 });
  });
});

/** Minimal fake EventTarget — exercises the real listener logic without jsdom. */
function createFakeTarget(): {
  target: EventTarget;
  dispatch: (type: string, key: string) => void;
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
  const dispatch = (type: string, key: string): void => {
    const event = { key } as unknown as Event;
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
    attachKeyboardMoveInput(target, onChange);

    dispatch("keydown", "d");

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ x: 1, y: 0 });
  });

  it("does not call onChange again for OS key-repeat of an already-pressed key", () => {
    const { target, dispatch } = createFakeTarget();
    const onChange = vi.fn();
    attachKeyboardMoveInput(target, onChange);

    dispatch("keydown", "d");
    dispatch("keydown", "d");
    dispatch("keydown", "d");

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("calls onChange with ZERO once the only pressed key is released", () => {
    const { target, dispatch } = createFakeTarget();
    const onChange = vi.fn();
    attachKeyboardMoveInput(target, onChange);

    dispatch("keydown", "d");
    dispatch("keyup", "d");

    expect(onChange).toHaveBeenLastCalledWith(ZERO);
  });

  it("is case-insensitive (uppercase from Shift-chorded input still counts)", () => {
    const { target, dispatch } = createFakeTarget();
    const onChange = vi.fn();
    attachKeyboardMoveInput(target, onChange);

    dispatch("keydown", "D");

    expect(onChange).toHaveBeenCalledWith({ x: 1, y: 0 });
  });

  it("ignores irrelevant keys entirely", () => {
    const { target, dispatch } = createFakeTarget();
    const onChange = vi.fn();
    attachKeyboardMoveInput(target, onChange);

    dispatch("keydown", "Shift");
    dispatch("keyup", "Shift");

    expect(onChange).not.toHaveBeenCalled();
  });

  it("recomputes direction correctly across overlapping key holds", () => {
    const { target, dispatch } = createFakeTarget();
    const onChange = vi.fn();
    attachKeyboardMoveInput(target, onChange);

    dispatch("keydown", "w");
    dispatch("keydown", "d");
    dispatch("keyup", "w");

    expect(onChange).toHaveBeenLastCalledWith({ x: 1, y: 0 });
  });

  it("the returned cleanup function removes both listeners", () => {
    const { target, dispatch } = createFakeTarget();
    const onChange = vi.fn();
    const cleanup = attachKeyboardMoveInput(target, onChange);

    cleanup();
    dispatch("keydown", "d");

    expect(onChange).not.toHaveBeenCalled();
  });
});
