import { mayRun } from "./guard.js";

/**
 * The music host's entry. Before the engine is even fetched, and before any
 * message listener exists, it checks that it is sandboxed and framed
 * (`guard.ts`). Anywhere else it stops here: it loads nothing, evaluates
 * nothing and answers no message.
 */
if (mayRun(self.origin, window, window.parent)) {
  void import("./engine.js").then(({ startEngine }) => startEngine());
}
