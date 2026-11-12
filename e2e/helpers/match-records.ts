import type { Page } from "@playwright/test";

import {
  RECORDS_CHANNEL,
  recordMessage,
} from "../../apps/web/src/net/transport/broadcast-records.js";
import { matchRecordEvent } from "../../apps/web/src/net/transport/match-records.js";
import type { MatchRecord } from "../../packages/game-session/src/match-record.js";

/**
 * Post `record` as a finished match's host does in this build, so an open
 * Matches page hears it (#2585).
 */
export async function postMatchRecord(page: Page, record: MatchRecord): Promise<void> {
  const event = matchRecordEvent(record, Date.now());
  if (event === undefined) {
    throw new Error("record too big");
  }
  await page.evaluate(
    ([channel, message]) => {
      const post = new BroadcastChannel(channel);
      post.postMessage(message);
      post.close();
    },
    [RECORDS_CHANNEL, recordMessage(event)] as const,
  );
}
