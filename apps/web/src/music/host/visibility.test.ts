import { describe, expect, it } from "vitest";

import { suspendWhileHidden, type Page, type Suspendable } from "./visibility.js";

/** A page and a context the test drives. */
function setup(state: AudioContextState, refusal?: Error) {
  let visibility: DocumentVisibilityState = "visible";
  let listener: (() => void) | undefined;
  const calls: string[] = [];
  const page: Page = {
    get visibilityState() {
      return visibility;
    },
    addEventListener: (_type, added) => {
      listener = added;
    },
  };
  const context: Suspendable & { state: AudioContextState } = {
    state,
    suspend: () => {
      calls.push("suspend");
      if (refusal !== undefined) {
        return Promise.reject(refusal);
      }
      context.state = "suspended";
      return Promise.resolve();
    },
    resume: () => {
      calls.push("resume");
      context.state = "running";
      return Promise.resolve();
    },
  };
  const errors: unknown[] = [];
  suspendWhileHidden(page, context, (error) => errors.push(error));
  return {
    calls,
    errors,
    show: (next: DocumentVisibilityState) => {
      visibility = next;
      listener?.();
    },
  };
}

describe("suspendWhileHidden", () => {
  it("suspends a running context while the page is hidden, and resumes it on return", () => {
    const { calls, show } = setup("running");
    show("hidden");
    show("visible");
    expect(calls).toEqual(["suspend", "resume"]);
  });

  it("does not start a context that was not running when the page was hidden", () => {
    const { calls, show } = setup("suspended");
    show("hidden");
    show("visible");
    expect(calls).toEqual([]);
  });

  it("reports a context that refuses", async () => {
    const refusal = new Error("no");
    const { errors, show } = setup("running", refusal);
    show("hidden");
    await Promise.resolve();
    expect(errors).toEqual([refusal]);
  });
});
