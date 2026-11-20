import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";

import { decayRd, glicko2Period, RATING, rankOrder, rate, type Ratings } from "./rate.js";
import {
  type RankedEndReason,
  type RankedReceipt,
  type RankedStart,
  type ReceiptCrypto,
  receiptHash,
  resultDigest,
  startDigest,
  startHash,
  ZERO_HASH,
} from "./receipt.js";

// ranking has no Node or DOM types; the test runner has both.
declare const process: { readonly env: Readonly<Record<string, string | undefined>> };
declare const console: { log(message: string): void };

/**
 * A stand-in for BIP-340 that is fast enough to sign thousands of
 * receipts: a key's signature of a digest is a hash of both. It is only
 * as unforgeable as these tests need, which is not at all.
 */
const sigOf = (pubkey: string, digest: Uint8Array): string => {
  const half = bytesToHex(sha256(new TextEncoder().encode(pubkey + bytesToHex(digest))));
  return half + half;
};
const crypto: ReceiptCrypto = {
  sha256,
  verify: (pubkey, digest, sig) => sig === sigOf(pubkey, digest),
};

const key = (name: string): string => bytesToHex(sha256(new TextEncoder().encode(name)));
/** At least four keys, so the first few destructure as keys. */
type Keys = readonly [string, string, string, string, ...string[]];

function keys(prefix: string, count: number): Keys {
  const [a, b, c, d, ...rest] = Array.from({ length: count }, (_, i) =>
    key(`${prefix}-${String(i)}`),
  );
  if (a === undefined || b === undefined || c === undefined || d === undefined) {
    throw new Error("fewer than four keys");
  }
  return [a, b, c, d, ...rest];
}

/** `items[i % items.length]`, which always exists. */
function nth<T>(items: readonly T[], i: number): T {
  const item = items[i % items.length];
  if (item === undefined) {
    throw new Error("no items");
  }
  return item;
}

interface Play {
  readonly winningTeam?: number | null;
  readonly leavers?: readonly string[];
  readonly endReason?: RankedEndReason;
  /** Seats whose result signature is left out. */
  readonly unsigned?: readonly string[];
  /** Each seat's `prev`, instead of its chain's last receipt. */
  readonly prev?: Readonly<Record<string, string>>;
  /** Leave every chain where it was, as a forgery nobody builds on. */
  readonly offChain?: boolean;
}

/** Plays signed receipts, chaining every key's `prev` to its last one. */
class Ledger {
  readonly receipts: RankedReceipt[] = [];
  private readonly last = new Map<string, string>();
  private seq = 0;

  play(day: number, teams: readonly (readonly string[])[], play: Play = {}): RankedReceipt {
    this.seq += 1;
    const start: RankedStart = {
      matchId: `match-${String(this.seq)}`,
      buildHash: "build",
      mode: "team-arena",
      map: "isle",
      seed: this.seq,
      startedAt: day * RATING.secondsPerDay + (this.seq % 80_000),
      leaderboardAsOf: 0,
      teams: teams.map((team) =>
        team.map((pubkey) => ({
          pubkey,
          characterId: `char-${pubkey.slice(0, 6)}`,
          name: `Name ${pubkey.slice(0, 6)}`,
          claimedRating: 0,
          prev: play.prev?.[pubkey] ?? this.last.get(pubkey) ?? ZERO_HASH,
        })),
      ),
    };
    const endReason = play.endReason ?? "annihilation";
    const hostLeft = endReason === "host-left";
    const result = {
      startHash: startHash(start, sha256),
      winningTeam: play.winningTeam === undefined ? 0 : play.winningTeam,
      endReason,
      leavers: play.leavers ?? [],
      durationSeconds: hostLeft ? 0 : 300,
      replayHash: hostLeft ? ZERO_HASH : "ab".repeat(32),
    };
    const seats = teams.flat();
    const startOf = startDigest(start, sha256);
    const resultOf = resultDigest(result, sha256);
    const signers = seats.filter(
      (pubkey) => !result.leavers.includes(pubkey) && !(play.unsigned ?? []).includes(pubkey),
    );
    const receipt: RankedReceipt = {
      start,
      startSigs: Object.fromEntries(seats.map((pubkey) => [pubkey, sigOf(pubkey, startOf)])),
      result,
      resultSigs: Object.fromEntries(signers.map((pubkey) => [pubkey, sigOf(pubkey, resultOf)])),
    };
    const hash = receiptHash(receipt, sha256);
    for (const pubkey of play.offChain ? [] : seats) {
      this.last.set(pubkey, hash);
    }
    this.receipts.push(receipt);
    return receipt;
  }
}

/** `pubkey`'s `prev` in `receipt`. */
function prevOf(receipt: RankedReceipt, pubkey: string): string {
  const seat = receipt.start.teams.flat().find((each) => each.pubkey === pubkey);
  if (!seat) {
    throw new Error(`not seated: ${pubkey}`);
  }
  return seat.prev;
}

/** `signer`'s partial receipt for an earlier round of `receipt`, with `leavers` instead. */
function roundOf(
  receipt: RankedReceipt,
  leavers: readonly string[],
  signer: string,
): RankedReceipt {
  const result = { ...receipt.result, leavers };
  return {
    ...receipt,
    result,
    resultSigs: { [signer]: sigOf(signer, resultDigest(result, sha256)) },
  };
}

/** `receipt`'s start with another result, signed by every seat. */
function resultSwapped(receipt: RankedReceipt, winningTeam: number | null): RankedReceipt {
  const result = { ...receipt.result, winningTeam };
  const digest = resultDigest(result, sha256);
  const seats = receipt.start.teams.flat().map((seat) => seat.pubkey);
  return {
    ...receipt,
    result,
    resultSigs: Object.fromEntries(seats.map((pubkey) => [pubkey, sigOf(pubkey, digest)])),
  };
}

/** A round robin of 1v1s among `pool` on `day`: every key meets every other once. */
function roundRobin(ledger: Ledger, day: number, pool: readonly string[]): void {
  pool.forEach((a, i) => {
    for (const b of pool.slice(i + 1)) {
      ledger.play(day, [[a], [b]], { winningTeam: i % 2 });
    }
  });
}

/** 25 keys that all met each other on day 0: every one has full trust. */
function trustedPool(ledger: Ledger): Keys {
  const pool = keys("pool", 25);
  roundRobin(ledger, 0, pool);
  return pool;
}

const of = (ratings: Ratings, pubkey: string) => {
  const rating = ratings.get(pubkey);
  if (!rating) {
    throw new Error(`not rated: ${pubkey}`);
  }
  return rating;
};

/** A deterministic shuffle, so a failure reproduces. */
function shuffled<T>(items: readonly T[], seed: number): T[] {
  let state = seed;
  return items
    .map((item) => {
      state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
      return { item, at: state };
    })
    .sort((a, b) => a.at - b.at)
    .map(({ item }) => item);
}

describe("glicko2Period", () => {
  it("matches the worked example in Glickman's paper", () => {
    const after = glicko2Period({ rating: 1500, rd: 200, sigma: 0.06 }, [
      { rating: 1400, rd: 30, score: 1, weight: 1 },
      { rating: 1550, rd: 100, score: 0, weight: 1 },
      { rating: 1700, rd: 300, score: 0, weight: 1 },
    ]);
    expect(Math.abs(after.rating - 1464.0507)).toBeLessThan(1e-3);
    expect(Math.abs(after.rd - 151.5165)).toBeLessThan(1e-3);
    expect(Math.abs(after.sigma - 0.059996)).toBeLessThan(1e-6);
  });
});

describe("rate", () => {
  it("rates nobody from no receipts", () => {
    expect(rate([], 100, crypto).size).toBe(0);
    expect(rankOrder(new Map())).toEqual([]);
  });

  it("rates both seats of a single receipt", () => {
    const ledger = new Ledger();
    const [a, b] = keys("single", 4);
    const receipt = ledger.play(5, [[a], [b]]);
    const ratings = rate(ledger.receipts, 5, crypto);
    expect(of(ratings, a)).toMatchObject({
      matches: 1,
      lastPlayedDay: 5,
      provisional: true,
      distinctOpponents: 1,
      streak: 0,
      lastReceiptHash: receiptHash(receipt, sha256),
      name: `Name ${a.slice(0, 6)}`,
    });
    expect(of(ratings, b).matches).toBe(1);
  });

  it("gives the same output for any order of its input", () => {
    const ledger = new Ledger();
    const pool = trustedPool(ledger);
    pool.slice(0, 12).forEach((pubkey, i) => {
      ledger.play(
        3,
        [
          [pubkey, nth(pool, i + 12)],
          [nth(pool, (i + 1) % 12), nth(pool, ((i + 1) % 12) + 12)],
        ],
        {
          winningTeam: i % 3 === 0 ? null : 1,
        },
      );
    });
    const once = rate(ledger.receipts, 10, crypto);
    const again = rate(shuffled(ledger.receipts, 7), 10, crypto);
    expect([...again]).toEqual([...once]);
    expect(rankOrder(again)).toEqual(rankOrder(once));
  });

  it("ignores a receipt from after asOfDay", () => {
    const ledger = new Ledger();
    const [a, b] = keys("late", 4);
    ledger.play(11, [[a], [b]]);
    expect(rate(ledger.receipts, 10, crypto).size).toBe(0);
  });

  it("decays an idle RD back to 350 in 180 days", () => {
    expect(decayRd(RATING.minRd, 180)).toBe(RATING.maxRd);
    const ledger = new Ledger();
    const pool = trustedPool(ledger);
    const settled = of(rate(ledger.receipts, 0, crypto), pool[0]);
    expect(settled.rd).toBeLessThan(150);
    const idle = of(rate(ledger.receipts, 180, crypto), pool[0]);
    expect(idle.rd).toBe(RATING.maxRd);
    expect(idle.rating).toBe(settled.rating);
    expect(idle.conservative).toBe(settled.rating - 2 * RATING.maxRd);
  });

  it("ranks a ring of 4 farming keys far below the same count of real matches", () => {
    const ledger = new Ledger();
    const pool = trustedPool(ledger);
    const honest = key("honest");
    for (let i = 0; i < 50; i += 1) {
      ledger.play(1, [[honest], [nth(pool, i)]]);
    }
    const ring = keys("ring", 4);
    const pairs = ring.flatMap((a, i) => ring.slice(i + 1).map((b): [string, string] => [a, b]));
    for (let i = 0; i < 50; i += 1) {
      const [a, b] = nth(pairs, i);
      ledger.play(1, [[a], [b]], { winningTeam: a === ring[0] ? 0 : i % 2 });
    }
    const ratings = rate(ledger.receipts, 1, crypto);
    // Enough keys that the bound is the full 12, not P − 1.
    expect(ratings.size).toBeGreaterThanOrEqual(26);
    const real = of(ratings, honest).rating - RATING.initialRating;
    const farmed = of(ratings, ring[0]).rating - RATING.initialRating;
    expect(Math.abs(farmed)).toBeLessThan(0.05 * Math.abs(real));
    expect(of(ratings, ring[0]).wins).toBe(0);
    expect(of(ratings, honest)).toMatchObject({ wins: 20, streak: 20 });
  });

  it("gives full trust to 5 keys that all play each other, when nobody else has played", () => {
    const ledger = new Ledger();
    const five = keys("five", 5);
    roundRobin(ledger, 0, five);
    for (const other of five.slice(1)) {
      ledger.play(1, [[five[0]], [other]], { winningTeam: 0 });
    }
    const ratings = rate(ledger.receipts, 1, crypto);
    for (const pubkey of five) {
      expect(of(ratings, pubkey).trust).toBe(1);
    }
    // At the old D/12 bound, (4/12)³ would have kept this to a few points.
    const before = of(rate(ledger.receipts, 0, crypto), five[0]).rating;
    expect(of(ratings, five[0]).rating - before).toBeGreaterThan(50);
  });

  it("counts a fork for the others and as a loss for the forker, and marks the key", () => {
    const ledger = new Ledger();
    const pool = trustedPool(ledger);
    const [a, b, c] = pool;
    const kept = ledger.play(1, [[a], [b]]);
    const without = rate(ledger.receipts, 1, crypto);
    // a forks its chain to play c, and its receipt says a won.
    ledger.play(1, [[a], [c]], { prev: { [a]: prevOf(kept, a) } });
    const ratings = rate(ledger.receipts, 1, crypto);
    expect(of(ratings, a).forked).toBe(true);
    expect(of(ratings, c).forked).toBe(false);
    expect(of(ratings, a).lastReceiptHash).toBe(receiptHash(kept, sha256));
    expect(of(ratings, a)).toMatchObject({ matches: of(without, a).matches + 1, streak: 0 });
    expect(of(ratings, c)).toMatchObject({ matches: of(without, c).matches + 1 });
    expect(of(ratings, a).rating).toBeLessThan(of(without, a).rating);
    expect(of(ratings, c).rating).toBeLessThan(of(without, c).rating);
  });

  it("keeps a real loss counted when the loser backdates a fork against its own alt key", () => {
    const ledger = new Ledger();
    const [honest, cheat] = trustedPool(ledger);
    const noLoss = rate(ledger.receipts, 2, crypto);
    const loss = ledger.play(2, [[honest], [cheat]], { winningTeam: 0 });
    ledger.play(1, [[cheat], [key("cheat-alt")]], {
      prev: { [cheat]: prevOf(loss, cheat) },
      offChain: true,
    });
    const ratings = rate(ledger.receipts, 2, crypto);
    expect(of(ratings, cheat).forked).toBe(true);
    expect(of(ratings, honest).rating).toBeGreaterThan(of(noLoss, honest).rating);
    expect(of(ratings, honest).wins).toBe(of(noLoss, honest).wins + 1);
    expect(of(ratings, cheat).streak).toBe(0);
  });

  it("does not let a void forgery sorted first fork the honest receipt", () => {
    const ledger = new Ledger();
    const pool = trustedPool(ledger);
    const [a, b, c] = pool;
    // On a's prev, before a's honest match: c names a and b leavers and wins alone.
    ledger.play(1, [[c], [a, b]], { leavers: [a, b], offChain: true });
    const honest = ledger.play(1, [[a], [b]]);
    const ratings = rate(ledger.receipts, 1, crypto);
    expect(of(ratings, a).forked).toBe(false);
    expect(of(ratings, a).lastReceiptHash).toBe(receiptHash(honest, sha256));
  });

  it("voids a match with two valid results, and marks nobody forked", () => {
    const ledger = new Ledger();
    const pool = trustedPool(ledger);
    const [a, b] = pool;
    const day0 = rate(ledger.receipts, 1, crypto);
    const won = ledger.play(1, [[a], [b]]);
    const ratings = rate([...ledger.receipts, resultSwapped(won, null)], 1, crypto);
    for (const pubkey of [a, b]) {
      expect(of(ratings, pubkey)).toEqual(of(day0, pubkey));
    }
  });

  it("counts one match once, however many copies of it are published", () => {
    const ledger = new Ledger();
    const pool = trustedPool(ledger);
    const copy = ledger.play(1, [[pool[0]], [pool[1]]]);
    const once = rate(ledger.receipts, 1, crypto);
    expect([...rate([...ledger.receipts, copy], 1, crypto)]).toEqual([...once]);
  });

  it("loses for a leaver, even on the winning team", () => {
    const ledger = new Ledger();
    const pool = trustedPool(ledger);
    const [stayer, leaver, x, y] = pool;
    const day0 = rate(ledger.receipts, 1, crypto);
    ledger.play(
      1,
      [
        [stayer, leaver],
        [x, y],
      ],
      { winningTeam: 0, leavers: [leaver] },
    );
    const ratings = rate(ledger.receipts, 1, crypto);
    expect(of(ratings, leaver).rating).toBeLessThan(of(day0, leaver).rating);
    expect(of(ratings, leaver).streak).toBe(0);
    expect(of(ratings, stayer).rating).toBeGreaterThan(of(day0, stayer).rating);
    expect(of(ratings, x).rating).toBeLessThan(of(day0, x).rating);
  });

  it("voids a match whose host re-rounded a signer into a leaver", () => {
    const ledger = new Ledger();
    const pool = trustedPool(ledger);
    const [host, mate, x, y] = pool;
    const day0 = rate(ledger.receipts, 1, crypto);
    const final = ledger.play(
      1,
      [
        [host, mate],
        [x, y],
      ],
      { leavers: [x] },
    );
    const ratings = rate([...ledger.receipts, roundOf(final, [], x)], 1, crypto);
    for (const pubkey of [host, mate, x, y]) {
      expect(of(ratings, pubkey)).toEqual(of(day0, pubkey));
    }
  });

  it("loses for a leaver that signed no round, beside another seat's partial", () => {
    const ledger = new Ledger();
    const pool = trustedPool(ledger);
    const [host, mate, x, y] = pool;
    const day0 = rate(ledger.receipts, 1, crypto);
    const final = ledger.play(
      1,
      [
        [host, mate],
        [x, y],
      ],
      { leavers: [x] },
    );
    const ratings = rate([...ledger.receipts, roundOf(final, [], y)], 1, crypto);
    expect(of(ratings, x).rating).toBeLessThan(of(day0, x).rating);
    expect(of(ratings, host).rating).toBeGreaterThan(of(day0, host).rating);
    expect(of(ratings, y).matches).toBe(of(day0, y).matches + 1);
  });

  it("rates only the host when the host left", () => {
    const ledger = new Ledger();
    const pool = trustedPool(ledger);
    const [host, mate, x, y] = pool;
    const day0 = rate(ledger.receipts, 1, crypto);
    ledger.play(
      1,
      [
        [host, mate],
        [x, y],
      ],
      {
        endReason: "host-left",
        winningTeam: null,
        leavers: [host],
      },
    );
    const ratings = rate(ledger.receipts, 1, crypto);
    expect(of(ratings, host).rating).toBeLessThan(of(day0, host).rating);
    expect(of(ratings, host).matches).toBe(of(day0, host).matches + 1);
    for (const pubkey of [mate, x, y]) {
      expect(of(ratings, pubkey).rating).toBe(of(day0, pubkey).rating);
      expect(of(ratings, pubkey).matches).toBe(of(day0, pubkey).matches);
    }
  });

  it("keeps a draw out of a streak, and lets a loss end it", () => {
    const ledger = new Ledger();
    const pool = trustedPool(ledger);
    const [a, b, c, d] = pool;
    const streak = (): number => of(rate(ledger.receipts, 1, crypto), a).streak;
    ledger.play(1, [[a], [d]], { winningTeam: 1 });
    expect(streak()).toBe(0);
    ledger.play(1, [[a], [b]]);
    ledger.play(1, [[a], [c]]);
    expect(streak()).toBe(2);
    ledger.play(1, [[a], [d]], { winningTeam: null });
    expect(streak()).toBe(2);
    ledger.play(1, [[a], [b]], { winningTeam: 1 });
    expect(streak()).toBe(0);
  });
});

describe("rankOrder", () => {
  it("ranks by conservative value, then pubkey, and leaves provisional keys out", () => {
    const base = {
      name: "",
      characterId: "",
      rating: 1600,
      rd: 50,
      sigma: 0.06,
      conservative: 1500,
      matches: 10,
      lastPlayedDay: 0,
      provisional: false,
      wins: 0,
      streak: 0,
      forked: false,
      lastReceiptHash: ZERO_HASH,
      distinctOpponents: 0,
      trust: 0,
    };
    const ratings: Ratings = new Map([
      ["c", base],
      ["a", base],
      ["b", { ...base, conservative: 1700 }],
      ["d", { ...base, conservative: 1900, matches: 9, provisional: true }],
    ]);
    expect(rankOrder(ratings)).toEqual(["b", "a", "c"]);
  });
});

describe("the ranking bench", () => {
  it.runIf(process.env.BENCH_RANKING !== undefined)(
    "rates 10k receipts among 400 keys over 100 days",
    () => {
      const ledger = new Ledger();
      const pool = keys("bench", 400);
      for (let i = 0; i < 10_000; i += 1) {
        const at = (n: number): string => nth(pool, i * 7 + n * 131 + Math.floor(i / 400));
        ledger.play(
          Math.floor(i / 100),
          [
            [at(0), at(1)],
            [at(2), at(3)],
          ],
          { winningTeam: i % 3 === 0 ? null : i % 2 },
        );
      }
      const started = Date.now();
      const ratings = rate(ledger.receipts, 100, crypto);
      console.log(`rate: 10k receipts in ${String(Date.now() - started)} ms`);
      expect(rankOrder(ratings).length).toBeGreaterThan(0);
    },
    120_000,
  );
});
