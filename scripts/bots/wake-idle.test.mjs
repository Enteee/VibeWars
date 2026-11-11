import { describe, expect, it } from "vitest";

import {
  CLAIM_HOLD_MS,
  IDLE_GRACE_MS,
  READY_LOW,
  REWAKE_MS,
  sentKey,
  wakeTargets,
  wakeText,
} from "./wake-idle.mjs";

const NOW = 10_000_000_000;
const LONG_AGO = NOW - 10 * IDLE_GRACE_MS;

/**
 * @param {number} number
 * @param {string} status
 * @param {string} [title]
 */
const card = (number, status, title = `card ${String(number)}`) => ({ number, title, status });

/** @param {Record<string, unknown>} over */
function run(over) {
  return wakeTargets({
    cards: [],
    staff: new Map([
      ["developer", "developer"],
      ["developer@2", "developer"],
    ]),
    idle: new Map([
      ["developer", LONG_AGO],
      ["developer@2", LONG_AGO],
    ]),
    claims: [],
    sent: new Map(),
    now: NOW,
    ...over,
  });
}

describe("wakeTargets (#3100)", () => {
  it("wakes nobody for an empty column", () => {
    expect(run({})).toEqual([]);
  });

  it("wakes an idle developer beside a Ready card, with a readable message", () => {
    const [target, ...rest] = run({ cards: [card(5, "Ready", "Do it")] });
    expect(rest).toEqual([]);
    expect(target).toEqual({ employee: "developer", issue: 5, column: "Ready", title: "Do it" });
    expect(wakeText(/** @type {never} */ (target))).toBe("Work waiting: #5 in Ready — Do it.");
  });

  it("does not wake a mid-turn employee, or one still inside the grace", () => {
    const cards = [card(5, "Ready")];
    expect(run({ cards, idle: new Map() })).toEqual([]);
    expect(run({ cards, idle: new Map([["developer", NOW - IDLE_GRACE_MS + 1]]) })).toEqual([]);
  });

  it("holds a claimed card for CLAIM_HOLD_MS, and not once it has moved", () => {
    const cards = [card(5, "Ready")];
    const claim = { issue: 5, employee: "developer@2", at: NOW - 1000, status: "Ready" };
    expect(run({ cards, claims: [claim] })).toEqual([]);
    expect(run({ cards, claims: [{ ...claim, at: NOW - CLAIM_HOLD_MS }] })).toHaveLength(1);
    expect(run({ cards, claims: [{ ...claim, status: "In Progress" }] })).toHaveLength(1);
  });

  it("does not wake the same employee for the same card within REWAKE_MS", () => {
    const cards = [card(5, "Ready")];
    const sent = new Map([[sentKey("developer", 5), NOW - REWAKE_MS + 1]]);
    expect(run({ cards, sent }).map((t) => t.employee)).toEqual(["developer@2"]);
    sent.set(sentKey("developer", 5), NOW - REWAKE_MS);
    expect(run({ cards, sent }).map((t) => t.employee)).toEqual(["developer"]);
  });

  it("wakes one developer per card and never one twice", () => {
    expect(run({ cards: [card(5, "Ready"), card(6, "Ready"), card(7, "Ready")] })).toEqual([
      { employee: "developer", issue: 5, column: "Ready", title: "card 5" },
      { employee: "developer@2", issue: 6, column: "Ready", title: "card 6" },
    ]);
    expect(run({ cards: [card(5, "Ready")] })).toHaveLength(1);
  });

  it("wakes one employee for a card in a column several roles share", () => {
    const staff = new Map([
      ["developer", "developer"],
      ["cicd-engineer", "cicd-engineer"],
    ]);
    const idle = new Map([
      ["developer", LONG_AGO],
      ["cicd-engineer", LONG_AGO],
    ]);
    expect(run({ staff, idle, cards: [card(5, "Ready")] })).toHaveLength(1);
  });

  it("skips a fired employee and ignores Blocked", () => {
    const cards = [card(5, "Ready"), card(6, "Blocked")];
    const idle = new Map([["developer@3", LONG_AGO]]);
    expect(run({ cards, idle })).toEqual([]);
    expect(run({ cards: [card(6, "Blocked")] })).toEqual([]);
  });

  it("wakes the architect for Backlog only while Ready is low, and not for epics or releases", () => {
    const staff = new Map([["architect", "architect"]]);
    const idle = new Map([["architect", LONG_AGO]]);
    const backlog = [
      card(1, "Backlog", "Epic: x"),
      card(2, "Backlog", "Release 0.9"),
      card(3, "Backlog"),
    ];
    expect(run({ staff, idle, cards: backlog })).toEqual([
      { employee: "architect", issue: 3, column: "Backlog", title: "card 3" },
    ]);
    const ready = Array.from({ length: READY_LOW }, (_, i) => card(10 + i, "Ready"));
    expect(run({ staff, idle, cards: [...backlog, ...ready] })).toEqual([]);
  });

  it("never wakes a role with no work column", () => {
    const staff = new Map([["manager", "manager"]]);
    const idle = new Map([["manager", LONG_AGO]]);
    expect(run({ staff, idle, cards: [card(5, "Ready"), card(6, "Backlog")] })).toEqual([]);
  });
});
