import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { hashes, schnorr } from "@noble/secp256k1";
import { parseReceipt, resultDigest, startDigest, startHash, ZERO_HASH } from "@vibewars/ranking";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { RANKED_TOPIC as CLIENT_TOPIC } from "../../apps/web/src/net/transport/ranked-receipts.ts";
import { build, RANKED_EVENT_KIND, RANKED_TOPIC } from "./build.mjs";

/** @typedef {import("@vibewars/ranking").RankedReceipt} RankedReceipt */
/** @typedef {import("./build.mjs").FetchRelay} FetchRelay */

// Signing is synchronous only with a synchronous sha256, as in the client.
hashes.sha256 = sha256;

/** A seat key from a fixed seed, so a failure reproduces. */
const seat = (/** @type {number} */ n) => {
  const secretKey = sha256(new TextEncoder().encode(`ranking-build-${String(n)}`));
  const pubkey = bytesToHex(schnorr.getPublicKey(secretKey));
  return {
    pubkey,
    /** @param {Uint8Array} digest */
    sign: (digest) => bytesToHex(schnorr.sign(digest, secretKey, new Uint8Array(32))),
  };
};
const keys = [seat(0), seat(1), seat(2), seat(3)];
const DAY = 86_400;

/**
 * A 2v2 on `day`, signed for the result by `signers` (default: every non-leaver).
 *
 * @param {number} n
 * @param {{ day?: number, leavers?: string[], endReason?: "annihilation" | "host-left", signers?: number[] }} [play]
 * @returns {RankedReceipt}
 */
function receiptOf(n, play = {}) {
  const day = play.day ?? 1;
  const start = {
    matchId: `match-${String(n)}`,
    buildHash: "build",
    mode: "team-arena",
    map: "isle",
    seed: n,
    startedAt: day * DAY + n,
    leaderboardAsOf: 0,
    teams: [keys.slice(0, 2), keys.slice(2, 4)].map((team) =>
      team.map(({ pubkey }) => ({
        pubkey,
        characterId: "starter",
        name: `Name ${pubkey.slice(0, 4)}`,
        claimedRating: 800,
        prev: ZERO_HASH,
      })),
    ),
  };
  const hostLeft = play.endReason === "host-left";
  const leavers = play.leavers ?? [];
  const result = {
    startHash: startHash(start, sha256),
    winningTeam: hostLeft ? null : 0,
    endReason: play.endReason ?? "annihilation",
    leavers,
    durationSeconds: hostLeft ? 0 : 300,
    replayHash: hostLeft ? ZERO_HASH : "ab".repeat(32),
  };
  const startOf = startDigest(start, sha256);
  const resultOf = resultDigest(result, sha256);
  const signers = (play.signers ?? [0, 1, 2, 3])
    .map((i) => keys[i])
    .filter((key) => key !== undefined && !leavers.includes(key.pubkey));
  return {
    start,
    startSigs: Object.fromEntries(keys.map((key) => [key.pubkey, key.sign(startOf)])),
    result,
    resultSigs: Object.fromEntries(signers.map((key) => [key.pubkey, key.sign(resultOf)])),
  };
}

/**
 * @param {RankedReceipt} receipt
 * @param {string} [suffix] the `d` under the match's own address
 */
const eventOf = (receipt, suffix = "") => ({
  kind: RANKED_EVENT_KIND,
  tags: [
    ["d", `${RANKED_TOPIC}/${receipt.start.matchId}${suffix}`],
    ["t", RANKED_TOPIC],
  ],
  content: JSON.stringify(receipt),
});

/**
 * Relays that each hold `events`, or none, and the filters they were asked.
 *
 * @param {unknown[]} events
 * @param {{ down?: boolean }} [options]
 */
function fakeRelays(events, options = {}) {
  /** @type {Record<string, unknown>[]} */
  const asked = [];
  /** @type {FetchRelay} */
  const fetchRelay = (_url, filter) => {
    asked.push(filter);
    return Promise.resolve(
      options.down ? { reached: false, events: [] } : { reached: true, events },
    );
  };
  return { fetchRelay, asked };
}

const RELAYS = ["wss://a.example", "wss://b.example"];
const AS_OF = 2 * DAY;

/** @type {string} */
let archive;
beforeEach(async () => {
  archive = await mkdtemp(join(tmpdir(), "ranking-build-"));
});
afterEach(async () => {
  await rm(archive, { recursive: true, force: true });
});

/** @param {FetchRelay | undefined} fetchRelay */
const run = (fetchRelay) =>
  build({ archive, asOf: AS_OF, fetchRelay, relays: RELAYS, engine: "v-test" });
const read = (/** @type {string} */ file) => readFile(join(archive, file), "utf8");

/**
 * @typedef {object} Entry
 * @property {string} pubkey
 * @property {number | null} rank
 * @property {boolean} provisional
 * @property {number} matches
 * @property {number} wins
 *
 * @typedef {object} Board
 * @property {number} asOf
 * @property {string} engine
 * @property {number} count
 * @property {Entry[]} entries
 */
const leaderboard = async () => {
  /** @type {unknown} */
  const parsed = JSON.parse(await read("leaderboard.json"));
  return /** @type {Board} */ (parsed);
};

describe("ranking build", () => {
  it("tags its subscription as the client publishes", () => {
    expect(RANKED_TOPIC).toBe(CLIENT_TOPIC);
  });

  it("archives the receipts the relays hold once, and rates them", async () => {
    const receipt = receiptOf(1);
    const { fetchRelay } = fakeRelays([eventOf(receipt), eventOf(receipt)]);
    await run(fetchRelay);
    expect((await read("receipts.ndjson")).trim().split("\n")).toHaveLength(1);
    const board = await leaderboard();
    expect(board).toMatchObject({ asOf: AS_OF, engine: "v-test", count: 4 });
    const [winner] = board.entries;
    // Four keys that met two opponents each: nobody is trusted yet, so nothing is won.
    expect(winner).toMatchObject({ rank: null, provisional: true, matches: 1, wins: 0 });
  });

  it("writes byte-identical output from the same archive and relays", async () => {
    const { fetchRelay } = fakeRelays([eventOf(receiptOf(1)), eventOf(receiptOf(2))]);
    const outputs = () => Promise.all(["receipts.ndjson", "leaderboard.json", "log.txt"].map(read));
    const first = await run(fetchRelay);
    const files = await outputs();
    await rm(archive, { recursive: true });
    const second = await run(fetchRelay);
    expect(second.hash).toBe(first.hash);
    expect(await outputs()).toEqual(files);
    // Run again on its own output: nothing new, nothing changes.
    const again = await run(fetchRelay);
    const offline = await run(undefined);
    expect([again.hash, offline.hash]).toEqual([first.hash, first.hash]);
    expect((await outputs()).slice(0, 2)).toEqual(files.slice(0, 2));
  });

  it("gives the same hash whatever order the relays answer in", async () => {
    const events = [1, 2, 3].map((n) => eventOf(receiptOf(n)));
    const { hash } = await run(fakeRelays(events).fetchRelay);
    await rm(archive, { recursive: true });
    const reversed = await run(fakeRelays([...events].reverse()).fetchRelay);
    expect(reversed.hash).toBe(hash);
  });

  it("merges the host-left partials of one match into one receipt the host loses", async () => {
    const [host] = keys;
    const partials = [1, 2, 3].map((i) =>
      receiptOf(1, { endReason: "host-left", leavers: [host?.pubkey ?? ""], signers: [i] }),
    );
    const { fetchRelay } = fakeRelays(
      partials.map((partial, i) => eventOf(partial, `/host-left/${String(i)}`)),
    );
    await run(fetchRelay);
    const lines = (await read("receipts.ndjson")).trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(Object.keys(parseReceipt(lines[0] ?? "")?.resultSigs ?? {})).toHaveLength(3);
    const board = await leaderboard();
    expect(board.entries).toHaveLength(4);
    const rated = board.entries.filter((e) => e.matches > 0);
    expect(rated.map((e) => e.pubkey)).toEqual([host?.pubkey]);
  });

  it("voids a re-round that names a signer of an earlier round a leaver", async () => {
    const signer = keys[1]?.pubkey ?? "";
    const final = receiptOf(1, { leavers: [signer] });
    const earlier = receiptOf(1, { signers: [1] });
    await run(fakeRelays([eventOf(final), eventOf(earlier, `/r1/${signer}`)]).fetchRelay);
    expect((await read("receipts.ndjson")).trim().split("\n")).toHaveLength(2);
    const board = await leaderboard();
    expect(board.entries.every((e) => e.matches === 0)).toBe(true);
  });

  it("skips junk and counts it by reason", async () => {
    const forged = { ...receiptOf(2), startSigs: {} };
    const elsewhere = {
      ...eventOf(receiptOf(3)),
      tags: [
        ["d", "x"],
        ["t", RANKED_TOPIC],
      ],
    };
    const { fetchRelay } = fakeRelays([
      eventOf(receiptOf(1)),
      "not an event",
      { kind: RANKED_EVENT_KIND, tags: [["t", RANKED_TOPIC]], content: "{" },
      elsewhere,
      eventOf(forged),
    ]);
    const { log } = await run(fetchRelay);
    expect((await read("receipts.ndjson")).trim().split("\n")).toHaveLength(1);
    expect(log).toContain("rejected: 4\n  malformed: 3\n  start-signature: 1\n");
  });

  it("asks from two days before the newest archived match", async () => {
    const receipt = receiptOf(1, { day: 5 });
    await writeFile(join(archive, "receipts.ndjson"), `${JSON.stringify(receipt)}\n`);
    const { fetchRelay, asked } = fakeRelays([]);
    await run(fetchRelay);
    expect(asked).toEqual(
      RELAYS.map(() => ({
        kinds: [RANKED_EVENT_KIND],
        "#t": [RANKED_TOPIC],
        since: receipt.start.startedAt - 2 * DAY,
      })),
    );
  });

  it("keeps the archive whole and says so when every relay is down", async () => {
    await run(fakeRelays([eventOf(receiptOf(1))]).fetchRelay);
    const before = await read("receipts.ndjson");
    const { log } = await run(fakeRelays([], { down: true }).fetchRelay);
    expect(await read("receipts.ndjson")).toBe(before);
    expect(log).toContain("relays reached: 0 of 2");
    expect(log).toContain("every relay is down: the archive is unchanged");
  });
});
