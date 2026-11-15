import {
  ANNIHILATION_MATCH_RULES,
  KILL_COUNT_MATCH_RULES,
  MatchSimulation,
  type MatchRules,
} from "@vibewars/game-core";
import { parseWireRespawns, type WireRespawns } from "@vibewars/game-protocol";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PeerMatchConnection } from "./match-client.js";
import {
  TICK_SECONDS,
  playerIn,
  self,
  startMatch,
  type TestMatch,
} from "./match-harness.test-support.js";

/**
 * When the dead come back, through the host (#3367): hidden information,
 * so a team's respawns reach that team's peers alone, on a channel of
 * their own, and never a snapshot.
 */

interface Player {
  readonly connection: PeerMatchConnection;
  /** Every `respawns` message this peer was sent. */
  readonly heard: WireRespawns[];
}

async function joinListening(match: TestMatch): Promise<Player> {
  const { connection, transport } = await match.join();
  const heard: WireRespawns[] = [];
  transport.on("respawns", (data) => {
    const respawns = parseWireRespawns(data);
    if (respawns !== undefined) {
      heard.push(respawns);
    }
  });
  return { connection, heard };
}

/**
 * Three players under `rules`, seated in turn: a and c on team 0, b on
 * team 1; then a dies, at full health but for one point.
 */
async function aDies(rules: MatchRules) {
  // The host's simulation, as the first step it takes sees it.
  const steps = vi.spyOn(MatchSimulation.prototype, "step");
  const match = startMatch({ matchRules: rules });
  const a = await joinListening(match);
  const b = await joinListening(match);
  const c = await joinListening(match);
  await match.step(TICK_SECONDS);
  const sim = steps.mock.contexts[0] as MatchSimulation | undefined;
  const victim = sim?.get(a.connection.selfSessionId);
  if (victim === undefined) {
    throw new Error("a is not in the match");
  }
  victim.combatant.health = 1;
  victim.combatant.statuses.apply("bleeding", 10, b.connection.selfSessionId, new Map());
  for (let i = 0; i < 100 && self(a.connection)?.dead !== true; i += 1) {
    await match.step(TICK_SECONDS);
  }
  return { match, a, b, c };
}

/** What `seer` is told of `of`'s respawn now. */
function respawnOf(seer: Player, of: Player): number | null | undefined {
  return playerIn(seer.connection.getSnapshot(), of.connection.selfSessionId)?.respawnIn;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("respawns through the P2P host (#3367)", () => {
  it("counts a dead body down to its team, 5 to 1, and never tells a foe", async () => {
    const { match, a, b, c } = await aDies({ ...KILL_COUNT_MATCH_RULES, respawnSeconds: 5 });
    expect(self(a.connection)?.dead).toBe(true);
    const counted: (number | null | undefined)[] = [];
    for (let i = 0; i < 200 && self(a.connection)?.dead === true; i += 1) {
      const own = respawnOf(a, a);
      if (own !== counted.at(-1)) {
        counted.push(own);
      }
      expect(respawnOf(c, a)).toBe(own);
      expect(respawnOf(b, a)).toBeUndefined();
      await match.step(TICK_SECONDS);
    }
    expect(counted).toEqual([5, 4, 3, 2, 1]);
    // Back, and alive: nothing to count.
    expect(self(a.connection)?.dead).toBe(false);
    expect(respawnOf(a, a)).toBeUndefined();
    expect(respawnOf(c, a)).toBeUndefined();
    // Not only not shown: never sent.
    expect(b.heard.every(({ respawns }) => respawns.length === 0)).toBe(true);
    expect(c.heard.some(({ respawns }) => respawns.length > 0)).toBe(true);
  });

  it("sends a dead body that will not respawn as null", async () => {
    const { a, b, c } = await aDies(ANNIHILATION_MATCH_RULES);
    expect(respawnOf(a, a)).toBeNull();
    expect(respawnOf(c, a)).toBeNull();
    expect(respawnOf(b, a)).toBeUndefined();
  });

  it("sends nothing for the living", async () => {
    const match = startMatch({ matchRules: KILL_COUNT_MATCH_RULES });
    const a = await joinListening(match);
    const b = await joinListening(match);
    await match.step(1);
    expect(respawnOf(a, a)).toBeUndefined();
    expect(respawnOf(a, b)).toBeUndefined();
    expect([...a.heard, ...b.heard].every(({ respawns }) => respawns.length === 0)).toBe(true);
  });
});
