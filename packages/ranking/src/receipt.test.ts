import { describe, expect, it } from "vitest";

import {
  type RankedReceipt,
  type RankedResult,
  type RankedStart,
  canonicalBytes,
  findWork,
  hasWork,
  RANKED_WORK_BITS,
  validWork,
  workDigest,
  workNonce,
  MAX_RECEIPT_BYTES,
  mergeReceipts,
  parseRankedReceipt,
  parseRankedResult,
  parseRankedStart,
  parseReceipt,
  receiptHash,
  resultDigest,
  startDigest,
  startHash,
  validateReceipt,
  ZERO_HASH,
} from "./receipt.js";
import {
  nobleReceiptCrypto as crypto,
  TEST_WORK_BITS,
  testResultSig,
  type TestSigner,
  testSigner,
} from "./receipt.test-support.js";

/** The text of ASCII bytes: every receipt here is ASCII. */
const text = (bytes: Uint8Array): string => String.fromCharCode(...bytes);

/** Two teams of two: `red[0]`, `red[1]` against `blue[0]`, `blue[1]`. */
type Pair = [TestSigner, TestSigner];

const seat = (signer: TestSigner, i: number) => ({
  pubkey: signer.pubkey,
  characterId: `char-${String(i)}`,
  name: `Seat ${String(i)}`,
  claimedRating: 800 + i,
  leaderboardAsOf: 1_794_999_000,
  prev: ZERO_HASH,
});

/** A start whose team `t` is seated by `teams[t]`. */
function startFor(teams: readonly (readonly TestSigner[])[]): RankedStart {
  let i = 0;
  return {
    matchId: "group-1",
    buildHash: "build-abc",
    mode: "team-arena",
    map: "isle-of-the-nameless",
    seed: 1234,
    startedAt: 1_795_000_000,
    teams: teams.map((team) => team.map((signer) => seat(signer, i++))),
  };
}

function match(): { red: Pair; blue: Pair; start: RankedStart } {
  const red: Pair = [testSigner(), testSigner()];
  const blue: Pair = [testSigner(), testSigner()];
  return { red, blue, start: startFor([red, blue]) };
}

/** Fresh signers in teams of `sizes`, and the start they sit in. */
function teamsOf(...sizes: number[]): { teams: TestSigner[][]; start: RankedStart } {
  const teams = sizes.map((size) => Array.from({ length: size }, () => testSigner()));
  return { teams, start: startFor(teams) };
}

const keys = (signers: readonly TestSigner[]): string[] => signers.map((s) => s.pubkey);

function resultOf(start: RankedStart, overrides: Partial<RankedResult> = {}): RankedResult {
  return {
    startHash: startHash(start, crypto.sha256),
    winningTeam: 0,
    endReason: "annihilation",
    leavers: [],
    durationSeconds: 412,
    replayHash: "ab".repeat(32),
    ...overrides,
  };
}

/** `start` and `result` signed by `startSigners` and `resultSigners`. */
function receipt(
  start: RankedStart,
  result: RankedResult,
  startSigners: readonly TestSigner[],
  resultSigners: readonly TestSigner[],
): RankedReceipt {
  const startOf = startDigest(start, crypto.sha256);
  const resultOf_ = resultDigest(result, crypto.sha256);
  return {
    start,
    startSigs: Object.fromEntries(startSigners.map((s) => [s.pubkey, s.sign(startOf)])),
    result,
    resultSigs: Object.fromEntries(
      resultSigners.map((s) => [s.pubkey, testResultSig(s, result.startHash, resultOf_)]),
    ),
  };
}

function fullReceipt(overrides: Partial<RankedResult> = {}) {
  const { red, blue, start } = match();
  const all = [...red, ...blue];
  return { red, blue, all, start, receipt: receipt(start, resultOf(start, overrides), all, all) };
}

describe("canonicalBytes", () => {
  it("sorts keys at every depth and leaves no whitespace", () => {
    expect(text(canonicalBytes({ b: 1, a: [{ d: "x", c: null }] }))).toBe(
      '{"a":[{"c":null,"d":"x"}],"b":1}',
    );
  });

  it("refuses what has no one encoding: fractions, undefined", () => {
    expect(() => canonicalBytes({ rating: 1500.5 })).toThrow(RangeError);
    expect(() => canonicalBytes({ name: undefined })).toThrow(TypeError);
  });

  it("gives one digest whatever order the start's keys were built in", () => {
    const { start } = match();
    const reordered = Object.fromEntries(Object.entries(start).reverse()) as unknown as RankedStart;
    expect(startHash(reordered, crypto.sha256)).toBe(startHash(start, crypto.sha256));
    expect(startHash(start, crypto.sha256)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("tags the start and the result apart: the same bytes never sign both", () => {
    const { start } = match();
    const asResult = start as unknown as RankedResult;
    expect(resultDigest(asResult, crypto.sha256)).not.toEqual(startDigest(start, crypto.sha256));
  });
});

describe("parseReceipt", () => {
  it("reads back what was encoded, and hashes the same", () => {
    const { receipt: original } = fullReceipt();
    const parsed = parseReceipt(text(canonicalBytes(original)));
    expect(parsed).toEqual(original);
    expect(parsed && receiptHash(parsed, crypto.sha256)).toBe(receiptHash(original, crypto.sha256));
  });

  it("refuses what is not a receipt", () => {
    const { receipt: good } = fullReceipt();
    const json = (value: unknown) => JSON.stringify(value);
    const firstKey = good.start.teams[0]?.[0]?.pubkey ?? "";
    const firstSig = good.resultSigs[firstKey]?.sig;
    const withSeat = (patch: object) =>
      json({
        ...good,
        start: {
          ...good.start,
          teams: [[{ ...good.start.teams[0]?.[0], ...patch }], good.start.teams[1]],
        },
      });
    for (const bad of [
      "",
      "not json",
      "[]",
      json({ ...good, start: undefined }),
      json({ ...good, result: { ...good.result, endReason: "surrender" } }),
      json({ ...good, result: { ...good.result, durationSeconds: 1.5 } }),
      json({ ...good, result: { ...good.result, replayHash: "AB".repeat(32) } }),
      json({ ...good, startSigs: { [good.start.teams[0]?.[0]?.pubkey ?? ""]: "00" } }),
      json({ ...good, resultSigs: { [firstKey]: { sig: firstSig } } }),
      json({ ...good, resultSigs: { [firstKey]: { sig: firstSig, work: "abc" } } }),
      json({ ...good, resultSigs: { [firstKey]: firstSig } }),
      json({ ...good, start: { ...good.start, teams: [good.start.teams[0]] } }),
      withSeat({ pubkey: "12".repeat(31) }),
      withSeat({ name: "x".repeat(41) }),
      withSeat({ claimedRating: 1500.5 }),
      withSeat({ prev: undefined }),
    ]) {
      expect(parseReceipt(bad), bad.slice(0, 80)).toBeUndefined();
    }
  });

  it("reads the largest receipt there can be", () => {
    // Every bound at its worst: escaped ids and names, extreme integers,
    // 16 leavers, and both signature maps full.
    const escaped = (length: number) => "\u0001".repeat(length);
    const seats = Array.from({ length: 16 }, (_, i) => ({
      pubkey: `${"f".repeat(62)}${i.toString(16).padStart(2, "0")}`,
      characterId: escaped(64),
      name: escaped(40),
      claimedRating: Number.MIN_SAFE_INTEGER,
      leaderboardAsOf: Number.MAX_SAFE_INTEGER,
      prev: "f".repeat(64),
    }));
    const sigs = Object.fromEntries(seats.map((seat) => [seat.pubkey, "f".repeat(128)]));
    const largest: RankedReceipt = {
      start: {
        matchId: escaped(64),
        buildHash: escaped(64),
        mode: escaped(64),
        map: escaped(64),
        seed: Number.MAX_SAFE_INTEGER,
        startedAt: Number.MAX_SAFE_INTEGER,
        teams: [seats.slice(0, 8), seats.slice(8)],
      },
      startSigs: sigs,
      result: {
        startHash: "f".repeat(64),
        winningTeam: Number.MAX_SAFE_INTEGER,
        endReason: "guild-lord",
        leavers: seats.map((seat) => seat.pubkey),
        durationSeconds: Number.MAX_SAFE_INTEGER,
        replayHash: "f".repeat(64),
      },
      resultSigs: Object.fromEntries(
        seats.map((seat) => [seat.pubkey, { sig: "f".repeat(128), work: "f".repeat(16) }]),
      ),
    };
    const json = text(canonicalBytes(largest));
    expect(json.length).toBeGreaterThan(20_000);
    expect(parseReceipt(json)).toEqual(largest);
  });

  it("drops the signatures of keys that are not seated", () => {
    const { all, start, receipt: good } = fullReceipt();
    const stranger = testSigner();
    const extra = receipt(start, good.result, [...all, stranger], [...all, stranger]);
    const parsed = parseReceipt(text(canonicalBytes(extra)));
    expect(parsed && Object.keys(parsed.startSigs)).not.toContain(stranger.pubkey);
    expect(parsed && Object.keys(parsed.resultSigs)).not.toContain(stranger.pubkey);
  });

  it("refuses more than 16 seats, and more than MAX_RECEIPT_BYTES", () => {
    const { receipt: good } = fullReceipt();
    const seat = good.start.teams[0]?.[0];
    const nine = Array.from({ length: 9 }, () => seat);
    expect(
      parseReceipt(JSON.stringify({ ...good, start: { ...good.start, teams: [nine, nine] } })),
    ).toBeUndefined();
    const padded = JSON.stringify({ ...good, pad: "x".repeat(MAX_RECEIPT_BYTES) });
    expect(parseReceipt(padded)).toBeUndefined();
  });
});

describe("parseRankedStart and parseRankedResult", () => {
  it("read a start and a result alone, as the wire carries them (#3573)", () => {
    const { start, receipt: original } = fullReceipt();
    expect(parseRankedStart(JSON.parse(JSON.stringify(start)))).toEqual(start);
    expect(parseRankedResult(JSON.parse(JSON.stringify(original.result)))).toEqual(original.result);
  });

  it("refuse a start with one team and a result with an unknown reason", () => {
    const { start, receipt: original } = fullReceipt();
    expect(parseRankedStart({ ...start, teams: [start.teams[0]] })).toBeUndefined();
    expect(parseRankedResult({ ...original.result, endReason: "boredom" })).toBeUndefined();
    expect(parseRankedStart("start")).toBeUndefined();
    expect(parseRankedResult(null)).toBeUndefined();
  });

  it("read a whole receipt already parsed, as a lobby message carries it", () => {
    const { receipt: original } = fullReceipt();
    expect(parseRankedReceipt(JSON.parse(JSON.stringify(original)))).toEqual(original);
    expect(parseRankedReceipt({ ...original, result: null })).toBeUndefined();
    expect(parseRankedReceipt([original])).toBeUndefined();
  });
});

describe("receiptHash", () => {
  it("names the match, whichever signatures a copy of it holds", () => {
    const { red, blue, all, start, receipt: good } = fullReceipt();
    const stranger = testSigner();
    const resigned = receipt(start, good.result, all, all);
    const partial = receipt(start, good.result, all, [red[0]]);
    const extra = receipt(start, good.result, [...all, stranger], [...all, blue[1], stranger]);
    const hash = receiptHash(good, crypto.sha256);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    for (const copy of [resigned, partial, extra]) {
      expect(receiptHash(copy, crypto.sha256)).toBe(hash);
    }
    const draw = receipt(start, resultOf(start, { winningTeam: null }), all, all);
    expect(receiptHash(draw, crypto.sha256)).not.toBe(hash);
  });
});

describe("validateReceipt", () => {
  it("passes a receipt every seat signed twice", () => {
    expect(validateReceipt(fullReceipt().receipt, crypto)).toEqual({ ok: true, void: false });
  });

  it("fails a pubkey seated twice", () => {
    const { red, blue, start } = match();
    const [reds = [], blues = []] = start.teams;
    const twice: RankedStart = { ...start, teams: [reds, [...blues, ...reds.slice(0, 1)]] };
    const all = [...red, ...blue];
    expect(validateReceipt(receipt(twice, resultOf(twice), all, all), crypto)).toEqual({
      ok: false,
      reason: "duplicate-seat",
    });
  });

  it("fails a result that ends another start", () => {
    const { all, start } = fullReceipt();
    const other = { ...start, seed: 99 };
    expect(validateReceipt(receipt(start, resultOf(other), all, all), crypto)).toEqual({
      ok: false,
      reason: "start-hash",
    });
  });

  it("fails a seat that did not sign the start, or signed something else", () => {
    const { red, blue, all, start, receipt: good } = fullReceipt();
    const missing = receipt(start, good.result, [...red, blue[0]], all);
    expect(validateReceipt(missing, crypto)).toEqual({ ok: false, reason: "start-signature" });
    const pubkey = red[0].pubkey;
    const wrong = {
      ...good,
      startSigs: { ...good.startSigs, [pubkey]: good.resultSigs[pubkey]?.sig ?? "" },
    };
    expect(validateReceipt(wrong, crypto)).toEqual({ ok: false, reason: "start-signature" });
  });

  it("fails a winning team that is not one", () => {
    expect(validateReceipt(fullReceipt({ winningTeam: 2 }).receipt, crypto)).toEqual({
      ok: false,
      reason: "winning-team",
    });
  });

  it("fails a leaver who was not seated", () => {
    const stranger = testSigner();
    expect(validateReceipt(fullReceipt({ leavers: [stranger.pubkey] }).receipt, crypto)).toEqual({
      ok: false,
      reason: "leavers",
    });
  });

  it("fails a non-leaver who did not sign the result; passes once they are a leaver", () => {
    const { red, blue, all, start } = fullReceipt();
    const quitter = blue[1];
    const signers = [...red, blue[0]];
    expect(validateReceipt(receipt(start, resultOf(start), all, signers), crypto)).toEqual({
      ok: false,
      reason: "result-signature",
    });
    const left = resultOf(start, { leavers: [quitter.pubkey] });
    expect(validateReceipt(receipt(start, left, all, signers), crypto)).toEqual({
      ok: true,
      void: false,
    });
  });

  it("voids, not passes, a team all of whose members left, with no signature from it", () => {
    const { red, blue, all, start } = fullReceipt();
    const left = resultOf(start, { leavers: blue.map((s) => s.pubkey) });
    expect(validateReceipt(receipt(start, left, all, red), crypto)).toEqual({
      ok: true,
      void: true,
    });
  });

  it("voids a host that names every other seat a leaver and signs a win alone (#3594)", () => {
    const { red, all, start } = fullReceipt();
    const host = red[0];
    const forged = resultOf(start, {
      winningTeam: 0,
      leavers: all.filter((s) => s !== host).map((s) => s.pubkey),
    });
    expect(validateReceipt(receipt(start, forged, all, [host]), crypto)).toEqual({
      ok: true,
      void: true,
    });
  });

  it("voids a 4v4 the host's team signs alone, every opponent named a leaver", () => {
    const { teams, start } = teamsOf(4, 4);
    const [hosts = [], opponents = []] = teams;
    const forged = resultOf(start, { leavers: keys(opponents) });
    expect(validateReceipt(receipt(start, forged, teams.flat(), hosts), crypto)).toEqual({
      ok: true,
      void: true,
    });
  });

  it("rates a 4v4 the host's team and one opponent sign: five of eight", () => {
    const { teams, start } = teamsOf(4, 4);
    const [hosts = [], [opponent, ...rest] = []] = teams;
    if (opponent === undefined) {
      throw new Error("no opponent");
    }
    const left = resultOf(start, { leavers: keys(rest) });
    const signers = [...hosts, opponent];
    expect(validateReceipt(receipt(start, left, teams.flat(), signers), crypto)).toEqual({
      ok: true,
      void: false,
    });
  });

  it("rates a 2v2v2 two teams sign while the third signs nothing", () => {
    const { teams, start } = teamsOf(2, 2, 2);
    const [red = [], blue = [], green = []] = teams;
    const left = resultOf(start, { leavers: keys(green) });
    expect(validateReceipt(receipt(start, left, teams.flat(), [...red, ...blue]), crypto)).toEqual({
      ok: true,
      void: false,
    });
  });

  it("voids exactly half signing, however the signers are spread over the teams", () => {
    const { red, blue, all, start } = fullReceipt();
    const left = resultOf(start, { leavers: [red[1].pubkey, blue[1].pubkey] });
    expect(validateReceipt(receipt(start, left, all, [red[0], blue[0]]), crypto)).toEqual({
      ok: true,
      void: true,
    });
  });

  it("counts no signature of an unseated key toward the majority", () => {
    const { red, blue, all, start } = fullReceipt();
    const strangers = [testSigner(), testSigner()];
    const left = resultOf(start, { leavers: keys(blue) });
    const signers = [...red, ...strangers];
    expect(validateReceipt(receipt(start, left, all, signers), crypto)).toEqual({
      ok: true,
      void: true,
    });
  });

  it("counts a leaver who signed anyway toward the majority", () => {
    const { red, blue, all, start } = fullReceipt();
    const left = resultOf(start, { leavers: [blue[0].pubkey, blue[1].pubkey] });
    expect(validateReceipt(receipt(start, left, all, [...red, blue[0]]), crypto)).toEqual({
      ok: true,
      void: false,
    });
  });

  it("rates a host-left result every seat but the departed host signed", () => {
    const { red, blue, start: pair } = fullReceipt();
    const host = red[0];
    const [hostSeat] = pair.teams[0] ?? [];
    if (hostSeat === undefined) {
      throw new Error("no host seat");
    }
    const start: RankedStart = { ...pair, teams: [[hostSeat], pair.teams[1] ?? []] };
    const hostLeft = resultOf(start, {
      endReason: "host-left",
      leavers: [host.pubkey],
      winningTeam: null,
      durationSeconds: 0,
      replayHash: ZERO_HASH,
    });
    expect(validateReceipt(receipt(start, hostLeft, [host, ...blue], blue), crypto)).toEqual({
      ok: true,
      void: false,
    });
  });

  it("ignores a signature from a key that is not seated", () => {
    const { all, start, receipt: good } = fullReceipt();
    const stranger = testSigner();
    const extra = receipt(start, good.result, [...all, stranger], [...all, stranger]);
    expect(validateReceipt(extra, crypto)).toEqual({ ok: true, void: false });
  });

  it("holds a host-left result to one leaver, no winner, no time and no replay", () => {
    const { red, blue, all, start } = fullReceipt();
    const host = red[0];
    const stayed = all.filter((s) => s !== host);
    const hostLeft = {
      endReason: "host-left",
      leavers: [host.pubkey],
      winningTeam: null,
      durationSeconds: 0,
      replayHash: ZERO_HASH,
    } as const;
    expect(validateReceipt(receipt(start, resultOf(start, hostLeft), all, stayed), crypto)).toEqual(
      {
        ok: true,
        void: false,
      },
    );
    for (const bad of [
      { leavers: [host.pubkey, blue[0].pubkey] },
      { winningTeam: 1 },
      { durationSeconds: 30 },
      { replayHash: "ab".repeat(32) },
    ]) {
      const result = resultOf(start, { ...hostLeft, ...bad });
      expect(
        validateReceipt(receipt(start, result, all, all), crypto),
        JSON.stringify(bad),
      ).toEqual({ ok: false, reason: "host-left" });
    }
  });
});

/** The first stamp for `pubkey` under start `started` that `paid` does not take. */
function unpaidStamp(started: string, pubkey: string, paid: (work: string) => boolean): string {
  let from = 0;
  for (;;) {
    const found = findWork(started, pubkey, crypto.sha256, {
      from,
      budgetMs: Number.POSITIVE_INFINITY,
      now: () => 0,
      bits: TEST_WORK_BITS,
    });
    if (!("work" in found)) {
      throw new Error("an unbounded search always ends in a stamp");
    }
    if (!paid(found.work)) {
      return found.work;
    }
    from = Number.parseInt(found.work, 16) + 1;
  }
}

describe("proof of work (#3746)", () => {
  it("passes a stamp of enough bits, and fails one of too few as no-work", () => {
    const { blue, receipt: good } = fullReceipt();
    expect(validateReceipt(good, crypto)).toEqual({ ok: true, void: false });
    const pubkey = blue[0].pubkey;
    const entry = good.resultSigs[pubkey];
    // A nonce whose digest misses the first of TEST_WORK_BITS zero bits.
    const weak = Array.from({ length: 64 }, (_, n) => workNonce(n)).find(
      (work) => !hasWork(workDigest(good.result.startHash, pubkey, work, crypto.sha256), 1),
    );
    expect(entry && weak).toBeDefined();
    const unpaid = {
      ...good,
      resultSigs: { ...good.resultSigs, [pubkey]: { sig: entry?.sig ?? "", work: weak ?? "" } },
    };
    expect(validateReceipt(unpaid, crypto)).toEqual({ ok: false, reason: "no-work" });
  });

  it("fails a stamp found for another start or another key", () => {
    const { red, blue, receipt: good } = fullReceipt();
    const { startHash: started } = good.result;
    const pubkey = blue[0].pubkey;
    const sig = good.resultSigs[pubkey]?.sig ?? "";
    const paid = (work: string) => validWork(started, pubkey, work, crypto.sha256, TEST_WORK_BITS);
    const stamped = (work: string) => ({
      ...good,
      resultSigs: { ...good.resultSigs, [pubkey]: { sig, work } },
    });
    // The first stamp of each other (start, key) that does not pay for this one by chance.
    for (const [otherStart, otherKey] of [
      ["cd".repeat(32), pubkey],
      [started, red[0].pubkey],
    ] as const) {
      const work = unpaidStamp(otherStart, otherKey, paid);
      expect(validWork(otherStart, otherKey, work, crypto.sha256, TEST_WORK_BITS)).toBe(true);
      expect(validateReceipt(stamped(work), crypto)).toEqual({ ok: false, reason: "no-work" });
    }
  });

  it("fails a partial whose one signature is unpaid, not only a whole receipt", () => {
    const { red, all, start } = fullReceipt();
    const partial = receipt(start, resultOf(start), all, [red[0]]);
    expect(validateReceipt(partial, crypto)).toEqual({ ok: false, reason: "result-signature" });
    const pubkey = red[0].pubkey;
    const weak = Array.from({ length: 64 }, (_, n) => workNonce(n)).find(
      (work) => !validWork(partial.result.startHash, pubkey, work, crypto.sha256, TEST_WORK_BITS),
    );
    const unpaid = {
      ...partial,
      resultSigs: { [pubkey]: { sig: partial.resultSigs[pubkey]?.sig ?? "", work: weak ?? "" } },
    };
    expect(validateReceipt(unpaid, crypto)).toEqual({ ok: false, reason: "no-work" });
  });

  it("counts leading zero bits across bytes", () => {
    expect(hasWork(Uint8Array.of(0, 0, 0x3f), 18)).toBe(true);
    expect(hasWork(Uint8Array.of(0, 0, 0x40), 18)).toBe(false);
    expect(hasWork(Uint8Array.of(0, 0x80), 8)).toBe(true);
    expect(hasWork(Uint8Array.of(0x01), 0)).toBe(true);
  });

  it("finds in slices the nonce one long search finds", () => {
    const pubkey = testSigner().pubkey;
    const once = findWork("group-1", pubkey, crypto.sha256, {
      from: 0,
      budgetMs: Number.POSITIVE_INFINITY,
      now: () => 0,
      bits: 12,
    });
    // A clock that runs out after every check: one 256-hash block a slice.
    let clock = 0;
    let search = findWork("group-1", pubkey, crypto.sha256, {
      from: 0,
      budgetMs: 1,
      now: () => (clock += 1),
      bits: 12,
    });
    let slices = 1;
    while ("next" in search) {
      search = findWork("group-1", pubkey, crypto.sha256, {
        from: search.next,
        budgetMs: 1,
        now: () => (clock += 1),
        bits: 12,
      });
      slices += 1;
    }
    expect(search).toEqual(once);
    expect(slices).toBeGreaterThan(1);
    expect("work" in search && validWork("group-1", pubkey, search.work, crypto.sha256, 12)).toBe(
      true,
    );
  });

  it("asks a desktop core about five seconds a stamp", () => {
    expect(RANKED_WORK_BITS).toBe(22);
  });
});

describe("mergeReceipts", () => {
  it("unites two partial host-left receipts into a valid one", () => {
    const { red, blue, all, start } = fullReceipt();
    const host = red[0];
    const result = resultOf(start, {
      endReason: "host-left",
      leavers: [host.pubkey],
      winningTeam: null,
      durationSeconds: 0,
      replayHash: ZERO_HASH,
    });
    const mine = receipt(start, result, all, [red[1]]);
    const theirs = receipt(start, result, all, blue);
    expect(validateReceipt(mine, crypto)).toEqual({ ok: false, reason: "result-signature" });
    const merged = mergeReceipts(mine, theirs, crypto);
    expect(merged && validateReceipt(merged, crypto)).toEqual({ ok: true, void: false });
    expect(merged && receiptHash(merged, crypto.sha256)).toBe(receiptHash(mine, crypto.sha256));
  });

  it("refuses receipts whose results differ, and drops a signature that does not verify", () => {
    const { blue, all, start, receipt: good } = fullReceipt();
    const draw = receipt(start, resultOf(start, { winningTeam: null }), all, all);
    expect(mergeReceipts(good, draw, crypto)).toBeUndefined();
    const pubkey = blue[0].pubkey;
    const forged = {
      ...good,
      resultSigs: { ...good.resultSigs, [pubkey]: { sig: "00".repeat(64), work: "0".repeat(16) } },
    };
    expect(mergeReceipts(forged, good, crypto)?.resultSigs[pubkey]).toBe(good.resultSigs[pubkey]);
  });

  it("keeps no signature of a key that is not seated", () => {
    const { all, start, receipt: good } = fullReceipt();
    const stranger = testSigner();
    const extra = receipt(start, good.result, [...all, stranger], [...all, stranger]);
    const merged = mergeReceipts(extra, good, crypto);
    expect(merged && Object.keys(merged.startSigs)).not.toContain(stranger.pubkey);
    expect(merged && Object.keys(merged.resultSigs)).not.toContain(stranger.pubkey);
  });
});
