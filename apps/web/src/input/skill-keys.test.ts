import { describe, expect, it } from "vitest";

import type { SkillSlot } from "../net/match-connection.js";
import { DEFAULT_KEYMAP, KEYMAP_PRESETS } from "./keymap.js";
import { skillSlotForKeyDown } from "./skill-keys.js";

const press = (
  code: string,
  extra: Partial<{ repeat: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean }> = {},
): { code: string; repeat: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean } => ({
  code,
  repeat: false,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  ...extra,
});

const slot = (id: string): SkillSlot => ({
  id,
  name: id,
  energyCost: 5,
  adrenalineCost: 0,
  activationSeconds: 1,
  rechargeSeconds: 5,
});

/** Eight filled slots. */
const FULL = Array.from({ length: 8 }, (_, index) => slot(`skill-${String(index)}`));

describe("skillSlotForKeyDown (#302)", () => {
  it("maps Q W E R / A S D F to the eight slots by default", () => {
    const codes = ["KeyQ", "KeyW", "KeyE", "KeyR", "KeyA", "KeyS", "KeyD", "KeyF"];
    expect(codes.map((code) => skillSlotForKeyDown(press(code), DEFAULT_KEYMAP, FULL))).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7,
    ]);
  });

  it("maps 1-8 in the Classic keymap, and not by default", () => {
    expect(skillSlotForKeyDown(press("Digit1"), KEYMAP_PRESETS.classic, FULL)).toBe(0);
    expect(skillSlotForKeyDown(press("Digit8"), KEYMAP_PRESETS.classic, FULL)).toBe(7);
    expect(skillSlotForKeyDown(press("Digit1"), DEFAULT_KEYMAP, FULL)).toBeUndefined();
  });

  it("casts with Shift held, but not with Ctrl, Alt or Meta held", () => {
    const shiftQ = { ...press("KeyQ"), shiftKey: true };
    expect(skillSlotForKeyDown(shiftQ, DEFAULT_KEYMAP, FULL)).toBe(0);
    for (const modifier of ["ctrlKey", "altKey", "metaKey"] as const) {
      expect(
        skillSlotForKeyDown(press("KeyQ", { [modifier]: true }), DEFAULT_KEYMAP, FULL),
      ).toBeUndefined();
    }
  });

  it("casts nothing past the end of the bar, or for any other key", () => {
    expect(skillSlotForKeyDown(press("KeyF"), DEFAULT_KEYMAP, FULL.slice(0, 7))).toBeUndefined();
    expect(skillSlotForKeyDown(press("ArrowUp"), DEFAULT_KEYMAP, FULL)).toBeUndefined();
    expect(skillSlotForKeyDown(press("Tab"), DEFAULT_KEYMAP, FULL)).toBeUndefined();
  });

  it("casts nothing for an empty slot, and the next key still casts its own slot (#347)", () => {
    const gap = [slot("a"), null, slot("c"), null, null, null, null, null];
    expect(skillSlotForKeyDown(press("KeyW"), DEFAULT_KEYMAP, gap)).toBeUndefined();
    expect(skillSlotForKeyDown(press("KeyE"), DEFAULT_KEYMAP, gap)).toBe(2);
    expect(skillSlotForKeyDown(press("KeyF"), DEFAULT_KEYMAP, gap)).toBeUndefined();
  });

  it("casts once for a held key, however often the OS repeats it (#43)", () => {
    const held = [
      press("KeyQ"),
      ...Array.from({ length: 60 }, () => press("KeyQ", { repeat: true })),
    ];
    const casts = held
      .map((event) => skillSlotForKeyDown(event, DEFAULT_KEYMAP, FULL))
      .filter((s) => s !== undefined);
    expect(casts).toEqual([0]);
  });
});
