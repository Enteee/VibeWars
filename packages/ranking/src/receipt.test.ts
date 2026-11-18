import { describe, expect, it } from "vitest";

import {
  type RankedReceipt,
  type RankedResult,
  type RankedStart,
  canonicalBytes,
  MAX_RECEIPT_BYTES,
  mergeReceipts,
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
  type TestSigner,
  testSigner,
} from "./receipt.test-support.js";

/** The text of ASCII bytes: every receipt here is ASCII. */
const text = (bytes: Uint8Array): string => String.fromCharCode(...bytes);

/** Two teams of two: `red[0]`, `red[1]` against `blue[0]`, `blue[1]`. */
type Pair = [TestSigner, TestSigner];

function match(): { red: Pair; blue: Pair; start: RankedStart } {
  const red: Pair = [testSigner(), testSigner()];
  const blue: Pair = [testSigner(), testSigner()];
  const seat = (signer: TestSigner, i: number) => ({
    pubkey: signer.pubkey,
    characterId: `char-${String(i)}`,
    name: `Seat ${String(i)}`,
    claimedRating: 800 + i,
    prev: ZERO_HASH,
  });
  return {
    red,
    blue,
    start: {
      matchId: "group-1",
      buildHash: "build-abc",
      mode: "team-arena",
      map: "isle-of-the-nameless",
      seed: 1234,
      startedAt: 1_795_000_000,
      leaderboardAsOf: 1_794_999_000,
      teams: [red.map(seat), blue.map((signer, i) => seat(signer, i + 2))],
    },
  };
}

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
    resultSigs: Object.fromEntries(resultSigners.map((s) => [s.pubkey, s.sign(resultOf_)])),
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
        leaderboardAsOf: Number.MAX_SAFE_INTEGER,
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
      resultSigs: sigs,
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
      startSigs: { ...good.startSigs, [pubkey]: good.resultSigs[pubkey] ?? "" },
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

  it("does not void a host-left result for the departed host's team of one", () => {
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
    const forged = { ...good, resultSigs: { ...good.resultSigs, [pubkey]: "00".repeat(64) } };
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
