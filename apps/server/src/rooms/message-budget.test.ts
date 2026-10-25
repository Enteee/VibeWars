import { describe, expect, it } from "vitest";

import { MessageBudget } from "./message-budget.js";

function takeMany(budget: MessageBudget, count: number, nowMs: number): number {
  let taken = 0;
  for (let i = 0; i < count; i += 1) {
    if (budget.take("a", nowMs)) {
      taken += 1;
    }
  }
  return taken;
}

describe("MessageBudget", () => {
  it("takes a whole burst at once, then nothing more", () => {
    const budget = new MessageBudget(60, 300);
    expect(takeMany(budget, 400, 0)).toBe(300);
  });

  it("refills at the sustained rate, never past the burst", () => {
    const budget = new MessageBudget(60, 300);
    takeMany(budget, 300, 0);
    expect(takeMany(budget, 100, 1000)).toBe(60);
    expect(takeMany(budget, 400, 60_000)).toBe(300);
  });

  it("keeps one client's budget apart from another's", () => {
    const budget = new MessageBudget(60, 300);
    takeMany(budget, 300, 0);
    expect(budget.take("b", 0)).toBe(true);
  });

  it("starts a forgotten client afresh", () => {
    const budget = new MessageBudget(60, 300);
    takeMany(budget, 300, 0);
    budget.forget("a");
    expect(takeMany(budget, 300, 0)).toBe(300);
  });

  it("does not refill when the clock steps back", () => {
    const budget = new MessageBudget(60, 300);
    takeMany(budget, 300, 5000);
    expect(budget.take("a", 4000)).toBe(false);
  });
});
