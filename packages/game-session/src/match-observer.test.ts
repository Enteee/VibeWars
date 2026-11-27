import { ANNIHILATION_MATCH_RULES } from "@vibewars/game-core";
import {
  PROTOCOL_VERSION,
  parseWireSnapshotPart,
  type Channel,
  type PeerObserve,
  type WireEnded,
} from "@vibewars/game-protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HELLO_RESEND_MS, MatchRefusedError, MatchTimeoutError } from "./match-client.js";
import { NO_CALLS, type ConnectionState } from "./match-connection.js";
import { OBSERVER_DELAY_SECONDS, RECONNECT_WINDOW_SECONDS, createMatchHost } from "./match-host.js";
import {
  ARENA,
  TEST_MATCH_ID,
  TICK_SECONDS,
  settle,
  startMatch,
  testSignet,
  type TestMatch,
} from "./match-harness.test-support.js";
import { createMemoryNetwork } from "./memory-transport.js";
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
  "respawns",
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
    ticks = parseWireSnapshotPart(data, 2)?.tick ?? ticks;
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
      const part = channel === "snapshot" ? parseWireSnapshotPart(data, 2) : undefined;
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

  it("take nothing the host sent before `observing`: the end of a match watched before", async () => {
    const { match } = await twoPlayers();
    const transport = match.network.join("viewer");
    await settle();
    const viewing = connectObserver({
      transport,
      hostId: "host",
      matchId: TEST_MATCH_ID,
      timeoutMs: 1000,
    });
    // On its way before the observe was heard, as a draining match's end is.
    const ended: WireEnded = {
      winningTeam: 0,
      endReason: "annihilation",
      summary: [],
      clearSeconds: null,
      teams: [{ players: [] }, { players: [] }],
    };
    match.hostTransport.send("ended", ended, "viewer");
    await settle();
    const viewer = await viewing;

    await match.step(OBSERVER_DELAY_SECONDS + TICK_SECONDS);
    expect(viewer.getSnapshot()?.phase).toBe("active");
  });

  it("are sent the end the delay after the players, and then the match is over to them too", async () => {
    const { match, a } = await twoPlayers(["viewer", "late"], 3);
    const { viewer, transport } = await observe(match, "viewer");
    const ends = record(transport, ["ended"]);
    let lost = false;
    viewer.onConnectionChange(() => {
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

describe("an observe said again (#1805)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is answered by a host whose match listens 3 s after it, and said no more", async () => {
    const network = createMemoryNetwork();
    const hostTransport = network.join("host");
    const transport = network.join("viewer");
    await settle();
    const sent = vi.spyOn(transport, "send");
    const observes = (): number => sent.mock.calls.filter(([type]) => type === "observe").length;
    const viewing = connectObserver({
      transport,
      hostId: "host",
      matchId: TEST_MATCH_ID,
      timeoutMs: 10_000,
    });
    await vi.advanceTimersByTimeAsync(3000);
    createMatchHost({
      transport: hostTransport,
      map: ARENA,
      seed: "test",
      matchRules: ANNIHILATION_MATCH_RULES,
      random: () => 0.5,
      maxPlayers: 8,
      seats: null,
      matchId: TEST_MATCH_ID,
      isSpectator: (peerId) => peerId === "viewer",
      mode: "random-arena",
      publishRecord: () => undefined,
      nowSeconds: () => 0,
      signetOf: testSignet,
      recordReplay: false,
      holdBots: false,
      preMatch: null,
    });
    await vi.advanceTimersByTimeAsync(HELLO_RESEND_MS);
    await viewing;
    const said = observes();
    expect(said).toBe(5);
    await vi.advanceTimersByTimeAsync(5 * HELLO_RESEND_MS);
    expect(observes()).toBe(said);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("is told it observes each time, as one observer", async () => {
    const { match } = await twoPlayers();
    const transport = match.network.join("viewer");
    await settle();
    const heard = record(transport, ["observing"]);
    for (let i = 0; i < 3; i += 1) {
      transport.send(
        "observe",
        { protocolVersion: PROTOCOL_VERSION, matchId: TEST_MATCH_ID },
        "host",
      );
      await settle();
    }
    expect(heard).toHaveLength(3);
  });
});

describe("an observer whose host's peer goes (#4105)", () => {
  const WINDOW_MS = RECONNECT_WINDOW_SECONDS * 1000;

  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A watcher of a two-player match, already shown its first frame, and every state it is told. */
  async function watching() {
    const { match } = await twoPlayers();
    const { viewer, transport } = await observe(match, "viewer");
    await match.step(OBSERVER_DELAY_SECONDS + TICK_SECONDS);
    expect(viewer.getSnapshot()).toBeDefined();
    const states: ConnectionState[] = [];
    viewer.onConnectionChange((state) => {
      states.push(state);
    });
    const sent = vi.spyOn(transport, "send");
    const observes = (): number => sent.mock.calls.filter(([type]) => type === "observe").length;
    return { match, viewer, states, observes };
  }

  it("keeps its last frame, says the observe again when the host is back in the window, and watches on", async () => {
    const { match, viewer, states, observes } = await watching();
    const before = viewer.getSnapshot()?.elapsedSeconds ?? 0;

    match.network.partition("viewer", "host");
    await settle();
    expect(states).toEqual(["reconnecting"]);
    await match.step(5);
    vi.advanceTimersByTime(WINDOW_MS - 1000);
    expect(viewer.getSnapshot()?.elapsedSeconds).toBe(before);

    match.network.heal();
    await settle();
    expect(observes()).toBe(1);
    expect(states).toEqual(["reconnecting", "online"]);
    // Answered: said no more.
    vi.advanceTimersByTime(5 * HELLO_RESEND_MS);
    expect(observes()).toBe(1);

    // The host let go of it as it went, so the delay fills again first.
    await match.step(OBSERVER_DELAY_SECONDS + TICK_SECONDS);
    expect(viewer.getSnapshot()?.elapsedSeconds).toBeGreaterThan(before + 5);
  });

  it("watches on when only the host saw it go and come back (#4139)", async () => {
    const { match, viewer, states, observes } = await watching();
    const before = viewer.getSnapshot()?.elapsedSeconds ?? 0;

    // A page frozen past the transport's timeout, which never saw the host go.
    match.network.blip("host", "viewer");
    await settle();
    expect(states).toEqual([]);
    expect(observes()).toBe(0);

    // Taken back as it was: the delay fills again, and the stream runs on.
    await match.step(OBSERVER_DELAY_SECONDS + TICK_SECONDS);
    expect(viewer.getSnapshot()?.elapsedSeconds).toBeGreaterThan(before + 5);
  });

  it("is not taken back once the lobby has it as a spectator no more (#4139)", async () => {
    const spectators = ["viewer"];
    const { match } = await twoPlayers(spectators);
    const { viewer } = await observe(match, "viewer");
    await match.step(OBSERVER_DELAY_SECONDS + TICK_SECONDS);
    const before = viewer.getSnapshot()?.elapsedSeconds ?? 0;

    spectators.length = 0;
    match.network.blip("host", "viewer");
    await settle();
    await match.step(OBSERVER_DELAY_SECONDS + TICK_SECONDS);
    expect(viewer.getSnapshot()?.elapsedSeconds).toBe(before);
  });

  it("says one observe at a time however often the host flaps", async () => {
    const { match, states, observes } = await watching();
    match.network.stall("viewer", "host");
    await settle();
    match.network.blip("viewer", "host");
    match.network.blip("viewer", "host");
    await settle();
    // One said each time it is heard again, and no resend left running.
    expect(states).toEqual(["reconnecting", "online"]);
    expect(observes()).toBe(2);
    vi.advanceTimersByTime(5 * HELLO_RESEND_MS);
    expect(observes()).toBe(2);
  });

  it("is lost when the window runs out with no host", async () => {
    const { match, states, observes } = await watching();
    match.network.partition("viewer", "host");
    await settle();
    vi.advanceTimersByTime(WINDOW_MS);
    expect(states).toEqual(["reconnecting", "lost"]);

    // Back too late: nothing more is said.
    match.network.heal();
    await settle();
    expect(observes()).toBe(0);
    expect(states).toEqual(["reconnecting", "lost"]);
  });

  it("still watches when the host goes and comes back before `observing`, said again at once (#4115)", async () => {
    const { match } = await twoPlayers();
    const transport = match.network.join("viewer");
    await settle();
    const sent = vi.spyOn(transport, "send");
    const observes = (): number => sent.mock.calls.filter(([type]) => type === "observe").length;
    let failed: unknown;
    const viewing = connectObserver({
      transport,
      hostId: "host",
      matchId: TEST_MATCH_ID,
      timeoutMs: 10_000,
    });
    viewing.catch((error: unknown) => {
      failed = error;
    });
    match.network.partition("viewer", "host");
    await settle();
    vi.advanceTimersByTime(HELLO_RESEND_MS);
    await settle();
    expect(failed).toBeUndefined();

    const said = observes();
    match.network.heal();
    await settle();
    expect(observes()).toBe(said + 1);
    const viewer = await viewing;
    expect(viewer.delaySeconds).toBe(OBSERVER_DELAY_SECONDS);
    // Answered: said no more.
    vi.advanceTimersByTime(5 * HELLO_RESEND_MS);
    expect(observes()).toBe(said + 1);
  });

  it("times out, not fails at once, when the host goes before `observing` and stays gone (#4115)", async () => {
    const { match } = await twoPlayers();
    const transport = match.network.join("viewer");
    await settle();
    let failed: unknown;
    const viewing = connectObserver({
      transport,
      hostId: "host",
      matchId: TEST_MATCH_ID,
      timeoutMs: 10_000,
    });
    viewing.catch((error: unknown) => {
      failed = error;
    });
    match.network.partition("viewer", "host");
    await settle();
    vi.advanceTimersByTime(10_000 - 1);
    await settle();
    expect(failed).toBeUndefined();
    vi.advanceTimersByTime(1);
    await settle();
    expect(failed).toBeInstanceOf(MatchTimeoutError);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("is lost at once, mid-drop too, to an end that says the host left", async () => {
    const { match, states } = await watching();
    match.network.stall("viewer", "host");
    await settle();
    const ended: WireEnded = {
      winningTeam: null,
      endReason: "host-left",
      summary: [],
      clearSeconds: null,
      teams: [{ players: [] }, { players: [] }],
    };
    match.hostTransport.send("ended", ended, "viewer");
    await settle();
    expect(states).toEqual(["reconnecting", "host-left"]);
    vi.advanceTimersByTime(WINDOW_MS);
    expect(states).toEqual(["reconnecting", "host-left"]);
  });
});
