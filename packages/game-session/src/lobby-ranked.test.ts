import {
  parseWireRankedResult,
  teamSizeOf,
  type Channel,
  type QueueMode,
  type WireEnded,
  type WireRankedResult,
} from "@vibewars/game-protocol";
import {
  ZERO_HASH,
  mergeReceipts,
  startHash,
  validateReceipt,
  type RankedReceipt,
} from "@vibewars/ranking";
import { describe, expect, it } from "vitest";

import { joinLobby, type RankedPlay } from "./lobby-client.js";
import type { LobbyConnection } from "./lobby-connection.js";
import type { LeaderboardSource } from "./ranked-claims.js";
import { MAP_IDS, MAP_TEAM_SIZES, MODE_MAPS, TRACK_IDS } from "./lobby-harness.test-support.js";
import {
  RANKED_RESULT_TIMEOUT_MS,
  RANKED_START_TIMEOUT_MS,
  createLobbyHost,
  type LobbyHost,
  type MatchPlan,
} from "./lobby-host.js";
import { TICK_SECONDS, settle, until } from "./match-harness.test-support.js";
import type { MatchEnding, MatchHost } from "./match-host.js";
import { createMemoryNetwork, type MemoryNetwork } from "./memory-transport.js";
import type { PlayerKey } from "./player-key.js";
import { testPlayerKey, testReceiptCrypto, verifyTestProof } from "./player-key.test-support.js";
import type { VerifyTicketSig } from "./queue-admission.js";
import type { TicketKey } from "./queue-client.js";
import type { FormedGroup } from "./queue-formation.js";
import type { RecordedReplay } from "./replay.js";
import type { Transport } from "./transport.js";

/**
 * A ranked queued lobby (ADR-0055, #3573): every seat signs the start
 * before the match, every seat that did not leave signs the result after
 * it, and the receipt holds. Ticket signatures are the stand-in of
 * lobby-queued.test.ts; ranked ones are the test keys', checked by
 * `testReceiptCrypto` over the real digests.
 */

const hex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

/** A stand-in ticket key: its "signature" is the digest and its own id. */
const keyOf = (ticketId: string): TicketKey => ({
  ticketId,
  sign: (digest) => `${hex(digest)}${ticketId}`,
});

const verifyTicketSig: VerifyTicketSig = (ticketId, digest, sig) =>
  sig === `${hex(digest)}${ticketId}`;

const BUILD = "test-build";
const COUNTDOWN_SECONDS = 5;
const STARTED_AT = 1_795_000_000;
const REPLAY_HASH = "ab".repeat(32);

/** Seat key `n`, as hex: seat 0 hosts. */
const seatKey = (n: number): string => (n + 1).toString(16).padStart(64, "0");

/** A ranked group of two sides of `mode`'s size, seat 0 its host. */
function rankedGroup(mode: QueueMode): FormedGroup {
  const size = teamSizeOf(mode);
  const teams = [0, 1].map((side) =>
    Array.from({ length: size }, (_, i) => seatKey(side * size + i)),
  );
  const groupId = "a".repeat(64);
  return {
    groupId,
    room: `ra-${groupId}`,
    hostTicketId: seatKey(0),
    teams,
    // A team mode's sides are parties: each ticket a side.
    parties: mode.startsWith("team-arena") ? teams : [],
    mapId: "other-arena",
    mode,
    ranked: true,
    seed: 4_123_456_789,
    claims: Object.fromEntries(
      teams.flat().map((key, n) => [key, { rating: 800 + n, asOf: BOARD_AS_OF }]),
    ),
  };
}

/** A match the test ends by hand, telling its players the winner as a real one does. */
interface FakeMatch extends MatchHost {
  /** Its room: `finish` says `ended` on it. */
  room: Transport | undefined;
  finish(winningTeam: 0 | 1 | null, leavers?: readonly string[]): void;
}

function fakeMatch(): FakeMatch {
  let phase: "active" | "finished" = "active";
  let winner: 0 | 1 | null = null;
  let ending: MatchEnding | null = null;
  let replay: RecordedReplay | null = null;
  return {
    room: undefined,
    advance: () => undefined,
    get phase() {
      return phase;
    },
    get winningTeam() {
      return winner;
    },
    abandoned: false,
    droppedWeaponSwaps: 0,
    get replay() {
      return replay;
    },
    get ending() {
      return ending;
    },
    draining: false,
    retire: () => undefined,
    close: () => Promise.resolve(),
    finish(winningTeam, leavers = []) {
      const ended: WireEnded = {
        winningTeam,
        endReason: "annihilation",
        summary: [],
        clearSeconds: null,
      };
      this.room?.send("ended", ended);
      phase = "finished";
      winner = winningTeam;
      ending = { endReason: "annihilation", durationSeconds: 300, leavers };
      replay = {
        hash: REPLAY_HASH,
        replay: {
          buildHash: BUILD,
          seed: "seed",
          map: "other-arena",
          teamCount: 2,
          mode: "random-arena",
          ticks: 6000,
          overrunBy: null,
          inputs: [],
        },
      };
    },
  };
}

/** `transport`, holding back what it would send on `channel` until released, or for good. */
function holding(
  transport: Transport,
  channel: Channel,
): { transport: Transport; release(): void } {
  const held: (() => void)[] = [];
  let released = false;
  return {
    transport: {
      ...transport,
      selfId: transport.selfId,
      send(sent, data, to) {
        if (sent === channel && !released) {
          held.push(() => {
            transport.send(sent, data, to);
          });
          return;
        }
        transport.send(sent, data, to);
      },
    },
    release() {
      released = true;
      for (const send of held.splice(0)) {
        send();
      }
    },
  };
}

/**
 * A host room that rewrites every `ranked-result` it sends its guests with
 * `lie`, handed the seats' pubkeys in order: the host's own player, on its
 * local link, still hears the truth.
 */
function lyingHost(
  lie: (result: WireRankedResult["result"], seats: readonly string[]) => WireRankedResult["result"],
): (transport: Transport) => Transport {
  return (transport) => ({
    ...transport,
    selfId: transport.selfId,
    send(channel, data, to) {
      const said = channel === "ranked-result" ? parseWireRankedResult(data) : undefined;
      if (said === undefined) {
        transport.send(channel, data, to);
        return;
      }
      const seats = lyingSeats.map((seat) => seat.key.pubkey);
      transport.send(channel, { result: lie(said.result, seats) } satisfies WireRankedResult, to);
    },
  });
}

/** A host that sends every ranked result `times` times over: a hostile one's flood. */
function repeatingHost(times: number): (transport: Transport) => Transport {
  return (transport) => ({
    ...transport,
    selfId: transport.selfId,
    send(channel, data, to) {
      const copies = channel === "ranked-result" ? times : 1;
      for (let copy = 0; copy < copies; copy += 1) {
        transport.send(channel, data, to);
      }
    },
  });
}

/** A host that follows every ranked result with `times` more, each naming one more made-up leaver. */
function fakeLeaversHost(times: number): (transport: Transport) => Transport {
  return (transport) => ({
    ...transport,
    selfId: transport.selfId,
    send(channel, data, to) {
      transport.send(channel, data, to);
      const said = channel === "ranked-result" ? parseWireRankedResult(data) : undefined;
      if (said === undefined) {
        return;
      }
      const leavers = [...said.result.leavers];
      for (let fake = 0; fake < times; fake += 1) {
        leavers.push(fake.toString(16).padStart(64, "f"));
        const result = { ...said.result, leavers: [...leavers] };
        transport.send(channel, { result } satisfies WireRankedResult, to);
      }
    },
  });
}

/** The seats a lying host's lie names, set once they have joined. */
let lyingSeats: readonly Seat[] = [];

/** How many result signatures each seat sent, its room wrapped to count them. */
function countingSigs(): {
  wrap: (n: number, transport: Transport) => Transport;
  sent: () => number[];
} {
  const counts: number[] = [];
  return {
    wrap: (n, transport) => {
      counts[n] = 0;
      return {
        ...transport,
        selfId: transport.selfId,
        send(channel, data, to) {
          if (channel === "ranked-result-sig") {
            counts[n] = (counts[n] ?? 0) + 1;
          }
          transport.send(channel, data, to);
        },
      };
    },
    sent: () => [...counts],
  };
}

/** One seat's player: its lobby, key and what its ranked play handed on. */
interface Seat {
  readonly key: PlayerKey;
  readonly connection: LobbyConnection;
  readonly transport: Transport;
  readonly receipts: { readonly receipt: RankedReceipt; readonly partial: boolean }[];
  /** Each result it signed, as the partial receipt it handed on that round. */
  readonly signed: RankedReceipt[];
  /** The round each of `signed` was handed on with. */
  readonly rounds: number[];
  /** How many times it signed the host's start. */
  startsSigned: number;
  cancelled: number;
}

interface RankedLobby {
  readonly network: MemoryNetwork;
  readonly lobby: LobbyHost;
  readonly group: FormedGroup;
  readonly match: FakeMatch;
  readonly plans: MatchPlan[];
  readonly fellThrough: (readonly string[])[];
  /** What the host's `onReceipt` was handed. */
  readonly receipts: RankedReceipt[];
  /** Every seat in seat order, seat 0 the host's own player. */
  readonly seats: Seat[];
  step(seconds: number): Promise<void>;
}

interface RankedLobbyOptions {
  /** Seats that join without a ranked play: they sign nothing. */
  readonly unranked?: readonly number[];
  /** Seats with no character, playing a host starter: they sign as `"starter"` (#3680). */
  readonly starters?: readonly number[];
  /** Each seat's room, wrapped as the test likes. */
  readonly wrap?: (n: number, transport: Transport) => Transport;
  /** The host's room, wrapped: a lying host's, to its guests. */
  readonly host?: (transport: Transport) => Transport;
  /** Each seat's leaderboards (#3575): by default `PUBLISHED`, so every claim holds. */
  readonly board?: (n: number) => LeaderboardSource;
}

/** What every seat's claim names: the one board `PUBLISHED` holds. */
const BOARD_AS_OF = 1_795_000_000;

/** Each seat's player key, and its group's claim for it: what `PUBLISHED` rates. */
const RATED = new Map<string, number>();

/** No copy held, and one board published, as of `BOARD_AS_OF`, rating each seat as its claim. */
const PUBLISHED: LeaderboardSource = {
  copy: () => undefined,
  board: (asOf) =>
    Promise.resolve(
      asOf === BOARD_AS_OF ? { asOf, claimOf: (pubkey) => RATED.get(pubkey) ?? 800 } : undefined,
    ),
};

async function joinSeat(
  group: FormedGroup,
  n: number,
  transport: Transport,
  ranked: boolean,
  characterId = `char-${String(n)}`,
  leaderboard: LeaderboardSource = PUBLISHED,
): Promise<Seat> {
  const key = testPlayerKey();
  const claim = group.claims[seatKey(n)];
  if (claim !== undefined) {
    RATED.set(key.pubkey, claim.rating);
  }
  const receipts: Seat["receipts"] = [];
  const signed: RankedReceipt[] = [];
  const rounds: number[] = [];
  const play: RankedPlay = {
    characterId,
    prev: ZERO_HASH,
    buildHash: BUILD,
    crypto: testReceiptCrypto,
    leaderboard,
    onReceipt: (receipt, partial) => receipts.push({ receipt, partial }),
    onResultSigned: (partial, round) => {
      signed.push(partial);
      rounds.push(round);
    },
    onStartSigned: () => {
      seat.startsSigned += 1;
    },
    onCancel: () => {
      seat.cancelled += 1;
    },
  };
  const connection = await joinLobby({
    transport,
    code: group.groupId,
    proofKey: null,
    name: `Seat ${String(n)}`,
    guildTag: null,
    heroRank: 0,
    guildCape: null,
    timeoutMs: 1000,
    relayPub: null,
    playerKey: key,
    claim: () => ({ rating: 800, asOf: 0 }),
    queued: { group, key: keyOf(seatKey(n)), verifyTicketSig, ascentMorale: 0 },
    ...(ranked ? { ranked: play } : {}),
  });
  const seat: Seat = {
    key,
    connection,
    transport,
    receipts,
    signed,
    rounds,
    startsSigned: 0,
    cancelled: 0,
  };
  return seat;
}

async function openRanked(mode: QueueMode, options: RankedLobbyOptions = {}): Promise<RankedLobby> {
  const group = rankedGroup(mode);
  const network = createMemoryNetwork();
  const match = fakeMatch();
  const plans: MatchPlan[] = [];
  const fellThrough: (readonly string[])[] = [];
  const receipts: RankedReceipt[] = [];
  const lobby = createLobbyHost({
    transport: (options.host ?? ((room: Transport) => room))(network.join("host")),
    code: group.groupId,
    proofKey: null,
    mapIds: MAP_IDS,
    trackIds: TRACK_IDS,
    modeMaps: MODE_MAPS,
    mapTeamSizes: MAP_TEAM_SIZES,
    hostedTeamSize: 4,
    teamLobby: false,
    random: () => 0.5,
    verifyPlayerProof: verifyTestProof,
    startMatch(plan) {
      plans.push(plan);
      match.room = plan.transport;
      return match;
    },
    queued: {
      group,
      key: keyOf(group.hostTicketId),
      verifyTicketSig,
      ascentMorale: 0,
      countdownSeconds: COUNTDOWN_SECONDS,
      timeoutSeconds: 20,
      onFellThrough: (noShows) => fellThrough.push(noShows),
      stayTogetherSeconds: 15,
      onDone: () => undefined,
    },
    ranked: {
      buildHash: BUILD,
      crypto: testReceiptCrypto,
      nowSeconds: () => STARTED_AT,
      onReceipt: (receipt) => receipts.push(receipt),
    },
  });
  const wrap = options.wrap ?? ((_n: number, transport: Transport) => transport);
  const unranked = new Set(options.unranked ?? []);
  const starters = new Set(options.starters ?? []);
  const seats: Seat[] = [];
  const count = group.teams.flat().length;
  for (let n = 0; n < count; n += 1) {
    const room = n === 0 ? lobby.local : network.join();
    seats.push(
      await joinSeat(
        group,
        n,
        wrap(n, room),
        !unranked.has(n),
        starters.has(n) ? "starter" : undefined,
        options.board?.(n),
      ),
    );
  }
  await settle();
  lyingSeats = seats;
  return {
    network,
    lobby,
    group,
    match,
    plans,
    fellThrough,
    receipts,
    seats,
    async step(seconds) {
      const ticks = Math.round(seconds / TICK_SECONDS);
      for (let i = 0; i < ticks; i += 1) {
        lobby.advance(TICK_SECONDS);
        await settle();
      }
    },
  };
}

/** Through the countdown and the start round: the match is on. */
async function startRanked(ranked: RankedLobby): Promise<void> {
  await ranked.step(COUNTDOWN_SECONDS + TICK_SECONDS);
  await until(() => ranked.plans.length === 1);
}

/** Every seat's pubkey, in seat order. */
const pubkeys = (ranked: RankedLobby): string[] => ranked.seats.map((seat) => seat.key.pubkey);

/** The one full receipt every seat was handed. */
function receiptOf(ranked: RankedLobby): RankedReceipt {
  const [receipt] = ranked.receipts;
  if (receipt === undefined) {
    throw new Error("no receipt");
  }
  return receipt;
}

describe("a ranked queued match (ADR-0055, #3573)", () => {
  it.each<QueueMode>(["random-arena-2v2", "random-arena-4v4"])(
    "runs both rounds in %s and ends in a receipt that holds, every seat handed it",
    async (mode) => {
      const ranked = await openRanked(mode);
      await startRanked(ranked);
      const [plan] = ranked.plans;
      // It records the replay whose hash its result names, and seats no bot.
      expect(plan?.recordReplay).toBe(true);
      expect([...(plan?.seats.values() ?? [])].every((seat) => !seat.bot)).toBe(true);
      expect(plan?.seats.size).toBe(ranked.seats.length);
      ranked.match.finish(1);
      await ranked.step(1);
      await until(() => ranked.seats.every((seat) => seat.receipts.length === 1));
      const receipt = receiptOf(ranked);
      expect(validateReceipt(receipt, testReceiptCrypto)).toEqual({ ok: true, void: false });
      expect(receipt.start).toMatchObject({
        matchId: ranked.group.groupId,
        buildHash: BUILD,
        mode,
        map: "other-arena",
        seed: ranked.group.seed,
        startedAt: STARTED_AT,
      });
      expect(receipt.start.teams.flat().map((seat) => seat.pubkey)).toEqual(pubkeys(ranked));
      expect(
        receipt.start.teams
          .flat()
          .map((seat) => ({ rating: seat.claimedRating, asOf: seat.leaderboardAsOf })),
      ).toEqual(ranked.group.teams.flat().map((key) => ranked.group.claims[key]));
      expect(receipt.result).toEqual({
        startHash: startHash(receipt.start, testReceiptCrypto.sha256),
        winningTeam: 1,
        endReason: "annihilation",
        leavers: [],
        durationSeconds: 300,
        replayHash: REPLAY_HASH,
      });
      expect(Object.keys(receipt.resultSigs).sort()).toEqual([...pubkeys(ranked)].sort());
      for (const seat of ranked.seats) {
        expect(seat.receipts).toEqual([{ receipt, partial: false }]);
        expect(seat.startsSigned).toBe(1);
      }
    },
  );

  it("names a seat freed in the match a leaver, and needs no signature of it", async () => {
    const ranked = await openRanked("random-arena-2v2");
    await startRanked(ranked);
    const leaver = pubkeys(ranked)[3] ?? "";
    // Every other seat sees it go.
    await ranked.seats[3]?.transport.leave();
    await settle();
    ranked.match.finish(0, [leaver]);
    await ranked.step(1);
    await until(() => ranked.receipts.length === 1);
    const receipt = receiptOf(ranked);
    expect(receipt.result.leavers).toEqual([leaver]);
    expect(receipt.resultSigs[leaver]).toBeUndefined();
    expect(validateReceipt(receipt, testReceiptCrypto)).toEqual({ ok: true, void: false });
  });

  it("cancels the match when a seat does not sign the start in time", async () => {
    const ranked = await openRanked("random-arena-2v2", {
      wrap: (n, transport) =>
        n === 2 ? holding(transport, "ranked-start-sig").transport : transport,
    });
    await ranked.step(COUNTDOWN_SECONDS + RANKED_START_TIMEOUT_MS / 1000 - 1);
    expect(ranked.fellThrough).toEqual([]);
    await ranked.step(1 + TICK_SECONDS);
    expect(ranked.plans).toEqual([]);
    // The one that did not sign is the no-show the queue skips.
    expect(ranked.fellThrough).toEqual([[seatKey(2)]]);
    for (const n of [0, 1, 3]) {
      expect(ranked.seats[n]?.cancelled).toBe(1);
    }
    expect(ranked.receipts).toEqual([]);
  });

  it("signs no start whose claims the seat's own board does not hold (#3575)", async () => {
    // The board the claims name lists everyone at 1000, as seat 2 fetches it.
    const ranked = await openRanked("random-arena-2v2", {
      board: (n) =>
        n === 2
          ? {
              copy: () => undefined,
              board: (asOf) => Promise.resolve({ asOf, claimOf: () => 1000 }),
            }
          : PUBLISHED,
    });
    await ranked.step(COUNTDOWN_SECONDS + RANKED_START_TIMEOUT_MS / 1000 + TICK_SECONDS);
    expect(ranked.seats[2]?.startsSigned).toBe(0);
    expect(ranked.fellThrough).toEqual([[seatKey(2)]]);
    expect(ranked.receipts).toEqual([]);
  });

  it("signs no start once it left while the leaderboard was fetched (#3575)", async () => {
    // Seat 2's fetch answers once it has left, with a board that holds every claim.
    let fetched: (() => void) | undefined;
    const ranked = await openRanked("random-arena-2v2", {
      board: (n) =>
        n === 2
          ? {
              copy: () => undefined,
              board: (asOf) =>
                new Promise((resolve) => {
                  fetched = () => {
                    void PUBLISHED.board(asOf).then(resolve);
                  };
                }),
            }
          : PUBLISHED,
    });
    await ranked.step(COUNTDOWN_SECONDS);
    await until(() => fetched !== undefined);
    await ranked.seats[2]?.connection.disconnect();
    fetched?.();
    await ranked.step(RANKED_START_TIMEOUT_MS / 1000 + TICK_SECONDS);
    expect(ranked.seats[2]?.startsSigned).toBe(0);
    expect(ranked.receipts).toEqual([]);
  });

  it("never fills a ranked seat with a bot: one gone as the match begins leaves", async () => {
    // Seat 1's start signature is held back until seat 3 has signed and gone.
    let release = (): void => undefined;
    const ranked = await openRanked("random-arena-2v2", {
      wrap: (n, transport) => {
        if (n !== 1) {
          return transport;
        }
        const held = holding(transport, "ranked-start-sig");
        release = () => {
          held.release();
        };
        return held.transport;
      },
    });
    await ranked.step(COUNTDOWN_SECONDS + TICK_SECONDS);
    await ranked.seats[3]?.transport.leave();
    await settle();
    release();
    await ranked.step(TICK_SECONDS);
    await until(() => ranked.plans.length === 1);
    const seats = [...(ranked.plans[0]?.seats.values() ?? [])];
    expect(seats).toHaveLength(3);
    expect(seats.every((seat) => !seat.bot)).toBe(true);
    ranked.match.finish(0);
    await ranked.step(1);
    await until(() => ranked.receipts.length === 1);
    const receipt = receiptOf(ranked);
    expect(receipt.result.leavers).toEqual([pubkeys(ranked)[3]]);
    expect(validateReceipt(receipt, testReceiptCrypto)).toEqual({ ok: true, void: false });
  });

  it("makes a seat that will not sign the result a leaver, and the rest sign again", async () => {
    const ranked = await openRanked("random-arena-2v2", {
      wrap: (n, transport) =>
        n === 2 ? holding(transport, "ranked-result-sig").transport : transport,
    });
    await startRanked(ranked);
    ranked.match.finish(1);
    await ranked.step(1);
    expect(ranked.receipts).toEqual([]);
    await ranked.step(RANKED_RESULT_TIMEOUT_MS / 1000);
    await until(() => ranked.receipts.length === 1);
    const receipt = receiptOf(ranked);
    const refuser = pubkeys(ranked)[2] ?? "";
    expect(receipt.result.leavers).toEqual([refuser]);
    expect(receipt.resultSigs[refuser]).toBeUndefined();
    expect(validateReceipt(receipt, testReceiptCrypto)).toEqual({ ok: true, void: false });
    // It is handed the receipt it lost, as everyone.
    expect(ranked.seats[2]?.receipts).toEqual([{ receipt, partial: false }]);
  });

  it("confirms a 1v1 in which one seat has no character and signs as a starter (#3680)", async () => {
    const ranked = await openRanked("random-arena-1v1", { starters: [1] });
    await startRanked(ranked);
    expect(ranked.fellThrough).toEqual([]);
    ranked.match.finish(0);
    await ranked.step(1);
    await until(() => ranked.seats.every((seat) => seat.receipts.length === 1));
    const receipt = receiptOf(ranked);
    expect(validateReceipt(receipt, testReceiptCrypto)).toEqual({ ok: true, void: false });
    expect(receipt.start.teams.flat().map((seat) => seat.characterId)).toEqual([
      "char-0",
      "starter",
    ]);
  });

  it("cancels at once a match with a seat that brought no ranked seat", async () => {
    const ranked = await openRanked("random-arena-2v2", { unranked: [2] });
    await ranked.step(COUNTDOWN_SECONDS + TICK_SECONDS);
    expect(ranked.plans).toEqual([]);
    expect(ranked.fellThrough).toEqual([[seatKey(2)]]);
    expect(ranked.seats[1]?.cancelled).toBe(1);
  });

  it("has every other seat sign a host-left result when the host goes mid-match, which merge", async () => {
    const ranked = await openRanked("random-arena-2v2");
    await startRanked(ranked);
    await ranked.lobby.close();
    const guests = ranked.seats.slice(1);
    await until(() => guests.every((seat) => seat.receipts.length === 1));
    // The host's own player is the leaver: it hands nothing on.
    expect(ranked.seats[0]?.receipts).toEqual([]);
    const partials = guests.map((seat) => {
      const [handed] = seat.receipts;
      expect(handed?.partial).toBe(true);
      if (handed === undefined) {
        throw new Error("no partial receipt");
      }
      return handed.receipt;
    });
    const [first, second, third] = partials;
    if (first === undefined || second === undefined || third === undefined) {
      throw new Error("three partials");
    }
    expect(first.result).toEqual({
      startHash: startHash(first.start, testReceiptCrypto.sha256),
      winningTeam: null,
      endReason: "host-left",
      leavers: [pubkeys(ranked)[0]],
      durationSeconds: 0,
      replayHash: ZERO_HASH,
    });
    // Every remaining seat's signature is needed: two of three are not yet a receipt.
    const two = mergeReceipts(first, second, testReceiptCrypto);
    if (two === undefined) {
      throw new Error("two partials of one match did not merge");
    }
    expect(validateReceipt(two, testReceiptCrypto)).toEqual({
      ok: false,
      reason: "result-signature",
    });
    const all = mergeReceipts(two, third, testReceiptCrypto);
    if (all === undefined) {
      throw new Error("three partials of one match did not merge");
    }
    expect(validateReceipt(all, testReceiptCrypto)).toEqual({ ok: true, void: false });
  });

  it("keeps an 8v8 start's signatures and its receipt within one message", async () => {
    const ranked = await openRanked("team-arena-8v8");
    const sigs: unknown[] = [];
    ranked.seats[5]?.transport.on("ranked-start-sigs", (data) => sigs.push(data));
    await startRanked(ranked);
    ranked.match.finish(0);
    await ranked.step(1);
    await until(() => ranked.receipts.length === 1);
    const receipt = receiptOf(ranked);
    expect(validateReceipt(receipt, testReceiptCrypto)).toEqual({ ok: true, void: false });
    const bytes = (value: unknown): number =>
      new TextEncoder().encode(JSON.stringify(value)).length;
    // 16 signatures, as the issue bounds them.
    expect(sigs).toHaveLength(1);
    expect(bytes(sigs[0])).toBeLessThanOrEqual(8 * 1024);
    // The whole receipt holds 32 signatures and 16 seats: it fits a message, not 8 KB.
    expect(bytes({ receipt })).toBeLessThanOrEqual(16 * 1024 - 36);
  });

  it("is refused a result naming a leaver nobody saw go: the refusers leave, and nobody is rated", async () => {
    const sigs = countingSigs();
    const ranked = await openRanked("random-arena-2v2", {
      wrap: sigs.wrap,
      host: lyingHost((result, seats) =>
        // The first round only: the re-round names the refusers itself.
        result.leavers.length === 0 ? { ...result, leavers: [seats[3] ?? ""] } : result,
      ),
    });
    await startRanked(ranked);
    ranked.match.finish(0);
    await ranked.step(1);
    // No guest signed the lie: seat 3 is named, and seats 1 and 2 never saw
    // it go. The host's own player heard the truth, and signed that.
    expect(sigs.sent()).toEqual([1, 0, 0, 0]);
    await ranked.step(RANKED_RESULT_TIMEOUT_MS / 1000);
    await until(() => ranked.receipts.length === 1);
    const receipt = receiptOf(ranked);
    expect(receipt.result.leavers).toEqual(pubkeys(ranked).slice(1));
    // The host's own signature alone: valid, and void, so it rates nobody.
    expect(Object.keys(receipt.resultSigs)).toEqual([pubkeys(ranked)[0]]);
    expect(validateReceipt(receipt, testReceiptCrypto)).toEqual({ ok: true, void: true });
  });

  it("is refused a result naming another winner than the match told the players", async () => {
    const sigs = countingSigs();
    const ranked = await openRanked("random-arena-2v2", {
      wrap: sigs.wrap,
      host: lyingHost((result) => ({ ...result, winningTeam: 0 })),
    });
    await startRanked(ranked);
    ranked.match.finish(1);
    await ranked.step(1);
    expect(sigs.sent()).toEqual([1, 0, 0, 0]);
    await ranked.step(RANKED_RESULT_TIMEOUT_MS / 1000);
    await until(() => ranked.receipts.length === 1);
    const receipt = receiptOf(ranked);
    expect(receipt.result.leavers).toEqual(pubkeys(ranked).slice(1));
    expect(validateReceipt(receipt, testReceiptCrypto)).toEqual({ ok: true, void: true });
  });

  it("never takes a result it refused for the round a re-round adds leavers to", async () => {
    const sigs = countingSigs();
    const ranked = await openRanked("random-arena-2v2", {
      wrap: sigs.wrap,
      host: lyingHost((result, seats) =>
        // A first round nobody can sign, then a re-round with the true
        // winner naming one opponent alone a leaver: no guest signed a
        // round before it, so none has evidence against it.
        result.leavers.length === 0
          ? { ...result, winningTeam: 0 }
          : { ...result, leavers: [seats[3] ?? ""] },
      ),
    });
    await startRanked(ranked);
    ranked.match.finish(1);
    await ranked.step(1);
    expect(sigs.sent()).toEqual([1, 0, 0, 0]);
    await ranked.step(RANKED_RESULT_TIMEOUT_MS / 1000);
    await until(() => ranked.receipts.length === 1);
    // Seat 3 never saw itself named, and seats 1 and 2 never saw it go.
    expect(sigs.sent()).toEqual([2, 0, 0, 0]);
    const receipt = receiptOf(ranked);
    expect(receipt.result.leavers).toEqual(pubkeys(ranked).slice(1));
    expect(validateReceipt(receipt, testReceiptCrypto)).toEqual({ ok: true, void: true });
  });

  it("hands on a partial receipt each round a seat signs, and re-rounds only its non-signers", async () => {
    const ranked = await openRanked("random-arena-2v2", {
      wrap: (n, transport) =>
        n === 2 ? holding(transport, "ranked-result-sig").transport : transport,
    });
    await startRanked(ranked);
    ranked.match.finish(1);
    await ranked.step(1);
    // Round one: every seat signed, and handed on its own signature alone.
    for (const seat of ranked.seats) {
      expect(seat.signed).toHaveLength(1);
      expect(Object.keys(seat.signed[0]?.resultSigs ?? {})).toEqual([seat.key.pubkey]);
      expect(seat.signed[0]?.result.leavers).toEqual([]);
    }
    await ranked.step(RANKED_RESULT_TIMEOUT_MS / 1000);
    await until(() => ranked.receipts.length === 1);
    const receipt = receiptOf(ranked);
    // Seat 2's signature never reached the host: it alone is added.
    expect(receipt.result.leavers).toEqual([pubkeys(ranked)[2]]);
    for (const [n, seat] of ranked.seats.entries()) {
      // Seat 2 holds its round-one partial: the evidence that it signed.
      expect(seat.signed).toHaveLength(n === 2 ? 1 : 2);
      // Each round's partial has its own round, so neither replaces the other.
      expect(seat.rounds).toEqual(n === 2 ? [0] : [0, 1]);
      const last = seat.signed.at(-1);
      if (last === undefined) {
        throw new Error("no partial");
      }
      expect(last.result).toEqual(n === 2 ? { ...receipt.result, leavers: [] } : receipt.result);
      expect(validateReceipt(last, testReceiptCrypto)).toEqual({
        ok: false,
        reason: "result-signature",
      });
      // Its one signature merges into the full receipt unchanged.
      if (n !== 2) {
        expect(receipt.resultSigs[seat.key.pubkey]).toBe(last.resultSigs[seat.key.pubkey]);
      }
    }
  });
  it("signs a result the host sends again only once: no new round, nothing more to publish", async () => {
    const sigs = countingSigs();
    const ranked = await openRanked("random-arena-2v2", {
      wrap: sigs.wrap,
      host: repeatingHost(5),
    });
    await startRanked(ranked);
    ranked.match.finish(1);
    await ranked.step(1);
    await until(() => ranked.receipts.length === 1);
    for (const seat of ranked.seats) {
      expect(seat.rounds).toEqual([0]);
    }
    // Each copy is answered with the signature it has, never a new one;
    // the host's own seat is sent it once.
    expect(sigs.sent()).toEqual([1, 5, 5, 5]);
    const receipt = receiptOf(ranked);
    expect(receipt.result.leavers).toEqual([]);
    expect(validateReceipt(receipt, testReceiptCrypto)).toEqual({ ok: true, void: false });
  });
  it("signs no re-round naming a leaver who holds no seat of the start", async () => {
    const ranked = await openRanked("random-arena-2v2", { host: fakeLeaversHost(5) });
    await startRanked(ranked);
    ranked.match.finish(1);
    await ranked.step(1);
    await until(() => ranked.receipts.length === 1);
    for (const seat of ranked.seats) {
      expect(seat.rounds).toEqual([0]);
    }
    expect(receiptOf(ranked).result.leavers).toEqual([]);
  });
});
