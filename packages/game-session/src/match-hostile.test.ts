import { HOUSE_LOADOUT, defaultBuildEquipment } from "@vibewars/game-core";
import { PROTOCOL_VERSION, type JsonValue } from "@vibewars/game-protocol";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MESSAGE_BURST } from "./intent-budget.js";
import { MatchRefusedError, type PeerMatchConnection } from "./match-client.js";
import { RECONNECT_WINDOW_SECONDS, RULESET } from "./match-host.js";
import {
  hello,
  playerIn,
  self,
  settle,
  startMatch,
  type TestMatch,
} from "./match-harness.test-support.js";
import type { Transport } from "./transport.js";

/**
 * A P2P host against hostile and unlucky peers (#375): the match half of
 * the server's `network-robustness.test.ts` and `fuzz.test.ts`, run
 * through the host and client instead of a Colyseus room.
 *
 * The rule is the server's: the host must never fall over, or let one
 * peer spoil the match for the rest, whatever a peer sends. A peer here
 * is anyone who found the room, so every message is a stranger's.
 *
 * No wall clock: the match moves only when a test steps it, so a burst
 * "at once" really is at one match time, and the budget's refill is
 * exact rather than scheduling-dependent.
 */

/**
 * Values chosen to break naive parsers: the server's corpus, less
 * `undefined`, which no JSON transport can carry.
 */
function hostileValues(): JsonValue[] {
  return [
    null,
    0,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.MAX_SAFE_INTEGER,
    "",
    "   ",
    "0",
    "null",
    "[]",
    "\u0000",
    "x".repeat(500),
    true,
    false,
    [],
    [1, 2, 3],
    {},
    { kind: "move" },
    { kind: "move", dirX: "1", dirY: "1" },
    { kind: "move", dirX: Number.NaN, dirY: 0 },
    { kind: "move", dirX: 1e308, dirY: 1e308 },
    { kind: "target" },
    { kind: "target", targetSessionId: 42 },
    { kind: "use-skill" },
    { kind: "use-skill", slot: -1 },
    { kind: "use-skill", slot: 1.5 },
    { kind: "use-skill", slot: Number.MAX_SAFE_INTEGER },
    { kind: "use-skill", slot: "0" },
    { kind: "__proto__" },
    { kind: "constructor" },
    { kind: "move", dirX: 1, dirY: 0, extra: { deeply: { nested: "junk" } } },
  ];
}

/** The slot of the house bar's self-cast enchantment, Armor of Earth: no target needed. */
const SELF_ENCHANT_SLOT = 4;

const SPEED = RULESET.movement.maxSpeedUnitsPerSecond;

/** One tick of match time. */
const TICK = 1 / RULESET.tickRateHz;

/** A watcher and a second player in one match, both seated and seen. */
async function twoInAMatch(match: TestMatch): Promise<{
  watcher: PeerMatchConnection;
  other: PeerMatchConnection;
  otherTransport: Transport;
}> {
  const { connection: watcher } = await match.join();
  const { connection: other, transport: otherTransport } = await match.join();
  await match.step(TICK);
  expect(playerIn(watcher.getSnapshot(), other.selfSessionId)).toBeDefined();
  return { watcher, other, otherTransport };
}

/**
 * Whether the host still acts on `client`: it targets itself, and
 * `watcher` sees it. A target is mirrored at once and no wall can get in
 * its way, and no enemy skill picks yourself for you, so only this
 * intent can put it there. The intent lands before the tick, at the
 * same match time as anything sent just before it.
 */
async function listensTo(
  match: TestMatch,
  watcher: PeerMatchConnection,
  client: PeerMatchConnection,
): Promise<boolean> {
  client.sendIntent({ kind: "target", targetSessionId: client.selfSessionId });
  await settle();
  await match.step(TICK);
  const listened =
    playerIn(watcher.getSnapshot(), client.selfSessionId)?.targetSessionId === client.selfSessionId;
  client.sendIntent({ kind: "target", targetSessionId: null });
  await settle();
  return listened;
}

/** The error `promise` rejects with; fails the test if it resolves. */
async function refusal(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error: unknown) {
    return error;
  }
  throw new Error("expected the join to be refused");
}

describe("P2P match robustness (#375)", () => {
  it("treats a duplicated movement intent as one instruction", async () => {
    const match = startMatch();
    const { connection } = await match.join();
    await match.step(TICK);
    const startX = self(connection)?.x ?? Number.NaN;
    expect(startX).not.toBeNaN();

    // The same intent 50 times. A duplicate must not stack into 50 times
    // the speed: a laggy client that retries is not asking to move faster.
    for (let i = 0; i < 50; i += 1) {
      connection.sendIntent({ kind: "move", dirX: 1, dirY: 0 });
    }
    await settle();
    await match.step(0.5);
    connection.sendIntent({ kind: "stop" });
    await settle();
    await match.step(0.2);

    const travelled = (self(connection)?.x ?? Number.NaN) - startX;
    // Half a second at full speed, and no more: no scheduling slack needed.
    expect(travelled).toBeGreaterThan(0);
    expect(travelled).toBeLessThanOrEqual(SPEED * 0.5 + 1e-6);
  });

  it("charges a duplicated skill request once", async () => {
    const match = startMatch();
    const { connection } = await match.join();
    await match.step(TICK);
    const before = self(connection)?.energy ?? 0;
    expect(before).toBeGreaterThan(0);

    // Sent ten times: the cast gate must reject the repeats as "already
    // casting" or "still recharging" rather than bill for each one.
    for (let i = 0; i < 10; i += 1) {
      connection.sendIntent({ kind: "use-skill", slot: SELF_ENCHANT_SLOT });
    }
    await settle();
    await match.step(1.5);

    // The enchantment landing proves a cast resolved; without it the
    // energy check would pass with nothing cast at all.
    expect(self(connection)?.statuses.length ?? 0).toBeGreaterThan(0);
    const after = self(connection)?.energy ?? 0;
    // One cast of a 10-energy skill, less regen. Ten would be 100.
    expect(before - after).toBeGreaterThan(0);
    expect(before - after).toBeLessThanOrEqual(10);
  });

  it("handles a burst of delayed input without losing the final state", async () => {
    const match = startMatch();
    const { connection } = await match.join();
    await match.step(TICK);

    // A stalled connection recovering: a pile of intents at once. The
    // last must win, not leave the player walking a way they abandoned.
    connection.sendIntent({ kind: "move", dirX: 1, dirY: 0 });
    connection.sendIntent({ kind: "move", dirX: 0, dirY: 1 });
    connection.sendIntent({ kind: "move", dirX: -1, dirY: 0 });
    connection.sendIntent({ kind: "stop" });
    await settle();
    await match.step(0.4);
    const x = self(connection)?.x ?? Number.NaN;
    const y = self(connection)?.y ?? Number.NaN;

    await match.step(0.4);
    expect(self(connection)?.x).toBeCloseTo(x, 1);
    expect(self(connection)?.y).toBeCloseTo(y, 1);
  });

  it("lets a player join a match that is already running", async () => {
    const match = startMatch();
    const { connection: first } = await match.join();
    await match.step(0.8);

    const { connection: late } = await match.join();
    await match.step(TICK);

    // A real, alive participant: not a spectator, not a ghost.
    expect(late.getSnapshot().players).toHaveLength(2);
    expect(self(late)?.health).toBeGreaterThan(0);
    // And the player already there sees them too.
    expect(playerIn(first.getSnapshot(), late.selfSessionId)).toBeDefined();
  });

  it("does not leave a ghost behind when a player leaves mid-match", async () => {
    const match = startMatch();
    const { connection: a } = await match.join();
    const { connection: b } = await match.join();
    await match.step(TICK);
    expect(a.getSnapshot().players).toHaveLength(2);

    // The server's `leave(true)`: the player meant to go.
    await b.disconnect();
    await match.step(0.5);

    expect(playerIn(a.getSnapshot(), b.selfSessionId)).toBeUndefined();
    expect(a.getSnapshot().players).toHaveLength(1);
  });

  it("survives the host going away: clients fail cleanly and new matches work", async () => {
    const match = startMatch();
    const { connection } = await match.join();
    await match.step(TICK);
    const states: string[] = [];
    connection.onConnectionChange((state) => {
      states.push(state);
    });

    await match.host.close("host-left");
    await settle();

    // What must not happen is a client that believes it is still in a
    // match that no longer exists.
    expect(states).toContain("lost");

    // A new host, nothing hand-reset, and the game is playable again.
    const next = startMatch();
    const { connection: fresh } = await next.join();
    await next.step(TICK);
    expect(self(fresh)).toBeDefined();
  });
});

describe("the P2P seat limit (#375)", () => {
  it("refuses a player past maxPlayers, and seats one once a seat is free", async () => {
    const match = startMatch({ maxPlayers: 2 });
    const { connection: first } = await match.join();
    await match.join();

    const refused = await refusal(match.join());
    expect(refused).toBeInstanceOf(MatchRefusedError);
    expect(refused instanceof MatchRefusedError ? refused.reason : undefined).toBe("match-full");

    // A seat is held through a drop, and comes free once the window is out.
    await first.disconnect();
    await match.step(RECONNECT_WINDOW_SECONDS + TICK);
    const { connection: third } = await match.join();
    expect(third.selfSessionId).not.toBe(first.selfSessionId);
  });

  it("never refuses a player coming back, and never counts them twice", async () => {
    const match = startMatch({ maxPlayers: 2 });
    const { connection: watcher } = await match.join();
    const { connection: dropper } = await match.join();
    await match.step(TICK);

    // Both seats are taken while the dropped player is away.
    await dropper.disconnect();
    await match.step(TICK);
    expect(await refusal(match.join())).toBeInstanceOf(MatchRefusedError);

    const { connection: resumed } = await match.join(
      hello({ rejoin: { playerId: dropper.selfSessionId, token: dropper.rejoinToken } }),
    );
    expect(resumed.selfSessionId).toBe(dropper.selfSessionId);
    expect(await refusal(match.join())).toBeInstanceOf(MatchRefusedError);

    // Counted once and released once: both seats come back.
    await resumed.disconnect();
    await watcher.disconnect();
    await match.step(RECONNECT_WINDOW_SECONDS + TICK);
    await match.join();
    await match.join();
  });
});

describe("a P2P host survives hostile peers (#375)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("ignores every hostile match intent and keeps the player connected and sane", async () => {
    const match = startMatch();
    const { connection, transport } = await match.join();
    await match.step(TICK);
    const spawnX = self(connection)?.x ?? Number.NaN;
    const spawnY = self(connection)?.y ?? Number.NaN;

    for (const value of hostileValues()) {
      transport.send("intent", value, "host");
    }
    await settle();
    await match.step(0.4);

    // Still seated, still simulating, and sane: an accepted 1e308
    // direction would have flung the player to NaN.
    const me = self(connection);
    expect(me).toBeDefined();
    expect(Number.isFinite(me?.x ?? Number.NaN)).toBe(true);
    expect(Number.isFinite(me?.y ?? Number.NaN)).toBe(true);
    expect(Math.abs((me?.x ?? 0) - spawnX)).toBeLessThan(1000);
    expect(Math.abs((me?.y ?? 0) - spawnY)).toBeLessThan(1000);
    expect(connection.getSnapshot().elapsedSeconds).toBeGreaterThan(0.4);
    expect(match.host.phase).toBe("active");
  });

  it("ignores every hostile hello, seats nobody for it, and still seats an honest peer", async () => {
    const match = startMatch();
    const raw = match.network.join();
    const answers: string[] = [];
    raw.on("welcome", () => answers.push("welcome"));
    raw.on("refuse", () => answers.push("refuse"));
    await settle();

    for (const value of hostileValues()) {
      raw.send("hello", value, "host");
      raw.send("hello", { protocolVersion: PROTOCOL_VERSION, name: value, build: value }, "host");
      raw.send(
        "hello",
        { protocolVersion: PROTOCOL_VERSION, name: "x", build: null, rejoin: value },
        "host",
      );
    }
    await settle();
    await match.step(TICK);

    const { connection } = await match.join();
    await match.step(TICK);
    // A hello whose fields are all junk is no hello: nobody was seated for
    // one, nor told anything, and an honest peer still gets in.
    const seatedRaw = answers.filter((answer) => answer === "welcome").length;
    expect(connection.getSnapshot().players).toHaveLength(1 + seatedRaw);
    expect(self(connection)).toBeDefined();
    expect(match.host.phase).toBe("active");
  });

  it("sanitises a hostile display name without dropping the connection", async () => {
    const match = startMatch();
    const { connection } = await match.join(hello({ name: `\u0000\u001b[31m${"x".repeat(5000)}` }));
    await match.step(TICK);

    const name = self(connection)?.name ?? "";
    expect(name.length).toBeLessThanOrEqual(16);
    expect(name).not.toContain("\u0000");
    expect(name).not.toContain("\u001b");
  });

  it("never lets a peer's text forge a log line (#115)", async () => {
    const forged = "a\n[match] finished winner=1 reason=score\r";
    const warn = vi.spyOn(console, "warn");
    const info = vi.spyOn(console, "info");
    const log = vi.spyOn(console, "log");
    const match = startMatch();
    const { connection } = await match.join(
      hello({
        name: forged,
        build: {
          name: forged,
          primaryProfession: "elementalist",
          attributes: [{ attributeId: "elementalist.fire-magic", rank: 9 }],
          skillBar: [forged, null, null, null, null, null, null, null],
          equipment: defaultBuildEquipment("elementalist"),
        },
      }),
    );
    await match.step(TICK);

    // The build was refused: the peer plays the house loadout instead.
    expect(connection.skillBar.map((slot) => slot?.id ?? null)).toEqual([
      ...HOUSE_LOADOUT.skillBar,
    ]);
    expect(self(connection)?.name).not.toMatch(/[\n\r]/);
    const lines = [...warn.mock.calls, ...info.mock.calls, ...log.mock.calls].map((call) =>
      String(call[0]),
    );
    for (const line of lines) {
      expect(line).not.toMatch(/[\n\r]/);
    }
  });

  it("ignores a seated peer's messages on channels the host does not listen to", async () => {
    // Colyseus closes a client that sends an unregistered type. A peer
    // cannot do that to a P2P host: it can only send on the match's own
    // channels, so the hostile version is the host's channels, forged.
    const match = startMatch();
    const { connection: watcher } = await match.join();
    const { connection: forger, transport } = await match.join();
    await match.step(TICK);

    const forgedEnd = { winningTeam: 1, endReason: "score" };
    transport.send("ended", forgedEnd, "host");
    transport.send("ended", forgedEnd);
    transport.send("ended", { winningTeam: null, endReason: "host-left" });
    transport.send("refuse", { reason: "match-full", message: "go away" });
    transport.send("snapshot", { anything: true });
    transport.send("welcome", { anything: true }, "host");
    await settle();
    await match.step(TICK);

    // The host played on, and nobody believed the forger over the host.
    expect(match.host.phase).toBe("active");
    expect(watcher.getSnapshot().phase).toBe("active");
    expect(watcher.getSnapshot().players).toHaveLength(2);
    expect(await listensTo(match, watcher, forger)).toBe(true);

    // And another peer can still join and play.
    const { connection: fresh } = await match.join();
    await match.step(TICK);
    expect(self(fresh)).toBeDefined();
  });

  it("does not pollute Object.prototype via a hostile intent or hello", async () => {
    const match = startMatch();
    const { transport } = await match.join();
    const intent: Record<string, JsonValue> = { kind: "move", dirX: 1, dirY: 0 };
    const build: Record<string, JsonValue> = {};
    // An own `__proto__` key, as `JSON.parse` makes one.
    for (const target of [intent, build]) {
      Object.defineProperty(target, "__proto__", { value: { pwned: 1 }, enumerable: true });
    }
    transport.send("intent", intent, "host");
    match.network.join().send("hello", hello({ build }), "host");
    await settle();
    await match.step(TICK);
    expect("pwned" in {}).toBe(false);
  });

  it("keeps playing a client whose input arrives in one burst after a stall", async () => {
    // A wifi blip mid-fight: everything sent while the link stalled lands
    // at once. It must not leave the player deaf (#43).
    const match = startMatch();
    const { watcher, other } = await twoInAMatch(match);

    for (let i = 0; i < 250; i += 1) {
      other.sendIntent(
        i % 2 === 0
          ? { kind: "move", dirX: Math.cos(i), dirY: Math.sin(i) }
          : { kind: "use-skill", slot: i % 8 },
      );
    }
    expect(await listensTo(match, watcher, other)).toBe(true);
  });

  it("ignores a match client's intents over its budget, then listens again", async () => {
    const match = startMatch();
    const { watcher, other } = await twoInAMatch(match);

    // The whole burst at one match time: nothing refills in between.
    for (let i = 0; i < MESSAGE_BURST; i += 1) {
      other.sendIntent({ kind: "stop" });
    }
    expect(await listensTo(match, watcher, other)).toBe(false);

    // The budget refills on match time; the peer was never dropped.
    await match.step(1);
    expect(await listensTo(match, watcher, other)).toBe(true);
  });

  it("stops listening to a match client that floods messages", async () => {
    const match = startMatch();
    const { watcher, other: flooder } = await twoInAMatch(match);

    for (let i = 0; i < 1000; i += 1) {
      flooder.sendIntent({ kind: "move", dirX: Math.cos(i), dirY: Math.sin(i) });
      flooder.sendIntent({ kind: "use-skill", slot: i % 12 });
    }
    await settle();

    expect(await listensTo(match, watcher, flooder)).toBe(false);

    // Everyone else plays on: the budget is the flooder's alone.
    const elapsed = watcher.getSnapshot().elapsedSeconds;
    expect(await listensTo(match, flooder, watcher)).toBe(true);
    expect(watcher.getSnapshot().elapsedSeconds).toBeGreaterThan(elapsed);
    expect(match.host.phase).toBe("active");
  });
});
