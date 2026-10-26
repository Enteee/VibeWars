import type { WireCombat, WireCombatBatch } from "@vibewars/game-protocol";

import { messageBytes } from "./transport.js";

/**
 * `entries` in order, cut into batches each at most `maxBytes` as JSON
 * and `maxCount` long (#601): what the host sends as a tick's `"combat"`
 * messages, so a message stays one Trystero chunk however many fields an
 * event grows.
 *
 * Greedy, measuring each entry once: an array's JSON is its brackets,
 * its entries and a comma between each two, so the running size is
 * exact without serialising a batch again. An entry over `maxBytes` on
 * its own goes alone, never dropped or split; `sizeChecked` says so.
 */
export function packCombat(
  entries: readonly WireCombat[],
  maxBytes: number,
  maxCount: number,
): WireCombatBatch[] {
  const batches: WireCombat[][] = [];
  let batch: WireCombat[] = [];
  let bytes = 2;
  for (const entry of entries) {
    const size = messageBytes(entry);
    if (batch.length > 0 && (bytes + 1 + size > maxBytes || batch.length >= maxCount)) {
      batches.push(batch);
      batch = [];
      bytes = 2;
    }
    bytes += (batch.length === 0 ? 0 : 1) + size;
    batch.push(entry);
  }
  if (batch.length > 0) {
    batches.push(batch);
  }
  return batches;
}
