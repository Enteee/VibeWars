import { STARTER_BUILDS } from "@vibewars/game-core";
import { recordTemplate, type MatchRecord } from "@vibewars/game-session";
import { afterEach, describe, expect, it } from "vitest";

import { arenaIds } from "../maps.js";
import {
  RECORDS_CHANNEL,
  publishBroadcastRecord,
  recordMessage,
  watchBroadcastRecords,
} from "./broadcast-records.js";
import { matchRecordEvent, type HeardMatchRecord, type MatchRecordWatch } from "./match-records.js";

/** A real-timer wait long enough for every posted message to land. */
async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 50));
}

const fail = (): never => {
  throw new Error("no such starter build");
};

const played = (index: number) => recordTemplate(STARTER_BUILDS.at(index) ?? fail());

function record(): MatchRecord {
  return {
    v: 1,
    mode: "random-arena",
    map: arenaIds()[0] ?? "",
    endedAt: Math.floor(Date.now() / 1000),
    durationSeconds: 300,
    winningTeam: 0,
    endReason: "annihilation",
    teams: [
      { players: [{ name: "Ann", guildTag: null, bot: false, template: played(0) }] },
      { players: [{ name: "Elementalist Bot", guildTag: null, bot: true, template: played(1) }] },
    ],
  };
}

const opened: MatchRecordWatch[] = [];

function watch(): HeardMatchRecord[] {
  const heard: HeardMatchRecord[] = [];
  opened.push(
    watchBroadcastRecords({
      record: (one) => heard.push(one),
      noRelay: () => undefined,
    }),
  );
  return heard;
}

function post(message: unknown): void {
  const channel = new BroadcastChannel(RECORDS_CHANNEL);
  channel.postMessage(message);
  channel.close();
}

afterEach(() => {
  for (const one of opened.splice(0)) {
    one.close();
  }
});

describe("match records between tabs (#2585)", () => {
  it("hears a record another tab publishes", async () => {
    const heard = watch();
    const published = record();
    publishBroadcastRecord(published);
    await settle();
    expect(heard.map((one) => one.record)).toEqual([published]);
  });

  it("checks what it hears as the Nostr feed does: a bad signature or a second copy is dropped", async () => {
    const heard = watch();
    const event = matchRecordEvent(record(), Date.now()) ?? fail();
    post(recordMessage({ ...event, sig: "0".repeat(128) }));
    post("not a relay message");
    post(recordMessage(event));
    post(recordMessage(event));
    await settle();
    expect(heard).toHaveLength(1);
  });

  it("hears nothing once closed", async () => {
    const heard = watch();
    opened.splice(0).forEach((one) => {
      one.close();
    });
    publishBroadcastRecord(record());
    await settle();
    expect(heard).toEqual([]);
  });
});
