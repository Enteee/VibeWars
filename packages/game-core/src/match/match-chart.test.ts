import { describe, expect, it } from "vitest";

import type { CombatEvent } from "../skills/effects.js";
import { MatchTally, type CombatLogEntry } from "./combat-log.js";
import {
  EVENT_CAPS,
  MatchChart,
  SAMPLE_CAP,
  samplePeriod,
  type MatchChartState,
} from "./match-chart.js";
import type { MatchPhase } from "../match-rules.js";

/** Ann and Bob on team 0, Cat on team 1; team 1's Guild Lord, no member. */
const TEAMS: Readonly<Record<string, number>> = { ann: 0, bob: 0, cat: 1, "guild-lord/1": 1 };
const teamOf = (id: string): number | undefined => TEAMS[id];
const isMember = (id: string): boolean => id !== "guild-lord/1";

const entry = (
  atSeconds: number,
  sourceId: string | undefined,
  events: readonly CombatEvent[],
): CombatLogEntry => ({
  tick: 0,
  atSeconds,
  cause: "skill",
  sourceId,
  skillId: undefined,
  weaponId: undefined,
  attributeId: undefined,
  area: undefined,
  doubleStrike: false,
  events,
});
const damage = (targetId: string, amount: number): CombatEvent => ({
  kind: "damage",
  targetId,
  amount,
  critical: false,
});

interface Body {
  health: number;
  energy: number;
  dead: boolean;
}

/** A match of Ann, Bob and Cat at full health, its clock and its shrines set by hand. */
function fakeMatch(): {
  state: MatchChartState;
  bodies: Map<string, Body>;
  at: (seconds: number, phase?: MatchPhase) => void;
  owners: (number | null)[];
} {
  const bodies = new Map<string, Body>(
    ["ann", "bob", "cat"].map((id) => [id, { health: 500, energy: 25, dead: false }]),
  );
  const owners: (number | null)[] = [null, null];
  let elapsedSeconds = 0;
  let phase: MatchPhase = "active";
  const state: MatchChartState = {
    get elapsedSeconds() {
      return elapsedSeconds;
    },
    get phase() {
      return phase;
    },
    *participants() {
      for (const [id, body] of bodies) {
        yield { id, combatant: { ...body, maxHealth: 500, maxEnergy: 25 } };
      }
    },
    get capturePoints() {
      return owners.map((owner) => ({ owner, capturer: owner, progress: owner === null ? 0 : 1 }));
    },
    stand: undefined,
    altarState: { holder: null, heldSeconds: 0 },
  };
  return {
    state,
    bodies,
    owners,
    at: (seconds, next = "active") => {
      elapsedSeconds = seconds;
      phase = next;
    },
  };
}

describe("MatchChart (#3564)", () => {
  it("samples every 2 s in a 180 s match, every 14 s in a 1680 s Guild Battle", () => {
    expect(samplePeriod(180)).toBe(2);
    expect(samplePeriod(1680)).toBe(14);
    expect(samplePeriod(60)).toBe(1);
  });

  it("ends on the summary's totals, cumulative sample by sample", () => {
    const match = fakeMatch();
    const chart = new MatchChart(teamOf, isMember, 180);
    const tally = new MatchTally(teamOf, isMember);
    for (let second = 1; second <= 9; second += 1) {
      const log = [
        entry(second, "ann", [damage("cat", 10.4), damage("bob", 3)]),
        entry(second, "cat", [damage("ann", 7), { kind: "heal", targetId: "cat", amount: 5 }]),
      ];
      tally.add(log);
      match.at(second, second === 9 ? "finished" : "active");
      chart.add(log, match.state);
    }
    const { players, period } = chart.result(["ann", "bob", "cat"]);
    expect(period).toBe(2);
    // On 2, 4, 6 and 8 s, and the closing one at 9 s.
    expect(players.map(({ dealt }) => dealt.length)).toEqual([5, 5, 5]);
    for (const { id, dealt, taken, healed } of players) {
      const row = tally.row(id);
      expect([dealt.at(-1), taken.at(-1), healed.at(-1)]).toEqual([
        Math.round(row.damage),
        Math.round(row.taken),
        Math.round(row.healing),
      ]);
    }
    const ann = players[0];
    // Damage to Bob, her teammate, is not dealt.
    expect(ann?.dealt).toEqual([21, 42, 62, 83, 94]);
  });

  it("reads health and energy on the boundary, 0 for the dead and the gone", () => {
    const match = fakeMatch();
    const chart = new MatchChart(teamOf, isMember, 180);
    match.at(1);
    chart.add([], match.state);
    match.bodies.set("ann", { health: 250, energy: 5, dead: false });
    match.bodies.set("bob", { health: 0, energy: 25, dead: true });
    match.at(2);
    chart.add([], match.state);
    match.bodies.delete("cat");
    match.at(4);
    chart.add([], match.state);
    const { players } = chart.result(["ann", "bob", "cat", "dan"]);
    expect(players.map(({ id, health, energy }) => [id, health, energy])).toEqual([
      ["ann", [50, 50], [20, 20]],
      ["bob", [0, 0], [0, 0]],
      ["cat", [100, 0], [100, 0]],
      ["dan", [0, 0], [0, 0]],
    ]);
  });

  it("never holds more than SAMPLE_CAP samples; the closing one replaces the last", () => {
    const match = fakeMatch();
    const chart = new MatchChart(teamOf, isMember, 60);
    for (let second = 1; second <= SAMPLE_CAP + 30; second += 1) {
      match.at(second);
      chart.add([], match.state);
    }
    match.bodies.set("ann", { health: 100, energy: 25, dead: false });
    match.at(SAMPLE_CAP + 31, "finished");
    chart.add([], match.state);
    const ann = chart.result(["ann"]).players[0];
    expect(ann?.health).toHaveLength(SAMPLE_CAP);
    expect(ann?.health.at(-1)).toBe(20);
  });

  it("keeps deaths, raisings, interrupts and shrines between members", () => {
    const match = fakeMatch();
    const chart = new MatchChart(teamOf, isMember, 180);
    match.at(3.7);
    match.owners[1] = 1;
    chart.add(
      [
        entry(3.5, "ann", [{ kind: "death", targetId: "cat" }]),
        entry(3.5, "cat", [{ kind: "death", targetId: "guild-lord/1" }]),
        entry(3.6, "guild-lord/1", [{ kind: "death", targetId: "bob" }]),
        entry(3.6, "bob", [
          { kind: "resurrected", targetId: "bob", healthFraction: 0.25, energyFraction: 0.25 },
        ]),
        entry(3.7, "ann", [{ kind: "interrupted", targetId: "cat", skillId: "healing-breeze" }]),
        entry(3.7, "ann", [{ kind: "attack-interrupted", targetId: "cat" }]),
      ],
      match.state,
    );
    expect(chart.result(["ann", "bob", "cat"]).events).toEqual([
      { t: 3, kind: "death", id: "cat", by: "ann" },
      { t: 3, kind: "death", id: "bob", by: null },
      { t: 3, kind: "resurrected", id: "bob" },
      { t: 3, kind: "interrupt", by: "ann", id: "cat", skillId: "healing-breeze" },
      { t: 3, kind: "objective", team: 1, what: "point" },
    ]);
    // Ann gone from the roster: her kill names no killer, her interrupt is no event.
    expect(chart.result(["bob", "cat"]).events.slice(0, 2)).toEqual([
      { t: 3, kind: "death", id: "cat", by: null },
      { t: 3, kind: "death", id: "bob", by: null },
    ]);
  });

  it("caps each kind of event on its own, and counts what passes its cap", () => {
    const match = fakeMatch();
    const chart = new MatchChart(teamOf, isMember, 1800);
    match.at(5);
    const many = (count: number, make: () => CombatLogEntry): CombatLogEntry[] =>
      Array.from({ length: count }, make);
    chart.add(
      many(300, () =>
        entry(5, "ann", [{ kind: "interrupted", targetId: "cat", skillId: "healing-breeze" }]),
      ),
      match.state,
    );
    match.at(1500);
    chart.add(
      many(10, () => entry(1500, "ann", [{ kind: "death", targetId: "cat" }])),
      match.state,
    );
    const late = chart.result(["ann", "bob", "cat"]);
    expect(late.events.filter(({ kind }) => kind === "interrupt")).toHaveLength(
      EVENT_CAPS.interrupt,
    );
    expect(late.events.filter(({ kind }) => kind === "death")).toHaveLength(10);
    expect(late.dropped).toBe(300 - EVENT_CAPS.interrupt);

    chart.add(
      [
        ...many(EVENT_CAPS.death, () => entry(1501, "ann", [{ kind: "death", targetId: "cat" }])),
        ...many(EVENT_CAPS.resurrected + 3, () =>
          entry(1501, "bob", [
            { kind: "resurrected", targetId: "cat", healthFraction: 0.25, energyFraction: 0.25 },
          ]),
        ),
      ],
      match.state,
    );
    const { events, dropped } = chart.result(["ann", "bob", "cat"]);
    expect(events.filter(({ kind }) => kind === "death")).toHaveLength(EVENT_CAPS.death);
    expect(events.filter(({ kind }) => kind === "resurrected")).toHaveLength(
      EVENT_CAPS.resurrected,
    );
    expect(dropped).toBe(300 - EVENT_CAPS.interrupt + 10 + 3);
  });
});
