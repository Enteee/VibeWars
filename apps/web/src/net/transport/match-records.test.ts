import { STARTER_BUILDS } from "@vibewars/game-core";
import {
  MATCH_RECORD_VERSION,
  MAX_RECORD_TEAM,
  recordTemplate,
  type MatchRecord,
} from "@vibewars/game-session";
import { afterEach, describe, expect, it, vi } from "vitest";

import { arenaIds } from "../maps.js";
import {
  MATCH_RECORD_EVENT_KIND,
  MATCH_RECORD_PUBLISH_MS,
  MAX_MATCH_RECORD_BYTES,
  matchRecordEvent,
  publishMatchRecord,
  watchMatchRecords,
  type HeardMatchRecord,
} from "./match-records.js";
import { eventId, signEvent, type NostrEvent, type RelaySocketHandlers } from "./nostr-relays.js";
import { newTicketKey, verifyTicketSig } from "./ticket-key.js";

const RELAYS = ["wss://one.example", "wss://two.example"];
const NOW = 1_800_000_000_000;

const fail = (): never => {
  throw new Error("no such starter build");
};

const played = (index: number) => recordTemplate(STARTER_BUILDS.at(index) ?? fail());

const RECORD: MatchRecord = {
  v: MATCH_RECORD_VERSION,
  mode: "random-arena",
  map: arenaIds()[0] ?? "",
  endedAt: NOW / 1000,
  durationSeconds: 300,
  winningTeam: 0,
  endReason: "annihilation",
  teams: [
    { players: [{ name: "Ann", guildTag: "VIBE", bot: false, template: played(0) }] },
    { players: [{ name: "Elementalist Bot", guildTag: null, bot: true, template: played(1) }] },
  ],
};

interface FakeSocket {
  readonly handlers: RelaySocketHandlers;
  readonly sent: string[];
  closed: boolean;
}

/** Relay sockets with no network: the test plays the relays. */
function publish(record: MatchRecord) {
  const sockets: FakeSocket[] = [];
  publishMatchRecord(record, {
    relays: RELAYS,
    now: () => NOW,
    openSocket: (_url, handlers) => {
      const socket: FakeSocket = { handlers, sent: [], closed: false };
      sockets.push(socket);
      return {
        send: (data) => socket.sent.push(data),
        close: () => {
          socket.closed = true;
        },
      };
    },
  });
  return sockets;
}

function eventSent(socket: FakeSocket): NostrEvent {
  const [verb, event] = JSON.parse(socket.sent[0] ?? "[]") as [string, NostrEvent];
  expect(verb).toBe("EVENT");
  return event;
}

describe("match records on Nostr (#2528)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is a NIP-78 event with its three tags, signed, carrying the record", () => {
    const event = matchRecordEvent(RECORD, NOW);

    expect(event?.kind).toBe(MATCH_RECORD_EVENT_KIND);
    expect(event?.created_at).toBe(NOW / 1000);
    expect(event?.tags).toEqual([
      ["d", expect.stringMatching(/^vibewars-match\/[0-9a-f]{32}$/)],
      ["t", "vibewars-matches"],
      ["v", String(MATCH_RECORD_VERSION)],
    ]);
    expect(JSON.parse(event?.content ?? "")).toEqual(RECORD);
    if (event === undefined) {
      return;
    }
    expect(verifyTicketSig(event.pubkey, eventId(event), event.sig)).toBe(true);
  });

  it("signs each record with a key of its own, under a fresh d tag", () => {
    const first = matchRecordEvent(RECORD, NOW);
    const second = matchRecordEvent(RECORD, NOW);

    expect(first?.pubkey).not.toBe(second?.pubkey);
    expect(first?.tags[0]).not.toEqual(second?.tags[0]);
  });

  it("sends the event to every relay and lets go once each has answered", async () => {
    const sockets = publish(RECORD);
    for (const socket of sockets) {
      socket.handlers.open();
    }
    const [event, again] = sockets.map(eventSent);
    expect(sockets).toHaveLength(2);
    expect(again).toEqual(event);
    const ok = JSON.stringify(["OK", event?.id, true, ""]);

    sockets[0]?.handlers.message(ok);
    // Another event's answer is not this one's.
    sockets[1]?.handlers.message(JSON.stringify(["OK", "0".repeat(64), true, ""]));
    await Promise.resolve();
    expect(sockets.some((socket) => socket.closed)).toBe(false);
    sockets[1]?.handlers.message(ok);
    await Promise.resolve();
    expect(sockets.every((socket) => socket.closed)).toBe(true);
  });

  it("gives up after a while, with no relay answering, and keeps nothing to retry", () => {
    vi.useFakeTimers();
    const sockets = publish(RECORD);

    vi.advanceTimersByTime(MATCH_RECORD_PUBLISH_MS);
    vi.runAllTicks();
    return Promise.resolve().then(() => {
      expect(sockets.every((socket) => socket.closed)).toBe(true);
    });
  });

  it("publishes a full 8v8, every name and tag as long as allowed, every bar the longest", () => {
    const longest = STARTER_BUILDS.map(recordTemplate).reduce((a, b) =>
      b.length > a.length ? b : a,
    );
    const team = (side: number) => ({
      players: Array.from({ length: MAX_RECORD_TEAM }, (_, index) => ({
        // Four bytes a grapheme, sixteen graphemes.
        name: `${"🏹".repeat(14)}${String(side)}${String(index)}`,
        guildTag: "WWWW",
        bot: false,
        template: longest,
      })),
    });
    const full: MatchRecord = { ...RECORD, teams: [team(0), team(1)] };
    const sockets = publish(full);
    sockets[0]?.handlers.open();
    const event = sockets[0] === undefined ? undefined : eventSent(sockets[0]);
    expect(event?.content).toBe(JSON.stringify(full));
  });

  it("publishes nothing over 8 KB", () => {
    const long = { ...RECORD, map: "x".repeat(MAX_MATCH_RECORD_BYTES) };
    expect(matchRecordEvent(long, NOW)).toBeUndefined();
  });

  it("publishes nothing it would not read from someone else", () => {
    expect(publish({ ...RECORD, teams: [{ players: [] }, ...RECORD.teams.slice(1)] })).toEqual([]);
    expect(publish({ ...RECORD, map: "nowhere" })).toEqual([]);
  });
});

/** Watch the records on fake relays: the test plays the relays. */
function watch(now = NOW) {
  const sockets: FakeSocket[] = [];
  const heard: HeardMatchRecord[] = [];
  const verified: string[] = [];
  let noRelay = 0;
  const watching = watchMatchRecords(
    {
      record: (record) => heard.push(record),
      noRelay: () => {
        noRelay += 1;
      },
    },
    {
      relays: RELAYS,
      now: () => now,
      verifyTicketSig: (pubkey, digest, sig) => {
        verified.push(pubkey);
        return verifyTicketSig(pubkey, digest, sig);
      },
      openSocket: (_url, handlers) => {
        const socket: FakeSocket = { handlers, sent: [], closed: false };
        sockets.push(socket);
        return {
          send: (data) => socket.sent.push(data),
          close: () => {
            socket.closed = true;
            handlers.close();
          },
        };
      },
    },
  );
  const deliver = (event: unknown, socket = 0) => {
    sockets[socket]?.handlers.message(JSON.stringify(["EVENT", "vibewars-matches", event]));
  };
  return { watching, sockets, heard, verified, deliver, noRelays: () => noRelay };
}

/** `content` signed as a record event would be, under `d`. */
function signedRecord(content: string, d = "vibewars-match/one"): NostrEvent {
  const key = newTicketKey();
  return signEvent(
    {
      pubkey: key.ticketId,
      created_at: NOW / 1000,
      kind: MATCH_RECORD_EVENT_KIND,
      tags: [
        ["d", d],
        ["t", "vibewars-matches"],
      ],
      content,
    },
    (digest) => key.sign(digest),
  );
}

describe("watching match records on Nostr (#2532)", () => {
  it("asks every relay, once open, for the last 100 records of the topic", () => {
    const { sockets } = watch();
    for (const socket of sockets) {
      socket.handlers.open();
    }
    expect(sockets).toHaveLength(2);
    for (const socket of sockets) {
      expect(JSON.parse(socket.sent[0] ?? "")).toEqual([
        "REQ",
        "vibewars-matches",
        { kinds: [MATCH_RECORD_EVENT_KIND], "#t": ["vibewars-matches"], limit: 100 },
      ]);
    }
  });

  it("hears a valid, signed record, once however many relays deliver it", () => {
    const { heard, verified, deliver } = watch();
    const event = matchRecordEvent(RECORD, NOW);
    deliver(event, 0);
    deliver(event, 1);
    expect(heard).toEqual([{ id: event?.tags[0]?.[1], record: RECORD }]);
    expect(verified).toHaveLength(1);
  });

  it("keeps the first record under a d tag, and drops a second one", () => {
    const { heard, deliver } = watch();
    const first = signedRecord(JSON.stringify(RECORD));
    const second = signedRecord(JSON.stringify({ ...RECORD, durationSeconds: 1 }));
    deliver(first);
    deliver(second);
    expect(heard.map(({ record }) => record.durationSeconds)).toEqual([300]);
  });

  it("drops a bad signature, an invalid record, oversized content and another kind", () => {
    const { heard, verified, deliver } = watch();
    const event = signedRecord(JSON.stringify(RECORD), "a");
    deliver({ ...event, sig: signedRecord(JSON.stringify(RECORD), "a").sig });
    deliver(signedRecord(JSON.stringify({ ...RECORD, map: "nowhere" }), "b"));
    deliver(
      signedRecord(JSON.stringify({ ...RECORD, junk: "x".repeat(MAX_MATCH_RECORD_BYTES) }), "c"),
    );
    deliver({ ...signedRecord(JSON.stringify(RECORD), "d"), kind: 1 });
    deliver(signedRecord("not json", "e"));
    expect(heard).toEqual([]);
    // Only the forged signature was worth a check: the rest failed before it.
    expect(verified).toHaveLength(1);
  });

  it("says no relay when every socket has closed", () => {
    const { sockets, noRelays } = watch();
    for (const socket of sockets) {
      socket.handlers.close();
    }
    expect(noRelays()).toBe(1);
  });

  it("closes every socket, and hears nothing after", () => {
    const { watching, sockets, heard, deliver } = watch();
    watching.close();
    deliver(matchRecordEvent(RECORD, NOW));
    expect(sockets.every((socket) => socket.closed)).toBe(true);
    expect(heard).toEqual([]);
  });
});
