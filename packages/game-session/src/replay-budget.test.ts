import { GUILD_BATTLE_MATCH_RULES, HALLS_MATCH_RULES, MATCH_MODES } from "@vibewars/game-core";
import { MAX_LOBBY_PLAYERS } from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import { MESSAGES_PER_SECOND } from "./intent-budget.js";
import { REPLAY_RESERVE_CHARS, ReplayBudget } from "./replay-budget.js";
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

  it("never refuses a busy player of a full Guild Battle", () => {
    // An input a second for the whole 28 minutes, as a busy GW1 player
    // sends, and on top of it a two-minute fight at three a second.
    const budget = new ReplayBudget(16, GUILD_BATTLE_MATCH_RULES.timeLimitSeconds);
    const seconds = GUILD_BATTLE_MATCH_RULES.timeLimitSeconds;
    let refused = 0;
    for (let second = 0; second < seconds; second += 1) {
      const inputs = second >= 600 && second < 720 ? 3 : 1;
      for (let i = 0; i < inputs; i += 1) {
        // A move at any angle is about 100 characters.
        if (!budget.take("busy", 100, second + i / inputs)) {
          refused += 1;
        }
      }
    }
    expect(refused).toBe(0);
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
