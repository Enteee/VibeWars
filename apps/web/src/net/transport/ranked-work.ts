/**
 * This player's stamp for a ranked start (#3746): searched by the Worker
 * in `ranked-work.worker.ts`, from when every seat signed the start, so
 * it is ready long before the match's result is.
 */
import { sha256 } from "@noble/hashes/sha2.js";
import { RANKED_WORK_BITS, validWork } from "@vibewars/ranking";

/**
 * The zero bits a stamp needs: `RANKED_WORK_BITS`, but in the e2e build,
 * which sets `VITE_VIBEWARS_WORK_BITS` so its matches do not wait on a
 * search a player's would. `vite.config.ts` refuses anything not a count.
 */
export const WORK_BITS: number =
  import.meta.env.VITE_VIBEWARS_WORK_BITS === undefined
    ? RANKED_WORK_BITS
    : Number(import.meta.env.VITE_VIBEWARS_WORK_BITS);

/** What `rankedWork` needs of a `Worker`; a test hands in a fake. */
export interface WorkWorker {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(data: unknown): void;
  terminate(): void;
}

function createWorkWorker(): WorkWorker {
  return new Worker(new URL("./ranked-work.worker.ts", import.meta.url), { type: "module" });
}

/** The stamp a post carries, or `undefined` if it is not one. */
function workOf(data: unknown): string | undefined {
  if (typeof data !== "object" || data === null) {
    return undefined;
  }
  const { work } = data as Record<string, unknown>;
  return typeof work === "string" ? work : undefined;
}

/**
 * `pubkey`'s stamp for the start `startHash`, of `WORK_BITS`: settles once
 * the Worker posts one that holds, and the Worker goes.
 */
export function rankedWork(
  startHash: string,
  pubkey: string,
  deps: { createWorker(): WorkWorker } = { createWorker: createWorkWorker },
): Promise<string> {
  return new Promise((resolve) => {
    const worker = deps.createWorker();
    worker.onmessage = (event) => {
      const work = workOf(event.data);
      if (work === undefined || !validWork(startHash, pubkey, work, sha256, WORK_BITS)) {
        return;
      }
      worker.terminate();
      resolve(work);
    };
    worker.postMessage({ startHash, pubkey, bits: WORK_BITS });
  });
}
