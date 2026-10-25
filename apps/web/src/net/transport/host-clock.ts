/**
 * The main-thread side of the host's clock (#392): starts the Worker in
 * `host-clock.worker.ts` and hands each beat's elapsed seconds on, capped,
 * so a long stall runs at most `MAX_CATCH_UP_SECONDS` of match in one go
 * rather than a burst of ticks.
 */

/** The most match time one beat may run: 10 ticks. */
export const MAX_CATCH_UP_SECONDS = 0.5;

/** What `startHostClock` needs of a `Worker`; a test hands in a fake. */
export interface WorkerLike {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  terminate(): void;
}

/** The seconds a beat reports, or `undefined` if it is not one. */
function elapsedOf(data: unknown): number | undefined {
  if (typeof data !== "object" || data === null) {
    return undefined;
  }
  const { elapsed } = data as Record<string, unknown>;
  return typeof elapsed === "number" && Number.isFinite(elapsed) && elapsed >= 0
    ? elapsed
    : undefined;
}

function createClockWorker(): WorkerLike {
  return new Worker(new URL("./host-clock.worker.ts", import.meta.url), { type: "module" });
}

/** Call `onTick` with each beat's elapsed seconds until the returned `stop()`. */
export function startHostClock(
  onTick: (seconds: number) => void,
  deps: { createWorker(): WorkerLike } = { createWorker: createClockWorker },
): () => void {
  const worker = deps.createWorker();
  let stopped = false;
  worker.onmessage = (event) => {
    const elapsed = elapsedOf(event.data);
    if (!stopped && elapsed !== undefined) {
      onTick(Math.min(elapsed, MAX_CATCH_UP_SECONDS));
    }
  };
  return () => {
    stopped = true;
    worker.onmessage = null;
    worker.terminate();
  };
}
