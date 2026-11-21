/**
 * A ranked result signature's stamp (#3746), searched off the main
 * thread: `findWork` in slices of `SLICE_MS`, with as long a rest after
 * each, so the search takes at most half of one core and never a frame.
 * It is handed `{ startHash, pubkey, bits }` once and posts `{ work }`.
 */
import { sha256 } from "@noble/hashes/sha2.js";
import { findWork } from "@vibewars/ranking";

/** One slice of the search, and the rest after it. */
const SLICE_MS = 8;

onmessage = (event: MessageEvent<unknown>) => {
  const { data } = event;
  if (typeof data !== "object" || data === null) {
    return;
  }
  const { startHash, pubkey, bits } = data as Record<string, unknown>;
  if (typeof startHash !== "string" || typeof pubkey !== "string" || typeof bits !== "number") {
    return;
  }
  const slice = (from: number): void => {
    const search = findWork(startHash, pubkey, sha256, {
      from,
      budgetMs: SLICE_MS,
      now: () => performance.now(),
      bits,
    });
    if ("work" in search) {
      postMessage({ work: search.work });
      return;
    }
    setTimeout(() => {
      slice(search.next);
    }, SLICE_MS);
  };
  slice(0);
};
