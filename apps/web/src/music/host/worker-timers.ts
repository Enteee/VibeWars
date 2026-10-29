/**
 * `setInterval`/`clearInterval` backed by a dedicated Worker, for the
 * Strudel scheduler. A hidden tab, or a frame that makes no sound, has
 * its page timers throttled and drops most events; a Worker's timers are
 * not (ADR-0028, measurement 3).
 */
export interface Timers {
  setInterval(callback: () => void, ms: number): number;
  clearInterval(id: number): void;
}

const SOURCE = `const ids = new Map();
onmessage = (e) => {
  const [op, id, ms] = e.data;
  if (op === "set") ids.set(id, setInterval(() => postMessage(id), ms));
  else { clearInterval(ids.get(id)); ids.delete(id); }
};`;

/**
 * Whether a firing of an interval of `ms` runs its callback, given when
 * the callback last finished. A firing less than half an interval after the
 * last run is dropped (#1321): when the main thread falls behind, the
 * Worker's posts queue up, and the backlog drains in one pass instead of
 * each queued firing running the scheduler.
 */
export function shouldFire(lastRanAt: number | undefined, now: number, ms: number): boolean {
  return lastRanAt === undefined || now - lastRanAt >= ms / 2;
}

export function workerTimers(): Timers {
  const worker = new Worker(URL.createObjectURL(new Blob([SOURCE], { type: "text/javascript" })));
  const callbacks = new Map<number, { callback: () => void; ms: number }>();
  const lastRanAt = new Map<number, number>();
  let next = 1;
  worker.onmessage = (event: MessageEvent<number>) => {
    const id = event.data;
    const timer = callbacks.get(id);
    if (timer === undefined) return;
    if (!shouldFire(lastRanAt.get(id), performance.now(), timer.ms)) return;
    timer.callback();
    // When it finished, not started: firings queued during a slow run
    // arrive right after it and are dropped.
    lastRanAt.set(id, performance.now());
  };
  return {
    setInterval: (callback, ms) => {
      const id = next++;
      callbacks.set(id, { callback, ms });
      worker.postMessage(["set", id, ms]);
      return id;
    },
    clearInterval: (id) => {
      callbacks.delete(id);
      lastRanAt.delete(id);
      worker.postMessage(["clear", id]);
    },
  };
}
