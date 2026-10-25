import { describe, expect, it } from "vitest";

import type { CombatEvent, CombatLogEntry } from "@vibewars/game-core";

import {
  EMPTY_TOTALS,
  accumulate,
  appendRows,
  combatEventToRow,
  describeCombatEvent,
  dividerRow,
  floatingCueFor,
  formatAmount,
  formatRate,
  formatSimClock,
  logToneOf,
  meterRows,
  perSecond,
  shouldStickToBottom,
  type LogRow,
} from "./combat-readouts.js";

const NAMES = new Map([
  ["you", "Pyro"],
  ["dummy", "Caster dummy"],
]);
const nameOf = (id: string): string => NAMES.get(id) ?? id;

function entry(events: CombatEvent[], extra: Partial<CombatLogEntry> = {}): CombatLogEntry {
  return {
    tick: 1,
    atSeconds: 1.5,
    cause: "skill",
    sourceId: "you",
    skillId: "elementalist.fireball",
    area: undefined,
    events,
    ...extra,
  };
}

describe("formatSimClock", () => {
  it("reads minutes, seconds and tenths", () => {
    expect(formatSimClock(0)).toBe("0:00.0");
    expect(formatSimClock(3.46)).toBe("0:03.4");
    expect(formatSimClock(65.2)).toBe("1:05.2");
    expect(formatSimClock(-1)).toBe("0:00.0");
  });
});

describe("logToneOf", () => {
  it("gives every event kind a tone", () => {
    const kinds: CombatEvent["kind"][] = [
      "damage",
      "heal",
      "energy-gain",
      "sacrifice",
      "death",
      "status-applied",
      "status-removed",
      "status-expired",
      "interrupted",
      "interrupt-missed",
      "attack-missed",
      "attack-dodged",
      "attack-obstructed",
    ];
    expect(kinds.map(logToneOf)).toEqual([
      "damage",
      "heal",
      "resource",
      "damage",
      "death",
      "status",
      "status",
      "status",
      "control",
      "control",
      "control",
      "control",
      "control",
    ]);
  });
});

describe("describeCombatEvent", () => {
  it("names the skill, the caster, the target and the amount", () => {
    const event: CombatEvent = { kind: "damage", targetId: "dummy", amount: 63.6 };
    expect(describeCombatEvent(entry([event]), event, nameOf)).toBe(
      "Fireball (Pyro) hits Caster dummy for 64",
    );
  });

  it("says degeneration for a status tick, with no skill", () => {
    const event: CombatEvent = { kind: "damage", targetId: "dummy", amount: 3 };
    const tick = entry([event], { cause: "degeneration", skillId: undefined });
    expect(describeCombatEvent(tick, event, nameOf)).toBe("degeneration hits Caster dummy for 3");
  });

  it("says Attack for a weapon swing, with its attacker", () => {
    const event: CombatEvent = { kind: "damage", targetId: "dummy", amount: 18 };
    const swing = entry([event], { cause: "weapon", skillId: undefined });
    expect(describeCombatEvent(swing, event, nameOf)).toBe(
      "Attack (Pyro) hits Caster dummy for 18",
    );
  });

  it("names statuses and interrupted skills", () => {
    const applied: CombatEvent = {
      kind: "status-applied",
      targetId: "dummy",
      statusId: "bleeding",
      durationSeconds: 10,
    };
    expect(describeCombatEvent(entry([applied]), applied, nameOf)).toBe(
      "Caster dummy gains Bleeding (10 s)",
    );
    const interrupted: CombatEvent = {
      kind: "interrupted",
      targetId: "dummy",
      skillId: "elementalist.fireball",
    };
    expect(describeCombatEvent(entry([interrupted]), interrupted, nameOf)).toBe(
      "Fireball (Pyro) interrupts Caster dummy's Fireball",
    );
    const missed: CombatEvent = { kind: "attack-missed", targetId: "dummy" };
    expect(describeCombatEvent(entry([missed]), missed, nameOf)).toBe(
      "Fireball (Pyro) misses Caster dummy",
    );
    const dodged: CombatEvent = { kind: "attack-dodged", targetId: "dummy" };
    expect(describeCombatEvent({ ...entry([dodged]), cause: "weapon" }, dodged, nameOf)).toBe(
      "Caster dummy dodges Attack (Pyro)",
    );
  });
});

describe("combatEventToRow and dividerRow", () => {
  it("carries the time and the tone", () => {
    const event: CombatEvent = { kind: "heal", targetId: "you", amount: 40 };
    expect(combatEventToRow(entry([event]), event, nameOf)).toEqual({
      time: "0:01.5",
      text: "Fireball (Pyro) heals Pyro for 40",
      tone: "heal",
    });
    expect(dividerRow("re-armed", 2)).toEqual({
      time: "0:02.0",
      text: "── re-armed ──",
      tone: "divider",
    });
  });
});

describe("appendRows", () => {
  const row = (text: string): LogRow => ({ time: "0:00.0", text, tone: "damage" });

  it("appends, and drops from the front past the cap", () => {
    const { rows, dropped } = appendRows([row("a"), row("b")], [row("c"), row("d")], 3);
    expect(rows.map((r) => r.text)).toEqual(["b", "c", "d"]);
    expect(dropped).toBe(1);
  });

  it("drops nothing under the cap", () => {
    expect(appendRows([row("a")], [row("b")], 3).dropped).toBe(0);
  });
});

describe("shouldStickToBottom", () => {
  it("follows a reader at the bottom, leaves one who scrolled up", () => {
    expect(shouldStickToBottom(400, 500, 100)).toBe(true);
    expect(shouldStickToBottom(397, 500, 100)).toBe(true);
    expect(shouldStickToBottom(200, 500, 100)).toBe(false);
  });
});

describe("accumulate", () => {
  it("counts damage dealt, healing done and damage taken, for the player only", () => {
    const totals = accumulate(
      EMPTY_TOTALS,
      [
        entry([{ kind: "damage", targetId: "dummy", amount: 64 }]),
        entry([{ kind: "damage", targetId: "you", amount: 10 }], { sourceId: "dummy" }),
        entry([{ kind: "heal", targetId: "you", amount: 30 }]),
        // Someone else's healing is not yours.
        entry([{ kind: "heal", targetId: "dummy", amount: 99 }], { sourceId: "dummy" }),
        // Hurting yourself is damage taken, not damage dealt.
        entry([{ kind: "damage", targetId: "you", amount: 5 }]),
      ],
      "you",
      0.05,
    );
    expect(totals).toEqual({ damage: 64, healing: 30, taken: 15, seconds: 0.05 });
  });
});

describe("perSecond", () => {
  it("is 0, not NaN or Infinity, before any time has passed", () => {
    expect(perSecond(100, 0)).toBe(0);
    expect(perSecond(0, 0)).toBe(0);
    expect(perSecond(100, 4)).toBe(25);
  });
});

describe("formatAmount, formatRate and meterRows", () => {
  it("round amounts, give rates one decimal, and lay out the meter", () => {
    expect(formatAmount(63.6)).toBe("64");
    expect(formatRate(12.345)).toBe("12.3");
    expect(meterRows({ damage: 128, healing: 0, taken: 15, seconds: 4 })).toEqual([
      { label: "dps", value: "32.0" },
      { label: "hps", value: "0.0" },
      { label: "damage", value: "128" },
      { label: "healing", value: "0" },
      { label: "taken", value: "15" },
      { label: "time", value: "0:04.0" },
    ]);
    expect(meterRows(EMPTY_TOTALS)[0]).toEqual({ label: "dps", value: "0.0" });
  });
});

describe("floatingCueFor", () => {
  it("signs damage with a real minus and heals with a plus", () => {
    expect(floatingCueFor("damage", 63.6)).toEqual({ text: "−64", tone: "damage" });
    expect(floatingCueFor("heal", 40)).toEqual({ text: "+40", tone: "heal" });
  });

  it("calls out interrupts and deaths, and floats nothing for statuses", () => {
    expect(floatingCueFor("interrupted", undefined)).toEqual({
      text: "interrupted!",
      tone: "neutral",
    });
    expect(floatingCueFor("death", undefined)).toEqual({ text: "defeated", tone: "damage" });
    expect(floatingCueFor("status-applied", undefined)).toBeUndefined();
    expect(floatingCueFor("something-new", 5)).toBeUndefined();
  });

  it("floats 'miss' over the target of a blinded attack", () => {
    expect(floatingCueFor("attack-missed", undefined)).toEqual({ text: "miss", tone: "neutral" });
    expect(floatingCueFor("attack-dodged", undefined)).toEqual({ text: "dodge", tone: "neutral" });
    expect(floatingCueFor("attack-obstructed", undefined)).toEqual({
      text: "obstructed",
      tone: "neutral",
    });
  });

  it("treats a missing amount as 0", () => {
    expect(floatingCueFor("damage", undefined)).toEqual({ text: "−0", tone: "damage" });
  });
});
