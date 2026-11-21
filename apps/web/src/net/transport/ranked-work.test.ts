import { sha256 } from "@noble/hashes/sha2.js";
import { findWork, validWork, workNonce } from "@vibewars/ranking";
import { describe, expect, it } from "vitest";

import { rankedWork, type WorkWorker } from "./ranked-work.js";

const STARTED = "ab".repeat(32);
const PUBKEY = "cd".repeat(32);
/** Bits low enough for a test: the real search is the worker's. */
const BITS = 4;

/** A fake Worker that records what it was asked, and posts what the test says. */
function fakeWorker(): WorkWorker & {
  asked: unknown[];
  terminated: boolean;
  post(data: unknown): void;
} {
  const worker = {
    onmessage: null as WorkWorker["onmessage"],
    asked: [] as unknown[],
    terminated: false,
    postMessage(data: unknown) {
      worker.asked.push(data);
    },
    terminate() {
      worker.terminated = true;
    },
    post(data: unknown) {
      worker.onmessage?.(new MessageEvent("message", { data }));
    },
  };
  return worker;
}

describe("rankedWork (#3746)", () => {
  it("asks the worker for a stamp of its bits, and takes only one that holds", async () => {
    const worker = fakeWorker();
    const stamp = rankedWork(STARTED, PUBKEY, BITS, { createWorker: () => worker });
    expect(worker.asked).toEqual([{ startHash: STARTED, pubkey: PUBKEY, bits: BITS }]);
    const found = findWork(STARTED, PUBKEY, sha256, {
      from: 0,
      budgetMs: Number.POSITIVE_INFINITY,
      now: () => 0,
      bits: BITS,
    });
    const good = "work" in found ? found.work : "";
    const bad = Array.from({ length: 64 }, (_, n) => workNonce(n)).find(
      (work) => !validWork(STARTED, PUBKEY, work, sha256, BITS),
    );
    worker.post({ work: bad });
    worker.post({ nonsense: true });
    expect(worker.terminated).toBe(false);
    worker.post({ work: good });
    await expect(stamp).resolves.toBe(good);
    expect(worker.terminated).toBe(true);
  });
});
