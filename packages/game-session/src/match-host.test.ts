import { describe, expect, it } from "vitest";

import { RULESET } from "./match-host.js";
import { ARENA, self, startMatch } from "./match-harness.test-support.js";

describe("a P2P match (#375)", () => {
  it("seats remote players and the host's own, and moves them", async () => {
    const match = startMatch();
    const local = await match.joinLocal();
    const { connection: remote } = await match.join();
    await match.step(0.05);
    expect(
      local
        .getSnapshot()
        .players.map((p) => p.sessionId)
        .sort(),
    ).toEqual([local.selfSessionId, remote.selfSessionId].sort());
    expect(self(local)?.team).not.toBe(self(remote)?.team);
    expect(self(local)?.x).toBe(ARENA.spawns[0]?.position.x);

    remote.sendIntent({ kind: "move", dirX: 1, dirY: 0 });
    await match.step(0.5);
    const moved = (self(remote)?.x ?? 0) - (ARENA.spawns[1]?.position.x ?? 0);
    expect(moved).toBeGreaterThan(RULESET.movement.maxSpeedUnitsPerSecond * 0.3);
  });
});
