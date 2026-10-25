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
  StatusTickBatcher,
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
    weaponId: undefined,
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

  it("says degeneration for a status tick that hurts, regeneration for one that heals", () => {
    const hurt: CombatEvent = { kind: "damage", targetId: "dummy", amount: 3 };
    const heal: CombatEvent = { kind: "heal", targetId: "dummy", amount: 4 };
    const tick = (event: CombatEvent) =>
      entry([event], { cause: "degeneration", sourceId: undefined, skillId: undefined });
    expect(describeCombatEvent(tick(hurt), hurt, nameOf)).toBe(
      "degeneration hits Caster dummy for 3",
    );
    expect(describeCombatEvent(tick(heal), heal, nameOf)).toBe(
      "regeneration heals Caster dummy for 4",
    );
  });

  it("names a status tick's source when exactly one is known", () => {
    const hurt: CombatEvent = { kind: "damage", targetId: "dummy", amount: 3 };
    const tick = entry([hurt], { cause: "degeneration", skillId: undefined });
    expect(describeCombatEvent(tick, hurt, nameOf)).toBe(
      "degeneration (Pyro) hits Caster dummy for 3",
    );
  });

  it("names a weapon swing for its weapon and attacker, and an unknown weapon plainly", () => {
    const event: CombatEvent = { kind: "damage", targetId: "dummy", amount: 18 };
    const swing = entry([event], { cause: "weapon", skillId: undefined, weaponId: "sword" });
    expect(describeCombatEvent(swing, event, nameOf)).toBe("Sword (Pyro) hits Caster dummy for 18");
    expect(describeCombatEvent({ ...swing, weaponId: undefined }, event, nameOf)).toBe(
      "a weapon (Pyro) hits Caster dummy for 18",
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
    expect(logToneOf("attack-unreachable")).toBe("control");
  });

  it("names a weapon entry for the weapon that swung or shot (#162)", () => {
    const shot = (event: CombatEvent): string =>
      describeCombatEvent(
        entry([event], { cause: "weapon", skillId: undefined, weaponId: "longbow" }),
        event,
        nameOf,
      );
    expect(shot({ kind: "damage", targetId: "dummy", amount: 14 })).toBe(
      "Longbow (Pyro) hits Caster dummy for 14",
    );
    expect(shot({ kind: "attack-missed", targetId: "dummy" })).toBe(
      "Longbow (Pyro) misses Caster dummy",
    );
    expect(shot({ kind: "attack-dodged", targetId: "dummy" })).toBe(
      "Caster dummy dodges Longbow (Pyro)",
    );
    expect(shot({ kind: "attack-obstructed", targetId: "dummy" })).toBe(
      "Longbow (Pyro) is obstructed on the way to Caster dummy",
    );
    expect(shot({ kind: "attack-unreachable", targetId: "dummy" })).toBe(
      "Longbow (Pyro) can't reach Caster dummy",
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
        // A swing counts as damage, and as the weapon's share of it.
        entry([{ kind: "damage", targetId: "dummy", amount: 12 }], {
          cause: "weapon",
          skillId: undefined,
          weaponId: "sword",
        }),
      ],
      "you",
      0.05,
    );
    expect(totals).toEqual({
      damage: 76,
      weaponDamage: 12,
      healing: 30,
      taken: 15,
      seconds: 0.05,
    });
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
    expect(meterRows({ damage: 128, weaponDamage: 28, healing: 0, taken: 15, seconds: 4 })).toEqual(
      [
        { label: "dps", value: "32.0" },
        { label: "hps", value: "0.0" },
        { label: "damage", value: "128" },
        { label: "weapon / skills", value: "28 / 100" },
        { label: "healing", value: "0" },
        { label: "taken", value: "15" },
        { label: "time", value: "0:04.0" },
      ],
    );
    expect(meterRows(EMPTY_TOTALS)[0]).toEqual({ label: "dps", value: "0.0" });
  });
});

describe("floatingCueFor", () => {
  it("signs damage with a real minus and heals with a plus", () => {
    expect(floatingCueFor("damage", 63.6)).toEqual({ text: "−64", tone: "damage" });
    expect(floatingCueFor("heal", 40)).toEqual({ text: "+40", tone: "heal" });
  });

  it("floats nothing for an amount that rounds to zero, like a status tick", () => {
    expect(floatingCueFor("damage", 0.4)).toBeUndefined();
    expect(floatingCueFor("heal", 0.2)).toBeUndefined();
    expect(floatingCueFor("damage", 0.6)).toEqual({ text: "−1", tone: "damage" });
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
    expect(floatingCueFor("attack-unreachable", undefined)).toEqual({
      text: "can't reach",
      tone: "neutral",
    });
  });

  it("treats a missing amount as 0, so floats nothing for it", () => {
    expect(floatingCueFor("damage", undefined)).toBeUndefined();
  });
});

describe("StatusTickBatcher (#151)", () => {
  /** A status entry at `at`, as the simulation logs one per tick. */
  const tick = (at: number, events: CombatEvent[], sourceId?: string): CombatLogEntry =>
    entry(events, { atSeconds: at, cause: "degeneration", sourceId, skillId: undefined });
  const texts = (rows: readonly LogRow[]) => rows.map((row) => row.text);
  /** Twenty ticks a second, from `from` for `count` ticks. */
  const ticks = (from: number, count: number, events: CombatEvent[]) =>
    Array.from({ length: count }, (_, i) => tick(from + i * 0.05, events));

  it("gathers a second of regeneration into one row", () => {
    const batcher = new StatusTickBatcher();
    const heal: CombatEvent = { kind: "heal", targetId: "dummy", amount: 0.2 };
    const rows = ticks(0, 20, [heal]).flatMap((t) => batcher.push(t, nameOf));
    expect(rows).toEqual([]);
    const closed = batcher.advance(1, nameOf);
    expect(texts(closed)).toEqual(["regeneration heals Caster dummy for 4"]);
    expect(closed[0]?.time).toBe("0:01.0");
  });

  it("keeps the two directions on one target apart", () => {
    const batcher = new StatusTickBatcher();
    const both: CombatEvent[] = [
      { kind: "damage", targetId: "dummy", amount: 0.5 },
      { kind: "heal", targetId: "dummy", amount: 0.3 },
    ];
    ticks(0, 20, both).forEach((t) => batcher.push(t, nameOf));
    expect(texts(batcher.advance(1, nameOf))).toEqual([
      "degeneration hits Caster dummy for 10",
      "regeneration heals Caster dummy for 6",
    ]);
  });

  it("gives each target its own row a second", () => {
    const batcher = new StatusTickBatcher();
    const two: CombatEvent[] = [
      { kind: "damage", targetId: "dummy", amount: 0.5 },
      { kind: "damage", targetId: "you", amount: 0.5 },
    ];
    const rows = ticks(0, 40, two).flatMap((t) => batcher.push(t, nameOf));
    expect(texts([...rows, ...batcher.flush(2, nameOf)])).toEqual([
      "degeneration hits Caster dummy for 10",
      "degeneration hits Pyro for 10",
      "degeneration hits Caster dummy for 10",
      "degeneration hits Pyro for 10",
    ]);
  });

  it("writes the damage before the death it caused", () => {
    const batcher = new StatusTickBatcher();
    const hurt: CombatEvent = { kind: "damage", targetId: "dummy", amount: 2 };
    batcher.push(tick(0, [hurt]), nameOf);
    const rows = batcher.push(tick(0.05, [hurt, { kind: "death", targetId: "dummy" }]), nameOf);
    expect(texts(rows)).toEqual(["degeneration hits Caster dummy for 4", "Caster dummy dies"]);
  });

  it("also writes the ticks before a death by a skill", () => {
    const batcher = new StatusTickBatcher();
    batcher.push(tick(0, [{ kind: "damage", targetId: "dummy", amount: 2 }]), nameOf);
    const finish = entry([{ kind: "death", targetId: "dummy" }], { atSeconds: 0.5 });
    expect(texts(batcher.push(finish, nameOf))).toEqual([
      "degeneration hits Caster dummy for 2",
      "Caster dummy dies",
    ]);
  });

  it("writes no row for a second that sums to nothing", () => {
    const batcher = new StatusTickBatcher();
    const crumb: CombatEvent = { kind: "damage", targetId: "dummy", amount: 0.002 };
    ticks(0, 20, [crumb]).forEach((t) => batcher.push(t, nameOf));
    expect(batcher.advance(1, nameOf)).toEqual([]);
  });

  it("flushes before a divider, so the line comes after the ticks", () => {
    const batcher = new StatusTickBatcher();
    batcher.push(tick(0, [{ kind: "damage", targetId: "dummy", amount: 3 }]), nameOf);
    const rows = [...batcher.flush(0.5, nameOf), dividerRow("re-armed", 0.5)];
    expect(texts(rows)).toEqual(["degeneration hits Caster dummy for 3", "── re-armed ──"]);
  });

  it("never writes a row timed before one already written", () => {
    // Regeneration all the while, a skill hit mid-second, a death, a divider.
    const batcher = new StatusTickBatcher();
    const heal: CombatEvent = { kind: "heal", targetId: "you", amount: 0.2 };
    const hit: CombatEvent = { kind: "damage", targetId: "dummy", amount: 30 };
    const rows: LogRow[] = [];
    for (let i = 0; i < 50; i += 1) {
      const at = i * 0.05;
      rows.push(...batcher.push(tick(at, [heal]), nameOf));
      if (i === 15) {
        rows.push(...batcher.push(entry([hit], { atSeconds: at }), nameOf));
      }
      if (i === 30) {
        const death: CombatEvent = { kind: "death", targetId: "you" };
        rows.push(...batcher.push(tick(at, [death]), nameOf));
      }
      rows.push(...batcher.advance(at, nameOf));
    }
    rows.push(...batcher.flush(2.5, nameOf), dividerRow("reset", 2.5));
    const times = rows.map((row) => row.time);
    expect(rows.length).toBeGreaterThan(4);
    expect(times).toEqual([...times].sort());
  });

  it("passes skill entries straight through", () => {
    const batcher = new StatusTickBatcher();
    const hit: CombatEvent = { kind: "damage", targetId: "dummy", amount: 63.6 };
    expect(texts(batcher.push(entry([hit]), nameOf))).toEqual([
      "Fireball (Pyro) hits Caster dummy for 64",
    ]);
  });
});
