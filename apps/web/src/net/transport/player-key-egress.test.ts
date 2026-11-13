import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { STARTER_BUILDS } from "@vibewars/game-core";
import {
  MATCH_RECORD_VERSION,
  createLobbyHost,
  joinLobby,
  recordTemplate,
  type LobbyMode,
  type MatchRecord,
  type PlayerKey,
  type Transport,
} from "@vibewars/game-session";
import { createMemoryNetwork } from "@vibewars/game-session/testing";
import { afterEach, describe, expect, it, vi } from "vitest";

import { STORAGE_NAMESPACE } from "../../storage/namespace.js";
import { arenaIds } from "../maps.js";
import { inviteUrl } from "../../ui/lobby-screen.js";
import { guildLink } from "../../ui/player-section.js";

import { matchRecordEvent, publishableEvent } from "./match-records.js";
import { loadPlayerKey, verifyPlayerProof } from "./player-key.js";

/**
 * #3227: the player key's secret stays in this browser's storage. Every
 * way out a key's owner has is driven here with a known secret, and what
 * leaves is searched for it in every encoding a slip could give it.
 */

const STORED_AT = `${STORAGE_NAMESPACE}.playerKey`;
/** A valid secp256k1 secret, made up for this test. */
const SECRET = "3b6a27bcceb6a42d62a3a8d02a6f0d73653215771de243a63ac048a18b59da29"; // pragma: allowlist secret

/** How a 32-byte secret could read in text: hex either case, base64 either alphabet, JSON bytes. */
function encodings(hex: string): string[] {
  const bytes = Buffer.from(hex, "hex");
  return [
    hex.toLowerCase(),
    hex.toUpperCase(),
    bytes.toString("base64"),
    bytes.toString("base64url"),
    JSON.stringify([...bytes]),
    JSON.stringify(Uint8Array.from(bytes)),
  ];
}

function expectNoSecret(out: readonly string[], secret: string): void {
  expect(out.length).toBeGreaterThan(0);
  for (const text of out) {
    for (const encoded of encodings(secret)) {
      expect(text).not.toContain(encoded);
    }
  }
}

/**
 * A `Storage` over a map, holding `stored` under the player key's name,
 * if any; `unreadable`, it throws on every read, as private browsing can.
 */
function storage(
  stored?: string,
  unreadable = false,
): Storage & { readonly items: Map<string, string> } {
  const items = new Map<string, string>(stored === undefined ? [] : [[STORED_AT, stored]]);
  return {
    items,
    get length() {
      return items.size;
    },
    clear: () => {
      items.clear();
    },
    getItem: (key) => {
      if (unreadable) {
        throw new Error("private browsing");
      }
      return items.get(key) ?? null;
    },
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => {
      items.delete(key);
    },
    setItem: (key, value) => {
      items.set(key, value);
    },
  };
}

const CODE = "aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789-_aBcDE"; // pragma: allowlist secret
const PROOF_KEY = new TextEncoder().encode("the egress test's proof key");
const MAP_IDS = ["test-arena"] as const;
const MODE_MAPS: Readonly<Record<LobbyMode, readonly string[]>> = {
  "random-arena": MAP_IDS,
  "team-arena": MAP_IDS,
  "heroes-ascent": MAP_IDS,
  gvg: MAP_IDS,
  "hosted-game": MAP_IDS,
};

/** `transport`, with every message it sends written down in `sent`. */
function recording(transport: Transport, sent: string[]): Transport {
  return {
    ...transport,
    send: (channel, data, to) => {
      sent.push(JSON.stringify([channel, data, to]));
      transport.send(channel, data, to);
    },
  };
}

/** A guest joins a lobby with `playerKey`: what it sent, and what the host's side sent it. */
async function joinWith(playerKey: PlayerKey): Promise<string[]> {
  const sent: string[] = [];
  const network = createMemoryNetwork();
  const lobby = createLobbyHost({
    transport: recording(network.join("host"), sent),
    code: CODE,
    proofKey: PROOF_KEY,
    mapIds: MAP_IDS,
    trackIds: [],
    modeMaps: MODE_MAPS,
    mapTeamSizes: { "test-arena": [1, 2, 4, 8] },
    hostedTeamSize: 4,
    teamLobby: false,
    random: () => 0.5,
    verifyPlayerProof,
    startMatch: () => {
      throw new Error("no match in the egress test");
    },
  });
  const options = {
    code: CODE,
    guildTag: null,
    heroRank: 0,
    guildCape: null,
    timeoutMs: 1000,
    relayPub: null,
  };
  await joinLobby({
    ...options,
    transport: lobby.local,
    proofKey: null,
    name: "Host",
    playerKey: loadPlayerKey(storage()),
  });
  lobby.setOpen(true);
  await joinLobby({
    ...options,
    transport: recording(network.join("guest"), sent),
    proofKey: PROOF_KEY,
    name: "Guest",
    playerKey,
  });
  return sent;
}

const played = (index: number) => {
  const build = STARTER_BUILDS.at(index);
  if (build === undefined) {
    throw new Error("no such starter build");
  }
  return recordTemplate(build);
};

/** A match record naming `pubkey`, as `match-host.ts` builds one for a human player. */
function recordOf(pubkey: string): MatchRecord {
  return {
    v: MATCH_RECORD_VERSION,
    mode: "random-arena",
    map: arenaIds()[0] ?? "",
    endedAt: 1_800_000_000,
    durationSeconds: 300,
    winningTeam: 0,
    endReason: "annihilation",
    teams: [
      { players: [{ name: "Ann", guildTag: "VIBE", bot: false, pubkey, template: played(0) }] },
      {
        players: [
          {
            name: "Elementalist Bot",
            guildTag: null,
            bot: true,
            pubkey: null,
            template: played(1),
          },
        ],
      },
    ],
  };
}

const CONSOLE = ["log", "info", "warn", "error", "debug"] as const;

/** Everything written to the console while `run` runs. */
async function consoleOf(run: () => Promise<unknown>): Promise<string[]> {
  const written: string[] = [];
  for (const method of CONSOLE) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      written.push(
        args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "),
      );
    });
  }
  await run();
  // A line nobody else wrote, so an empty console still searches something.
  written.push("");
  return written;
}

describe("the player key's secret never leaves this browser's storage (#3227)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is not in anything a lobby join sends, though the join proves the key", async () => {
    const key = loadPlayerKey(storage(SECRET));
    const sent = await joinWith(key);
    // The join carried the key's public half and a proof by it.
    expect(sent.some((message) => message.includes(key.pubkey))).toBe(true);
    expect(sent.some((message) => message.includes("lobby-proof"))).toBe(true);
    expectNoSecret(sent, SECRET);
  });

  it("is not in what the console says across a lobby join", async () => {
    expectNoSecret(await consoleOf(() => joinWith(loadPlayerKey(storage(SECRET)))), SECRET);
  });

  it("is not in a match record, nor its Nostr event, that names the key's owner", () => {
    const record = recordOf(loadPlayerKey(storage(SECRET)).pubkey);
    const events = [
      matchRecordEvent(record, 1_800_000_000_000),
      publishableEvent(record, 1_800_000_000_000),
    ];
    expect(events).not.toContain(undefined);
    expectNoSecret(
      [JSON.stringify(record), ...events.map((event) => JSON.stringify(event))],
      SECRET,
    );
  });

  it("is not in an invite link or a guild link", () => {
    loadPlayerKey(storage(SECRET));
    const where = { origin: "https://vibewars.example", pathname: "/" };
    expectNoSecret(
      [
        inviteUrl(CODE, where),
        guildLink("VIBE", null, where),
        guildLink("VIBE", { main: 1, trim: 2, emblem: 3 }, where),
      ],
      SECRET,
    );
  });

  it("is not sent once replaced, the malformed one it replaced neither", async () => {
    const malformed = "f".repeat(64); // above the curve's order: no secret
    const kept = storage(malformed);
    const sent = await joinWith(loadPlayerKey(kept));
    const fresh = kept.items.get(STORED_AT) ?? "";
    expect(fresh).not.toBe(malformed);
    expectNoSecret(sent, malformed);
    expectNoSecret(sent, fresh);
  });

  it("is not sent when storage throws on reading", async () => {
    const kept = storage(undefined, true);
    const sent = await joinWith(loadPlayerKey(kept));
    const fresh = kept.items.get(STORED_AT) ?? "";
    expect(fresh).toMatch(/^[0-9a-f]{64}$/);
    expectNoSecret(sent, fresh);
  });
});

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Every source file under `dir`, tests left out. */
function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return sources(full);
    }
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [full] : [];
  });
}

describe("who may read the player key (#3227)", () => {
  // A new reader fails here, and has to be reviewed before it is added.
  it.each([
    ["its storage key", /[.`"']playerKey[`"']/, ["net/transport/player-key.ts"]],
    ["loadPlayerKey", /\bloadPlayerKey\b/, ["main.ts", "net/transport/player-key.ts"]],
  ])("names %s only where it is read", (_what, pattern, allowed) => {
    const naming = sources(SRC)
      .filter((file) => pattern.test(fs.readFileSync(file, "utf8")))
      .map((file) => path.relative(SRC, file))
      .sort();
    expect(naming).toEqual(allowed);
  });
});
