import { describe, expect, it } from "vitest";

import { en, type MessageKey } from "../i18n/en.js";

import { touchLine } from "./touch-lines.js";

const TUTORIAL_KEYS = Object.keys(en).filter((key): key is MessageKey =>
  key.startsWith("tutorial."),
);

describe("the tutor's lines on touch (#3782)", () => {
  it("name no key, mouse button or click on a touch-only device", () => {
    for (const key of TUTORIAL_KEYS) {
      const text = en[touchLine(key, true)];
      if (typeof text === "string") {
        expect(text, key).not.toMatch(/click|mouse|wheel|\bAlt\b|\{keys\}/i);
      }
    }
  });

  it("are the lines themselves with a fine pointer", () => {
    for (const key of TUTORIAL_KEYS) {
      expect(touchLine(key, false)).toBe(key);
    }
  });
});
