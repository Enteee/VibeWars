import { mayRun, withoutWebRtc } from "./guard.js";

/**
 * The music host's entry. Before the engine is even fetched, and before any
 * message listener exists, it checks that it is sandboxed and framed
 * (`guard.ts`), and takes WebRTC away from what it will run (#2745). Anywhere else it stops here: it loads nothing, evaluates
 * nothing and answers no message.
 */
if (mayRun(self.origin, window, window.parent) && withoutWebRtc(globalThis)) {
  void import("./engine.js").then(({ startEngine }) => startEngine());
}
