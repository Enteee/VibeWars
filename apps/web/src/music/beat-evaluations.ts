import type { BeatEditStore } from "./beat-edits.js";

/** What the beat editor sent the host to evaluate. */
export type BeatEvaluation =
  { readonly kind: "edit"; readonly source: string } | { readonly kind: "reset" };

/**
 * The beat editor's evaluations of one track (#373), matched to the host's
 * answers by their number. What the host says it plays is what is kept, in
 * the order it said so; only the newest evaluation's answer is shown.
 */
export interface BeatEvaluations {
  /** `evaluation` was sent to the host as number `seq`. */
  sent(seq: number, evaluation: BeatEvaluation): void;
  /**
   * The host plays `seq`'s source, so it is kept. Returns the evaluation
   * if it is the newest sent and so shown, or `undefined`.
   */
  evaluated(seq: number): BeatEvaluation | undefined;
  /** `seq` failed: whether it is the newest sent, so its error is shown. */
  failed(seq: number): boolean;
  /** Forget the edit at once, ahead of the host's answer to the reset. */
  reset(): void;
  /** Resolves once every change to the store asked for so far is made. */
  settled(): Promise<void>;
}

/**
 * Evaluations of `trackId`, shipped as `shipped`, whose hash is `hashed`.
 * Every change to `edits` waits for the hash in one queue, so a reset never
 * lands before a save asked for ahead of it.
 */
export function beatEvaluations(
  trackId: string,
  shipped: string,
  edits: BeatEditStore,
  hashed: Promise<string>,
): BeatEvaluations {
  const waiting = new Map<number, BeatEvaluation>();
  let newest = 0;
  let writes: Promise<void> = Promise.resolve();

  const write = (change: (hash: string) => void): void => {
    writes = writes.then(async () => {
      change(await hashed);
    });
  };
  const forget = (): void => {
    write(() => {
      edits.remove(trackId);
    });
  };

  return {
    sent(seq, evaluation) {
      waiting.set(seq, evaluation);
      newest = Math.max(newest, seq);
    },
    evaluated(seq) {
      const done = waiting.get(seq);
      if (done === undefined) {
        return undefined;
      }
      waiting.delete(seq);
      if (done.kind === "reset" || done.source === shipped) {
        forget();
      } else {
        const { source } = done;
        write((hash) => {
          edits.save(trackId, { shippedHash: hash, source });
        });
      }
      return seq === newest ? done : undefined;
    },
    failed(seq) {
      return waiting.delete(seq) && seq === newest;
    },
    reset: forget,
    settled: () => writes,
  };
}
