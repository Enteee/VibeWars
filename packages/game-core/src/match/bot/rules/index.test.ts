import { describe, expect, it } from "vitest";

import { NOTHING } from "./shared.js";
import { BOT_RULES, inOrder } from "./index.js";
import type { BotRule } from "./types.js";

const rule = (name: string, order: number): BotRule => ({ name, order, decide: () => NOTHING });

describe("BOT_RULES (#2042)", () => {
  it("names each rule as the file it is the default export of", async () => {
    for (const rule of BOT_RULES) {
      const file: { default: BotRule } = await import(`./${rule.name}.js`);
      expect(file.default).toBe(rule);
    }
  });

  it("runs in ascending order, every order its own", () => {
    const orders = BOT_RULES.map(({ order }) => order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(new Set(orders).size).toBe(orders.length);
  });

  it("keeps today's order: interrupt first, close-in last", () => {
    expect(BOT_RULES.map(({ name }) => name)).toEqual([
      "interrupt",
      "heal",
      "way-out",
      "ward-touch",
      "cleanse",
      "raise",
      "renew-spirit",
      "mantra",
      "bind-spirit",
      "fight",
      "mimic-elite",
      "close-in",
    ]);
  });

  it("refuses two rules with one order or one name", () => {
    expect(() => inOrder([rule("a", 10), rule("b", 10)])).toThrow(/a and b/);
    expect(() => inOrder([rule("a", 10), rule("a", 20)])).toThrow(/a and a/);
    expect(inOrder([rule("b", 20), rule("a", 10)]).map(({ name }) => name)).toEqual(["a", "b"]);
  });
});
