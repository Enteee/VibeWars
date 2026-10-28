import { HOUSE_LOADOUT, KILL_COUNT_MATCH_RULES } from "@vibewars/game-core";
import {
  PROTOCOL_VERSION,
  parsePeerRefuse,
  parsePeerRejoinChallenge,
  type JsonValue,
  type PeerHello,
  type PeerRejoinChallenge,
  type PeerRejoinProof,
} from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import { MESSAGE_BURST } from "./intent-budget.js";
import { MatchRefusedError, connectMatch, type PeerMatchConnection } from "./match-client.js";
import { RECONNECT_WINDOW_SECONDS, RULESET } from "./match-host.js";
import {
  hello,
  playerIn,
  self,
  settle,
  startMatch,
  until,
  type TestMatch,
} from "./match-harness.test-support.js";
import { rejoinProof } from "./rejoin-proof.js";
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
  // Kill-count: under annihilation a freed seat can empty a team, a wipe
  // that ends the match, and these are about seats, not about who wins.
  it("refuses a player past maxPlayers, and seats one once a seat is free", async () => {
    const match = startMatch({ maxPlayers: 2, matchRules: KILL_COUNT_MATCH_RULES });
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
    const match = startMatch({ maxPlayers: 2, matchRules: KILL_COUNT_MATCH_RULES });
    const { connection: watcher } = await match.join();
    const { connection: dropper, transport: dropperTransport } = await match.join();
    await match.step(TICK);

    // Both seats are taken while the dropped player is away.
    await dropperTransport.leave();
    await match.step(TICK);
    expect(await refusal(match.join())).toBeInstanceOf(MatchRefusedError);

    const { connection: resumed } = await match.rejoin(dropper);
    expect(resumed.selfSessionId).toBe(dropper.selfSessionId);
    expect(await refusal(match.join())).toBeInstanceOf(MatchRefusedError);

    // Counted once and released once: both seats come back.
    await resumed.disconnect();
    await watcher.disconnect();
    await match.step(TICK);
    await match.join();
    await match.join();
  });
});

describe("a P2P host survives hostile peers (#375)", () => {
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

  it("seats no malformed hello, and still seats an honest peer", async () => {
    const match = startMatch();
    const raw = match.network.join();
    const answers: string[] = [];
    raw.on("welcome", () => answers.push("welcome"));
    raw.on("refuse", () => answers.push("refuse"));
    await settle();

    let junkVersions = 0;
    for (const value of hostileValues()) {
      raw.send("hello", value, "host");
      // Junk fields in a hello's shape.
      raw.send(
        "hello",
        { protocolVersion: value, name: value, build: value, rejoin: value },
        "host",
      );
      junkVersions += 2;
      // A junk rejoin under the right version (`null` is a fresh join, so
      // it is the one value left out).
      if (value !== null) {
        raw.send(
          "hello",
          { protocolVersion: PROTOCOL_VERSION, name: "x", build: null, rejoin: value },
          "host",
        );
      }
    }
    await settle();
    await match.step(TICK);

    // Nobody is seated for a malformed hello. One that does not carry this
    // version is refused as a mismatch, so a stale client is told to
    // reload; one that does, but is malformed otherwise, is not answered.
    expect(answers).toEqual(Array.from({ length: junkVersions }, () => "refuse"));
    const { connection } = await match.join();
    await match.step(TICK);
    expect(connection.getSnapshot().players).toHaveLength(1);
    expect(match.host.phase).toBe("active");
  });

  it("seats a peer whose hello is well-formed but full of junk exactly once", async () => {
    const match = startMatch();
    const { connection: watcher } = await match.join();
    const raw = match.network.join();
    const welcomes: unknown[] = [];
    raw.on("welcome", (data) => welcomes.push(data));
    await settle();

    // Strings are the only names a hello may carry, and any JSON a build.
    for (const value of hostileValues()) {
      const name = typeof value === "string" ? value : "";
      raw.send(
        "hello",
        { protocolVersion: PROTOCOL_VERSION, name, build: value, rejoin: null },
        "host",
      );
    }
    await settle();
    await match.step(TICK);

    // One peer, one seat, whatever it repeats: the first hello seats it
    // on the house loadout with a fallback name, and the rest are ignored.
    expect(welcomes).toHaveLength(1);
    const players = watcher.getSnapshot().players;
    expect(players).toHaveLength(2);
    for (const player of players) {
      expect(player.name.length).toBeGreaterThan(0);
      expect(Number.isFinite(player.x)).toBe(true);
    }
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

  it("sanitises a hostile display name short enough for the wire", async () => {
    // The same attack inside MAX_WIRE_STRING, so the hello itself is valid
    // and only the host's sanitising stands between it and everyone's screen.
    const match = startMatch();
    const { connection } = await match.join(hello({ name: `\u0000\u001b[31m${"x".repeat(40)}` }));
    await match.step(TICK);

    const name = self(connection)?.name ?? "";
    expect(name.length).toBeGreaterThan(0);
    expect(name.length).toBeLessThanOrEqual(16);
    expect(name).not.toContain("\u0000");
    expect(name).not.toContain("\u001b");
  });

  it("never lets a peer's text forge a line on anyone's screen (#115)", async () => {
    // The server's version spies on its log. A P2P host has no log (this
    // package cannot even name `console`), so what is left is the text
    // every other peer is sent: the name, and a build that names a skill.
    const forged = "a\n[match] finished winner=1 reason=score\r";
    const match = startMatch();
    const { connection: watcher } = await match.join();
    const { connection } = await match.join(
      hello({
        name: forged,
        build: {
          name: forged,
          primaryProfession: "elementalist",
          attributes: [{ attributeId: "elementalist.fire-magic", rank: 9 }],
          skillBar: [forged, null, null, null, null, null, null, null],
        },
      }),
    );
    await match.step(TICK);

    // The build was refused: the peer plays the house loadout instead.
    expect(connection.skillBar.map((slot) => slot?.id ?? null)).toEqual([
      ...HOUSE_LOADOUT.skillBar,
    ]);
    const seen = playerIn(watcher.getSnapshot(), connection.selfSessionId);
    expect(seen?.name).toBeDefined();
    expect(seen?.name).not.toMatch(/[\n\r]/);
  });

  it("ignores a seated peer's messages on channels the host does not listen to", async () => {
    // Colyseus closes a client that sends an unregistered type. A peer
    // cannot do that to a P2P host: it can only send on the match's own
    // channels, so the hostile version is the host's channels, forged.
    const match = startMatch();
    const { connection: watcher } = await match.join();
    const { connection: forger, transport } = await match.join();
    await match.step(TICK);

    const forgedEnd = { winningTeam: 1, endReason: "score", summary: [] };
    transport.send("ended", forgedEnd, "host");
    transport.send("ended", forgedEnd);
    transport.send("ended", { winningTeam: null, endReason: "host-left", summary: [] });
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
  it("never seats again a peer that said bye, however it loops bye and hello", async () => {
    // Kill-count: under annihilation the bye empties the peer's team, a
    // wipe, and this test is about seating, not about who wins.
    const match = startMatch({ matchRules: KILL_COUNT_MATCH_RULES });
    const { connection: watcher } = await match.join();
    const raw = match.network.join();
    let welcomes = 0;
    raw.on("welcome", () => (welcomes += 1));
    await settle();
    raw.send("hello", hello(), "host");
    await settle();
    await match.step(TICK);
    expect(welcomes).toBe(1);
    expect(watcher.getSnapshot().players).toHaveLength(2);

    // Each round would be a fresh player at spawn: full health, no
    // cooldowns, and a new roll of the team.
    for (let i = 0; i < 5000; i += 1) {
      raw.send("bye", {}, "host");
      raw.send("hello", hello(), "host");
    }
    await settle();
    // Not even once the budget has refilled.
    await match.step(1);
    raw.send("hello", hello(), "host");
    await settle();
    await match.step(TICK);

    expect(welcomes).toBe(1);
    expect(watcher.getSnapshot().players).toHaveLength(1);
    expect(match.host.phase).toBe("active");
  });

  it("seats a peer again once it has left the room and come back", async () => {
    const match = startMatch();
    let welcomes = 0;
    const visit = async (): Promise<void> => {
      const raw = match.network.join("returner");
      raw.on("welcome", () => (welcomes += 1));
      await settle();
      raw.send("hello", hello(), "host");
      await settle();
      raw.send("bye", {}, "host");
      await raw.leave();
      await settle();
    };
    await visit();
    // The same peer id, as a page that reloads into the room may not
    // have, but a transport is free to reuse.
    await visit();
    expect(welcomes).toBe(2);
  });

  it("answers no more hellos than the budget holds", async () => {
    const match = startMatch();
    const raw = match.network.join();
    let refusals = 0;
    raw.on("refuse", () => (refusals += 1));
    await settle();
    // A wrong version is refused with an answer, so each one costs the host a send.
    for (let i = 0; i < 1000; i += 1) {
      raw.send("hello", { ...hello(), protocolVersion: "stale" }, "host");
    }
    await settle();
    expect(refusals).toBe(MESSAGE_BURST);
  });
});

/**
 * A rejoin is a challenge (#593): peer ids are self-declared, so whoever
 * the guest takes for its host may be lying. What it learns must never
 * let it take the guest's seat at the real host.
 */
describe("a P2P host against peers claiming a dropped player's seat (#593)", () => {
  /** What one peer hears from the host, by channel. */
  function overhear(transport: Transport) {
    const heard = {
      challenges: [] as PeerRejoinChallenge[],
      welcomes: 0,
      refusals: [] as string[],
    };
    transport.on("rejoin-challenge", (data) => {
      const challenge = parsePeerRejoinChallenge(data);
      if (challenge !== undefined) {
        heard.challenges.push(challenge);
      }
    });
    transport.on("welcome", () => {
      heard.welcomes += 1;
    });
    transport.on("refuse", (data) => {
      heard.refusals.push(parsePeerRefuse(data)?.reason ?? "malformed");
    });
    return heard;
  }

  /** Two seats, both taken, and the second player dropped: a stranger can only take theirs. */
  async function droppedSeat() {
    const match = startMatch({ maxPlayers: 2 });
    const { watcher, other: dropped, otherTransport } = await twoInAMatch(match);
    await otherTransport.leave();
    await match.step(TICK);
    const thief = match.network.join();
    await settle();
    return { match, watcher, dropped, thief, heard: overhear(thief) };
  }

  const claim = (playerId: string): PeerHello => hello({ rejoin: { playerId } });

  it("does not seat a peer whose proof is not of the seat's token", async () => {
    const { watcher, dropped, thief, heard } = await droppedSeat();

    thief.send("hello", claim(dropped.selfSessionId), "host");
    await settle();
    const [challenge] = heard.challenges;
    // It has the nonce, under its own id, but no token to key it with.
    const guess = await rejoinProof(
      "0".repeat(32),
      challenge?.nonce ?? "",
      dropped.selfSessionId,
      thief.selfId,
    );
    const proof: PeerRejoinProof = { playerId: dropped.selfSessionId, proof: guess };
    thief.send("rejoin-proof", proof, "host");
    await until(() => heard.refusals.length > 0);

    expect(heard.welcomes).toBe(0);
    expect(heard.refusals).toEqual(["match-full"]);
    expect(playerIn(watcher.getSnapshot(), dropped.selfSessionId)).toBeDefined();
  });

  it("ignores a proof it never asked for, even a right one", async () => {
    const { match, dropped, thief, heard } = await droppedSeat();

    const right = await rejoinProof(
      dropped.rejoinToken,
      "0f".repeat(16),
      dropped.selfSessionId,
      thief.selfId,
    );
    const proof: PeerRejoinProof = { playerId: dropped.selfSessionId, proof: right };
    thief.send("rejoin-proof", proof, "host");
    await match.step(TICK);

    expect(heard).toEqual({ challenges: [], welcomes: 0, refusals: [] });
  });

  it("takes each nonce once, and only the latest of a peer's", async () => {
    // The thief holds the token here, the worst case: the nonce still rules.
    const { match, dropped, thief, heard } = await droppedSeat();
    const prove = async (nonce: string): Promise<PeerRejoinProof> => ({
      playerId: dropped.selfSessionId,
      proof: await rejoinProof(dropped.rejoinToken, nonce, dropped.selfSessionId, thief.selfId),
    });

    thief.send("hello", claim(dropped.selfSessionId), "host");
    await settle();
    thief.send("hello", claim(dropped.selfSessionId), "host");
    await settle();
    const [stale, latest] = heard.challenges;
    expect(stale?.nonce).not.toBe(latest?.nonce);

    // The first nonce died with the second hello.
    thief.send("rejoin-proof", await prove(stale?.nonce ?? ""), "host");
    await until(() => heard.refusals.length === 1);
    expect(heard.welcomes).toBe(0);

    // Taking the stale proof used up the latest challenge too. A fresh one
    // seats it, and the same proof again does nothing.
    thief.send("hello", claim(dropped.selfSessionId), "host");
    await settle();
    const fresh = heard.challenges.at(-1)?.nonce ?? "";
    const proof = await prove(fresh);
    thief.send("rejoin-proof", proof, "host");
    thief.send("rejoin-proof", proof, "host");
    await until(() => heard.welcomes > 0);
    await match.step(TICK);
    expect(heard.welcomes).toBe(1);
  });

  it("refuses a guest's proof that a peer posing as the host relays from its own id", async () => {
    // The guest takes whoever claims the host's id for its host: here,
    // after the real host drops, the impostor.
    const match = startMatch({ maxPlayers: 2 });
    await match.join();
    const guestTransport = match.network.join();
    let impostorId: string | undefined;
    const asHost = (from: string): string => (from === impostorId ? "host" : from);
    const guestView: Transport = {
      selfId: guestTransport.selfId,
      send: (channel, data, to) => {
        guestTransport.send(
          channel,
          data,
          to === "host" && impostorId !== undefined ? impostorId : to,
        );
      },
      on: (channel, handler) =>
        guestTransport.on(channel, (data, from) => handler(data, asHost(from))),
      onPeerJoin: (handler) => guestTransport.onPeerJoin((peerId) => handler(asHost(peerId))),
      onPeerLeave: (handler) => guestTransport.onPeerLeave((peerId) => handler(asHost(peerId))),
      onTrouble: (handler) => guestTransport.onTrouble(handler),
      leave: () => guestTransport.leave(),
    };
    await settle();
    const guest = await connectMatch({
      transport: guestView,
      hostId: "host",
      hello: hello(),
      timeoutMs: 1000,
    });
    const states: string[] = [];
    guest.onConnectionChange((state) => states.push(state));
    match.network.partition("host", guestTransport.selfId);
    await settle();
    expect(states).toEqual(["reconnecting"]);

    // The impostor: what the guest sends it goes on to the real host,
    // what the host asks goes back to the guest, all from its own id.
    const impostor = match.network.join();
    impostorId = impostor.selfId;
    const heard = overhear(impostor);
    const relayed: unknown[] = [];
    impostor.on("hello", (data, from) => {
      if (from === guestTransport.selfId) {
        relayed.push(data);
        impostor.send("hello", data as PeerHello, "host");
      }
    });
    impostor.on("rejoin-proof", (data, from) => {
      if (from === guestTransport.selfId) {
        relayed.push(data);
        impostor.send("rejoin-proof", data as PeerRejoinProof, "host");
      }
    });
    impostor.on("rejoin-challenge", (data, from) => {
      if (from === "host") {
        impostor.send("rejoin-challenge", data as PeerRejoinChallenge, guestTransport.selfId);
      }
    });
    await until(() => heard.refusals.length > 0);

    // The guest answered, as it must: it cannot tell. No token went by.
    expect(relayed).toHaveLength(2);
    expect(JSON.stringify(relayed)).not.toContain(guest.rejoinToken);
    expect(heard.welcomes).toBe(0);
    expect(heard.refusals).toEqual(["match-full"]);

    // The seat is still the guest's, once the real host is back.
    impostorId = undefined;
    await impostor.leave();
    match.network.heal();
    await until(() => states.includes("online"));
    expect(guest.selfSessionId).toBe("player-2");
  });
});
