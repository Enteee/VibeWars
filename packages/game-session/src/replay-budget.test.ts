import {
  GUILD_BATTLE_MATCH_RULES,
  HALLS_MATCH_RULES,
  KILL_COUNT_MATCH_RULES,
  MATCH_MODES,
} from "@vibewars/game-core";
import { MAX_LOBBY_PLAYERS } from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import { MESSAGES_PER_SECOND } from "./intent-budget.js";
import {
  REPLAY_CHARS_PER_INPUT,
  REPLAY_INPUTS_PER_SEAT_SECOND,
  REPLAY_RESERVE_CHARS,
  ReplayBudget,
} from "./replay-budget.js";
import { MAX_REPLAY_CHARS } from "./replay.js";

/** How many characters one slot gets in, sending `chars` an input `perSecond` times a second for `seconds`. */
function admitted(budget: ReplayBudget, chars: number, perSecond: number, seconds: number): number {
  let total = 0;
  for (let sent = 0; sent < perSecond * seconds; sent += 1) {
    if (budget.take("flood", chars, sent / perSecond)) {
      total += chars;
    }
  }
  return total;
}

describe("a match's replay budget (#3572)", () => {
  it("keeps every slot flooding at the full message rate, past the time limit, within the cap", () => {
    const rules = [...Object.values(MATCH_MODES), ...Object.values(HALLS_MATCH_RULES)];
    for (const { timeLimitSeconds } of rules) {
      for (const slots of [1, 2, 16, MAX_LOBBY_PLAYERS]) {
        const budget = new ReplayBudget(slots, timeLimitSeconds);
        // Long inputs, at the most the host handles, for longer than the match.
        const spent = admitted(budget, 1000, MESSAGES_PER_SECOND, timeLimitSeconds + 60);
        expect(slots * spent + REPLAY_RESERVE_CHARS).toBeLessThanOrEqual(MAX_REPLAY_CHARS);
      }
    }
  });

  it("never runs out for a busy player of a full Guild Battle", () => {
    // Nine inputs a second for the whole 28 minutes, and on top of it a
    // twenty-second fight at 25 a second, as the host's busiest player
    // sends (perf-sec-qa on #3592).
    const budget = new ReplayBudget(16, GUILD_BATTLE_MATCH_RULES.timeLimitSeconds);
    const seconds = GUILD_BATTLE_MATCH_RULES.timeLimitSeconds;
    let refused = 0;
    for (let second = 0; second < seconds; second += 1) {
      const inputs = second >= 600 && second < 620 ? 25 : 9;
      for (let i = 0; i < inputs; i += 1) {
        if (!budget.take("busy", REPLAY_CHARS_PER_INPUT, second + i / inputs)) {
          refused += 1;
        }
      }
    }
    expect(REPLAY_INPUTS_PER_SEAT_SECOND).toBe(10);
    expect(refused).toBe(0);
  });

  it("keeps recording a steady player deep into sudden death, and stops a flooder at its share (#4069)", () => {
    const { timeLimitSeconds } = KILL_COUNT_MATCH_RULES;
    const budget = new ReplayBudget(8, timeLimitSeconds);
    // Three inputs a second through the clock and two hours of sudden death.
    const seconds = timeLimitSeconds + 7200;
    let refused = 0;
    for (let sent = 0; sent < 3 * seconds; sent += 1) {
      if (!budget.take("steady", REPLAY_CHARS_PER_INPUT, sent / 3)) {
        refused += 1;
      }
    }
    expect(refused).toBe(0);
    // The full message rate, for as long, overruns at its share.
    const share = (MAX_REPLAY_CHARS - REPLAY_RESERVE_CHARS) / 8;
    const spent = admitted(budget, 1000, MESSAGES_PER_SECOND, seconds);
    expect(spent).toBeLessThanOrEqual(share);
    expect(spent).toBeGreaterThan(share - 1000);
  });

  it("refuses what a slot cannot pay for and spends nothing on it", () => {
    const budget = new ReplayBudget(1, 60);
    expect(budget.take("a", 40_000, 0)).toBe(false);
    expect(budget.take("a", 32_000, 0)).toBe(true);
    expect(budget.take("a", 1, 0)).toBe(false);
    // Another slot has its own share.
    expect(budget.take("b", 32_000, 0)).toBe(true);
  });
});
