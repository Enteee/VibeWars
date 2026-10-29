import { ANNIHILATION_MATCH_RULES } from "@vibewars/game-core";
import {
  PROTOCOL_VERSION,
  parseWireSnapshotPart,
  type Channel,
  type PeerObserve,
} from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import { MatchRefusedError } from "./match-client.js";
import { NO_CALLS } from "./match-connection.js";
import { OBSERVER_DELAY_SECONDS } from "./match-host.js";
import {
  TEST_MATCH_ID,
  TICK_SECONDS,
  settle,
  startMatch,
  type TestMatch,
} from "./match-harness.test-support.js";
import { connectObserver, type ObserverConnection } from "./match-observer.js";
import type { Transport } from "./transport.js";

/**
 * A lobby spectator watching the match (#480): everything a player is
 * sent, `OBSERVER_DELAY_SECONDS` late, and nothing a seat alone is sent.
 */

/** What only a seat, or its team, is ever sent. */
const HIDDEN: readonly Channel[] = [
  "welcome",
  "skill-bar",
  "weapon-sets",
  "recharge",
  "adrenaline",
  "chain",
  "calls",
  "traps",
  "refused",
];

/** The ticks a delay spans. */
const DELAY_TICKS = Math.round(OBSERVER_DELAY_SECONDS / TICK_SECONDS);

/** The tick a player was last sent: the host's, live. */
let ticks = 0;

/** Every message `transport` hears from the host on `channels`, with the live tick then. */
function record(
  transport: Transport,
  channels: readonly Channel[],
): { channel: Channel; data: unknown; at: number }[] {
  const heard: { channel: Channel; data: unknown; at: number }[] = [];
  for (const channel of channels) {
    transport.on(channel, (data, from) => {
      if (from === "host") {
        heard.push({ channel, data, at: ticks });
      }
    });
  }
  return heard;
}

/** A match of two players, with `spectators` in the room on no team. */
async function twoPlayers(spectators: readonly string[] = ["viewer"], timeLimitSeconds = 480) {
  ticks = 0;
  const match = startMatch({
    spectators,
    matchRules: { ...ANNIHILATION_MATCH_RULES, timeLimitSeconds },
  });
  const a = await match.join();
  const b = await match.join();
  // Counted from what a player is sent: the tick it was played on.
  a.transport.on("snapshot", (data) => {
    ticks = parseWireSnapshotPart(data)?.tick ?? ticks;
  });
  return { match, a, b };
}

async function observe(
  match: TestMatch,
  peerId: string,
  matchId = TEST_MATCH_ID,
): Promise<{ viewer: ObserverConnection; transport: Transport }> {
  const transport = match.network.join(peerId);
  await settle();
  const viewing = connectObserver({ transport, hostId: "host", matchId, timeoutMs: 1000 });
  await settle();
  return { viewer: await viewing, transport };
}

describe("a match's observers (#480)", () => {
  it("are sent their first snapshot once the delay has passed: the match as it stood then", async () => {
    const { match, a } = await twoPlayers();
    const { viewer } = await observe(match, "viewer");
    expect(viewer.delaySeconds).toBe(OBSERVER_DELAY_SECONDS);
    expect(viewer.map.id).toBe("test-arena");

    // The tick after it said observe is the first it is sent, the delay later.
    await match.step(OBSERVER_DELAY_SECONDS);
    expect(viewer.getSnapshot()).toBeUndefined();
    await match.step(TICK_SECONDS);
    const seen = viewer.getSnapshot();
    expect(seen).toBeDefined();
    expect(seen?.players).toHaveLength(2);
    const live = a.connection.getSnapshot().elapsedSeconds;
    expect(live - (seen?.elapsedSeconds ?? 0)).toBeCloseTo(OBSERVER_DELAY_SECONDS, 6);

    await match.step(3);
    const later = a.connection.getSnapshot().elapsedSeconds;
    expect(later - (viewer.getSnapshot()?.elapsedSeconds ?? 0)).toBeCloseTo(
      OBSERVER_DELAY_SECONDS,
      6,
    );
  });

  it("hear nothing of the match live, nor does a spectator who does not watch; a player hears every tick", async () => {
    const { match } = await twoPlayers(["viewer", "lurker"]);
    const lurker = match.network.join("lurker");
    const lurked = record(lurker, ["snapshot", "combat", "ended"]);
    const viewing = match.network.join("viewer");
    const viewed = record(viewing, ["snapshot", "combat", "ended"]);
    await settle();
    void connectObserver({
      transport: viewing,
      hostId: "host",
      matchId: TEST_MATCH_ID,
      timeoutMs: 1000,
    });
    await settle();
    const before = ticks;

    await match.step(OBSERVER_DELAY_SECONDS + 2);

    expect(lurked).toEqual([]);
    const snapshots = viewed.flatMap(({ channel, data, at }) => {
      const part = channel === "snapshot" ? parseWireSnapshotPart(data) : undefined;
      return part === undefined ? [] : [{ tick: part.tick, at }];
    });
    expect(snapshots.length).toBeGreaterThan(0);
    for (const { tick, at } of snapshots) {
      expect(at - tick).toBe(DELAY_TICKS);
    }
    // Every tick, from the first it watched.
    expect(snapshots[0]?.tick).toBe(before + 1);
    expect(snapshots.at(-1)?.tick).toBe(ticks - DELAY_TICKS);
  });

  it("move nothing in the match, and are sent nothing of a seat's own", async () => {
    const { match, a, b } = await twoPlayers();
    const viewing = match.network.join("viewer");
    const hidden = record(viewing, HIDDEN);
    await settle();
    const connecting = connectObserver({
      transport: viewing,
      hostId: "host",
      matchId: TEST_MATCH_ID,
      timeoutMs: 1000,
    });
    await settle();
    const viewer = await connecting;
    await match.step(1);
    const where = (): string =>
      JSON.stringify(
        a.connection.getSnapshot().players.map(({ sessionId, x, y, targetSessionId }) => ({
          sessionId,
          x,
          y,
          targetSessionId,
        })),
      );
    const still = where();

    viewing.send("intent", { kind: "move", dirX: 1, dirY: 0 }, "host");
    viewing.send("intent", { kind: "target", targetSessionId: b.connection.selfSessionId }, "host");
    viewing.send("call", { kind: "target", targetId: b.connection.selfSessionId }, "host");
    viewing.send("call", { kind: "ping", x: 500, y: 500 }, "host");
    await match.step(1);

    expect(where()).toBe(still);
    expect(a.connection.getCalls()).toEqual(NO_CALLS);
    expect(b.connection.getCalls()).toEqual(NO_CALLS);
    await match.step(OBSERVER_DELAY_SECONDS);
    expect(viewer.getSnapshot()).toBeDefined();
    expect(hidden).toEqual([]);
  });

  it("are a spectator the lobby has on no team, of the match being played", async () => {
    const { match, a } = await twoPlayers(["viewer"]);
    const refusal = async (transport: Transport, matchId = TEST_MATCH_ID): Promise<unknown> =>
      connectObserver({ transport, hostId: "host", matchId, timeoutMs: 1000 }).then(
        () => undefined,
        (error: unknown) => (error instanceof MatchRefusedError ? error.reason : error),
      );

    expect(await refusal(a.transport)).toBe("not-a-spectator");
    const stranger = match.network.join("stranger");
    await settle();
    expect(await refusal(stranger)).toBe("not-a-spectator");
    const viewer = match.network.join("viewer");
    await settle();
    expect(await refusal(viewer, "match-0")).toBe("wrong-match");
  });

  it("refuse a client of another version", async () => {
    const { match } = await twoPlayers();
    const viewer = match.network.join("viewer");
    const refusals: unknown[] = [];
    viewer.on("refuse", (data) => refusals.push(data));
    await settle();
    const stale: PeerObserve = {
      protocolVersion: `${PROTOCOL_VERSION}-old`,
      matchId: TEST_MATCH_ID,
    };
    viewer.send("observe", stale, "host");
    await settle();
    expect(refusals).toMatchObject([{ reason: "protocol-mismatch" }]);
  });

  it("are sent the end the delay after the players, and then the match is over to them too", async () => {
    const { match, a } = await twoPlayers(["viewer", "late"], 3);
    const { viewer, transport } = await observe(match, "viewer");
    const ends = record(transport, ["ended"]);
    let lost = false;
    viewer.onLost(() => {
      lost = true;
    });

    // Played to its last tick, and not one past it.
    while (match.host.phase === "active") {
      await match.step(TICK_SECONDS);
    }
    expect(a.connection.getSnapshot().phase).toBe("finished");
    expect(match.host.phase).toBe("finished");
    expect(match.host.draining).toBe(true);
    // Still in time to catch the end, from the oldest tick held.
    const late = await observe(match, "late");

    await match.step(OBSERVER_DELAY_SECONDS - TICK_SECONDS);
    expect(ends).toEqual([]);
    expect(viewer.getSnapshot()?.phase).toBe("active");
    await match.step(TICK_SECONDS);
    expect(ends).toHaveLength(1);
    expect(viewer.getSnapshot()).toMatchObject({
      phase: "finished",
      endReason: a.connection.getSnapshot().endReason,
      winningTeam: a.connection.getSnapshot().winningTeam,
    });
    expect(viewer.getSnapshot()?.summary).toHaveLength(2);
    expect(late.viewer.getSnapshot()?.phase).toBe("finished");
    expect(match.host.draining).toBe(false);
    expect(lost).toBe(false);

    // Asking again, now the end has gone out.
    await expect(
      connectObserver({ transport, hostId: "host", matchId: TEST_MATCH_ID, timeoutMs: 1000 }),
    ).rejects.toMatchObject({ reason: "match-over" });
  });

  it("hold the match back only while one watches: a late one, or one after the last left, waits the whole delay", async () => {
    const { match } = await twoPlayers(["viewer", "again"]);
    await match.step(OBSERVER_DELAY_SECONDS + 5);
    const { viewer } = await observe(match, "viewer");
    await match.step(OBSERVER_DELAY_SECONDS);
    expect(viewer.getSnapshot()).toBeUndefined();
    await match.step(TICK_SECONDS);
    expect(viewer.getSnapshot()).toBeDefined();

    // Gone by its goodbye: what it held goes with it.
    await viewer.disconnect();
    await match.step(OBSERVER_DELAY_SECONDS);
    const again = await observe(match, "again");
    await match.step(OBSERVER_DELAY_SECONDS);
    expect(again.viewer.getSnapshot()).toBeUndefined();
    await match.step(TICK_SECONDS);
    expect(again.viewer.getSnapshot()).toBeDefined();
  });
});
