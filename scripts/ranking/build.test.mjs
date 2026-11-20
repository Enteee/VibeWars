/**
 * The leaderboard job (#3574), with the relays faked: it merges, skips
 * junk, never forgets a receipt, and writes the same bytes twice.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { schnorr } from "@noble/secp256k1";
import { parseReceipt, resultDigest, startDigest, startHash, ZERO_HASH } from "@vibewars/ranking";
import { afterEach, describe, expect, it } from "vitest";

import { run } from "./build.mjs";

/** @typedef {import("@vibewars/ranking").RankedReceipt} RankedReceipt */
/** @typedef {{ kind: number, tags: string[][], content: string }} RelayEvent */

/** @param {Uint8Array} bytes */
const sha256 = (bytes) => new Uint8Array(createHash("sha256").update(bytes).digest());
const hex = (/** @type {Uint8Array} */ bytes) => Buffer.from(bytes).toString("hex");

/** Four seats, each a real BIP-340 key. */
const KEYS = Array.from({ length: 4 }, () => {
  const { secretKey, publicKey } = schnorr.keygen();
  return {
    pubkey: hex(publicKey),
    /** @param {Uint8Array} digest */
    sign: (digest) => hex(schnorr.sign(digest, secretKey)),
  };
});
/** 2026-11-20, in days and seconds. */
const DAY = 20_412;

/**
 * A 2v2 receipt, team 0 winning, signed by every seat but `leavers`
 * and `unsigned`, and by `only` alone when given (a partial).
 * @param {{ matchId: string, leavers?: string[], only?: string, at?: number }} play
 * @returns {RankedReceipt}
 */
function receipt({ matchId, leavers = [], only, at = 0 }) {
  const seats = KEYS.map((key) => key.pubkey);
  const start = {
    matchId,
    buildHash: "build",
    mode: "team-arena",
    map: "isle",
    seed: 1,
    startedAt: DAY * 86_400 + 3_600 + at,
    leaderboardAsOf: 0,
    teams: [seats.slice(0, 2), seats.slice(2)].map((team) =>
      team.map((pubkey) => ({
        pubkey,
        characterId: "starter",
        name: `N${pubkey.slice(0, 4)}`,
        claimedRating: 800,
        prev: ZERO_HASH,
      })),
    ),
  };
  const result = {
    startHash: startHash(start, sha256),
    winningTeam: 0,
    endReason: "annihilation",
    leavers,
    durationSeconds: 300,
    replayHash: "ab".repeat(32),
  };
  const startOf = startDigest(start, sha256);
  const resultOf = resultDigest(result, sha256);
  const signers = KEYS.filter(
    (key) => !leavers.includes(key.pubkey) && (only === undefined || key.pubkey === only),
  );
  return {
    start,
    startSigs: Object.fromEntries(KEYS.map((key) => [key.pubkey, key.sign(startOf)])),
    result,
    resultSigs: Object.fromEntries(signers.map((key) => [key.pubkey, key.sign(resultOf)])),
  };
}

/**
 * `receipt` as a relay holds it, under `suffix` below its match's address.
 * @param {RankedReceipt | string} receipt
 * @returns {RelayEvent}
 */
function event(receipt, suffix = "") {
  const matchId = typeof receipt === "string" ? "junk" : receipt.start.matchId;
  return {
    kind: 30078,
    tags: [
      ["d", `vibewars-ranked/${matchId}${suffix}`],
      ["t", "vibewars-ranked"],
    ],
    content: typeof receipt === "string" ? receipt : JSON.stringify(receipt),
  };
}

const RELAYS = ["wss://a.example", "wss://b.example"];
/** @type {string[]} */
const dirs = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
const archiveDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ranking-"));
  dirs.push(dir);
  return dir;
};

/**
 * One run on `dir` against relays that hold `held` (`undefined`: down).
 * @param {string} dir
 * @param {(RelayEvent[] | undefined)[]} held
 */
async function runOn(dir, held) {
  /** @type {(number | undefined)[]} */
  const asked = [];
  const out = await run({
    dir,
    asOfDay: DAY,
    relays: RELAYS,
    fetch: (relay, since) => {
      asked.push(since);
      return Promise.resolve(held[RELAYS.indexOf(relay)]);
    },
  });
  return { ...out, asked };
}

/** @typedef {{ asOf: number, count: number, entries: { pubkey: string, matches: number }[] }} Board */
/** @param {string} leaderboard */
const entriesOf = (leaderboard) => {
  /** @type {unknown} */
  const parsed = JSON.parse(leaderboard);
  return /** @type {Board} */ (parsed);
};

describe("the leaderboard job", () => {
  it("rates a match, and writes the same bytes on a second run", async () => {
    const dir = archiveDir();
    const match = receipt({ matchId: "m1" });
    const first = await runOn(dir, [[event(match)], [event(match)]]);
    const board = entriesOf(first.leaderboard);
    expect(board.count).toBe(4);
    expect(board.entries.every((entry) => entry.matches === 1)).toBe(true);
    expect(board.asOf).toBe(match.start.startedAt);
    expect(first.receipts.split("\n").filter(Boolean)).toHaveLength(1);
    expect(first.asked).toEqual([undefined, undefined]);

    const second = await runOn(dir, [[event(match)], [event(match)]]);
    expect(second.receipts).toBe(first.receipts);
    expect(second.leaderboard).toBe(first.leaderboard);
    const third = await runOn(dir, [[event(match)], [event(match)]]);
    expect(third).toEqual(second);
    expect(second.asked).toEqual([
      match.start.startedAt - 2 * 86_400,
      match.start.startedAt - 2 * 86_400,
    ]);
    const hash = createHash("sha256").update(first.leaderboard).digest("hex");
    expect(first.log).toContain(`leaderboard.json sha256: ${hash}`);
  });

  it("merges partial copies of one result into one receipt", async () => {
    const dir = archiveDir();
    const [a, b, c, d] = KEYS.map((key) => key.pubkey);
    const partials = [a, b, c, d].map((only) => receipt({ matchId: "m1", only }));
    await runOn(dir, [partials.slice(0, 2).map((p) => event(p, "/r1/x")), undefined]);
    const { receipts, leaderboard } = await runOn(dir, [
      undefined,
      partials.slice(2).map((p) => event(p, "/r1/y")),
    ]);
    const lines = receipts.split("\n").filter(Boolean);
    expect(lines).toHaveLength(1);
    expect(Object.keys(parseReceipt(lines[0] ?? "")?.resultSigs ?? {})).toHaveLength(4);
    expect(entriesOf(leaderboard).entries.every((entry) => entry.matches === 1)).toBe(true);
  });

  it("skips and counts junk, and keeps the archive when every relay is down", async () => {
    const dir = archiveDir();
    const match = receipt({ matchId: "m1" });
    const forged = {
      ...match,
      startSigs: { ...match.startSigs, [KEYS[0]?.pubkey ?? ""]: "00".repeat(64) },
    };
    const elsewhere = {
      ...event(match),
      tags: [
        ["d", "vibewars-ranked/other"],
        ["t", "vibewars-ranked"],
      ],
    };
    const first = await runOn(dir, [
      [event(match), event("{not json"), event(forged), elsewhere],
      [],
    ]);
    expect(first.log).toMatch(/malformed: 2\n/);
    expect(first.log).toMatch(/start-signature: 1\n/);

    const down = await runOn(dir, [undefined, undefined]);
    expect(down.receipts).toBe(first.receipts);
    expect(down.leaderboard).toBe(first.leaderboard);
    expect(down.log).toContain("no relay reached: the archive is unchanged");
  });

  it("voids a re-round that names a signer a leaver, and rates one that names a true non-signer", async () => {
    const [, , x, y] = KEYS.map((key) => key.pubkey);
    if (x === undefined || y === undefined) {
      throw new Error("four keys");
    }
    const reRounded = archiveDir();
    const final = receipt({ matchId: "m1", leavers: [x] });
    const signedByX = receipt({ matchId: "m1", only: x });
    const voided = entriesOf(
      (await runOn(reRounded, [[event(final), event(signedByX, `/r1/${x}`)], []])).leaderboard,
    );
    expect(voided.entries.every((entry) => entry.matches === 0)).toBe(true);

    const refused = archiveDir();
    const signedByY = receipt({ matchId: "m1", only: y });
    const rated = entriesOf(
      (await runOn(refused, [[event(final), event(signedByY, `/r1/${y}`)], []])).leaderboard,
    );
    // Rated, not void: which way it moves each key is rate.test.ts's to show.
    expect(rated.entries.every((entry) => entry.matches === 1)).toBe(true);
  });
});
