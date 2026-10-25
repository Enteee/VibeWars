/**
 * The music stops while the page is hidden (#420). A phone throttles or
 * freezes a page in the background while its audio clock may run on, and
 * comes back to a scheduler far behind that clock. Suspending the context
 * stops that clock, and the scheduler with it, since its time is the
 * context's: on return the music carries on from where it was, with
 * nothing to catch up.
 */

export interface Page {
  readonly visibilityState: DocumentVisibilityState;
  addEventListener(type: "visibilitychange", listener: () => void): void;
}

export interface Suspendable {
  readonly state: AudioContextState;
  suspend(): Promise<void>;
  resume(): Promise<void>;
}

/** Suspend `context` while `page` is hidden, and resume only what this suspended. */
export function suspendWhileHidden(
  page: Page,
  context: Suspendable,
  fail: (error: unknown) => void,
): void {
  let suspended = false;
  page.addEventListener("visibilitychange", () => {
    if (page.visibilityState === "hidden") {
      if (context.state === "running") {
        suspended = true;
        context.suspend().catch(fail);
      }
    } else if (suspended) {
      suspended = false;
      context.resume().catch(fail);
    }
  });
}
