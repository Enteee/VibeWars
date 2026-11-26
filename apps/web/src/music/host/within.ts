/**
 * `promise`, or a rejection with `message` once `ms` have passed.
 *
 * The host handles one message at a time, so a promise that never
 * settles would wedge every message after it. An `AudioContext` whose
 * frame never gets audio activation does exactly that: `resume()` stays
 * pending, and Safari does not delegate `allow="autoplay"` to a frame.
 */
export function within<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(message));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer);
  });
}
