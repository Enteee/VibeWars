import { describe, expect, it } from "vitest";

import { MAX_CATCH_UP_SECONDS, startHostClock } from "./host-clock.js";
import type { WorkerLike } from "./host-clock.js";

/** A Worker that beats only when the test says so. */
function fakeWorker(): WorkerLike & { beat(data: unknown): void; terminated: boolean } {
  const worker = {
    onmessage: null as WorkerLike["onmessage"],
    terminated: false,
    terminate() {
      worker.terminated = true;
    },
    beat(data: unknown) {
      worker.onmessage?.(new MessageEvent("message", { data }));
    },
  };
  return worker;
}

describe("the host clock (#392)", () => {
  it("passes each beat's elapsed seconds on", () => {
    const worker = fakeWorker();
    const ticks: number[] = [];
    startHostClock((seconds) => ticks.push(seconds), { createWorker: () => worker });
    worker.beat({ elapsed: 0.05 });
    worker.beat({ elapsed: 0.051 });
    expect(ticks).toEqual([0.05, 0.051]);
  });

  it("caps a beat after a long stall at MAX_CATCH_UP_SECONDS", () => {
    const worker = fakeWorker();
    const ticks: number[] = [];
    startHostClock((seconds) => ticks.push(seconds), { createWorker: () => worker });
    worker.beat({ elapsed: 12 });
    expect(ticks).toEqual([MAX_CATCH_UP_SECONDS]);
  });

  it("ignores a message that is not a beat", () => {
    const worker = fakeWorker();
    const ticks: number[] = [];
    startHostClock((seconds) => ticks.push(seconds), { createWorker: () => worker });
    for (const data of [null, "0.05", { elapsed: -1 }, { elapsed: Number.NaN }, {}]) {
      worker.beat(data);
    }
    expect(ticks).toEqual([]);
  });

  it("fires nothing after stop(), and terminates the Worker", () => {
    const worker = fakeWorker();
    const ticks: number[] = [];
    const stop = startHostClock((seconds) => ticks.push(seconds), { createWorker: () => worker });
    const onmessage = worker.onmessage;
    stop();
    onmessage?.(new MessageEvent("message", { data: { elapsed: 0.05 } }));
    worker.beat({ elapsed: 0.05 });
    expect(ticks).toEqual([]);
    expect(worker.terminated).toBe(true);
  });

  it("runs two clocks independently", () => {
    const [first, second] = [fakeWorker(), fakeWorker()];
    const ticks: string[] = [];
    const stopFirst = startHostClock((s) => ticks.push(`1:${String(s)}`), {
      createWorker: () => first,
    });
    startHostClock((s) => ticks.push(`2:${String(s)}`), { createWorker: () => second });
    stopFirst();
    first.beat({ elapsed: 0.05 });
    second.beat({ elapsed: 0.05 });
    expect(ticks).toEqual(["2:0.05"]);
  });
});
