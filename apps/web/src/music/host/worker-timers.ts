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

export function workerTimers(): Timers {
  const worker = new Worker(URL.createObjectURL(new Blob([SOURCE], { type: "text/javascript" })));
  const callbacks = new Map<number, () => void>();
  let next = 1;
  worker.onmessage = (event: MessageEvent<number>) => {
    callbacks.get(event.data)?.();
  };
  return {
    setInterval: (callback, ms) => {
      const id = next++;
      callbacks.set(id, callback);
      worker.postMessage(["set", id, ms]);
      return id;
    },
    clearInterval: (id) => {
      callbacks.delete(id);
      worker.postMessage(["clear", id]);
    },
  };
}
