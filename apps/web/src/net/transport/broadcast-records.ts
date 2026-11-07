/**
 * Finished matches between tabs of one browser (#2585): what e2e records
 * on, as `broadcast-queue.ts` is what it queues on. One `BroadcastChannel`
 * carrying the very message a relay would send, read by the same
 * `recordHearer` as the Nostr feed, so a test record passes the size,
 * validation and signature checks a player's does.
 *
 * A channel keeps nothing: a page hears the records posted while its
 * Matches page is open, and none from before.
 */
import type { MatchRecord } from "@vibewars/game-session";

import {
  publishableEvent,
  recordHearer,
  WATCH_SUBSCRIPTION_ID,
  type MatchRecordWatch,
  type MatchRecordWatchHandlers,
} from "./match-records.js";
import type { NostrEvent } from "./nostr-relays.js";
import { APP_ID } from "./relays.js";
import { verifyTicketSig } from "./ticket-key.js";

export const RECORDS_CHANNEL = `${APP_ID}:matches`;

/** `event` as a relay delivers it to the Matches page's subscription. */
export function recordMessage(event: NostrEvent): string {
  return JSON.stringify(["EVENT", WATCH_SUBSCRIPTION_ID, event]);
}

/** Post `record` on the channel, once; one this build would refuse is not sent. */
export function publishBroadcastRecord(record: MatchRecord): void {
  const event = publishableEvent(record, Date.now());
  if (event === undefined) {
    return;
  }
  const channel = new BroadcastChannel(RECORDS_CHANNEL);
  channel.postMessage(recordMessage(event));
  channel.close();
}

/** The records posted on the channel from now on, until closed. */
export function watchBroadcastRecords(on: MatchRecordWatchHandlers): MatchRecordWatch {
  const hear = recordHearer(on, { now: () => Date.now(), verifyTicketSig });
  const channel = new BroadcastChannel(RECORDS_CHANNEL);
  channel.onmessage = (message: MessageEvent<unknown>) => {
    hear(message.data);
  };
  return {
    close: () => {
      channel.close();
    },
  };
}
