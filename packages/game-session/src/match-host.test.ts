import { StatusSet, type ActiveStatus } from "@vibewars/game-core";
import { MAX_WIRE_STATUSES } from "@vibewars/game-protocol";
import { describe, expect, it, vi } from "vitest";

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

  it("ticks nothing more once the host has closed it", async () => {
    const match = startMatch();
    await match.step(0.05);

    await match.host.close("host-left");
    const send = vi.spyOn(match.hostTransport, "send");
    await match.step(1);

    expect(match.host.phase).toBe("finished");
    expect(send).not.toHaveBeenCalled();
  });

  it("sends at most 32 statuses a player, so 33 freeze no guest (#636)", async () => {
    const match = startMatch();
    const { connection: remote } = await match.join();
    await match.step(0.05);
    const many: ActiveStatus[] = Array.from({ length: MAX_WIRE_STATUSES + 1 }, (_, i) => ({
      id: i % 2 === 0 ? "burning" : "regeneration",
      remainingSeconds: i,
      durationSeconds: MAX_WIRE_STATUSES + 1,
      attacksLeft: undefined,
      spellsLeft: undefined,
      sourceId: remote.selfSessionId,
      outbreak: null,
      maintained: null,
    }));
    vi.spyOn(StatusSet.prototype, "active", "get").mockReturnValue(many);
    const before = remote.getSnapshot().elapsedSeconds;

    await match.step(0.5);

    expect(remote.getSnapshot().elapsedSeconds).toBeGreaterThan(before);
    expect(self(remote)?.statuses).toHaveLength(MAX_WIRE_STATUSES);
    vi.restoreAllMocks();
  });

  it("sends each status with its end on the match clock, its length and its caster (#803)", async () => {
    const match = startMatch();
    const { connection: remote } = await match.join();
    await match.step(0.05);
    const bleeding: ActiveStatus = {
      id: "bleeding",
      remainingSeconds: 5.25,
      durationSeconds: 8,
      attacksLeft: undefined,
      spellsLeft: undefined,
      sourceId: "foe",
      outbreak: null,
      maintained: null,
    };
    vi.spyOn(StatusSet.prototype, "active", "get").mockReturnValue([bleeding]);

    await match.step(0.5);

    const snapshot = remote.getSnapshot();
    const [sent] = self(remote)?.statuses ?? [];
    expect(sent).toMatchObject({ id: "bleeding", durationSeconds: 8, casterId: "foe" });
    // To 0.1 s: on 20 Hz ticks, the rounding is off by 0 or exactly 0.05.
    expect(Math.abs((sent?.endsAt ?? 0) - snapshot.elapsedSeconds - 5.25)).toBeLessThan(0.051);
    vi.restoreAllMocks();
  });
});
