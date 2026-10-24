/**
 * Idle detection, against real captured panes.
 *
 * This function decides whether an agent has stopped working, and it is wrong
 * in both directions at once if you get it slightly off: too eager and it
 * types into an agent that is mid-thought, too lax and the company quietly
 * stops. The first version looked for an ASCII ">" prompt and so never fired
 * at all — every interrupted agent sat there — which is the reason these
 * fixtures are verbatim captures rather than invented strings.
 */
import { describe, expect, it } from "vitest";

import { looksIdle } from "./supervisor.mjs";

/** Captured while a turn was in flight. */
const BUSY = `● I'll orient myself first.
  Running hub whoami; echo ---; tg roster; echo ---; tg inb… · 1m 20s
  ⎿  $ hub whoami; echo ---; tg roster (1m 20s · 29 lines)
     (ctrl+b to run in background)
* Gallivanting… (1m 27s · ↓ 91 tokens)
────────────────────────────────────────────
❯
────────────────────────────────────────────
  ⏵⏵ bypass permissions on (shift+tab to cycle) · install gh for PR status · esc to interrupt · ← for agents`;

/** Captured after a turn finished on its own. */
const DONE = `● Three agents are online: architect, lead-dev and me.
  DONE
✻ Cogitated for 7s · done 2:37 PM
────────────────────────────────────────────
❯
────────────────────────────────────────────
  ⏵⏵ bypass permissions on (shift+tab to cycle) · install gh for PR status · ← for agents`;

/** Captured right after two Ctrl-C presses interrupted a turn. */
const INTERRUPTED = `  Ran 1 shell command
  ⎿  Interrupted · What should Claude do instead?
────────────────────────────────────────────
❯
────────────────────────────────────────────
  ⏵⏵ bypass permissions on (shift+tab to cycle) · install gh for PR status · ← for agents`;

/** Captured on a fresh start, before the kickoff prompt was answered. */
const FRESH = ` ▐▛███▛█   Claude Code v2.1.293
▝▜██████▀  Opus 5.5 · Claude Pro
────────────────────────────────────────────
❯ Try "fix typecheck errors"
────────────────────────────────────────────
  ⏵⏵ bypass permissions on (shift+tab to cycle) · install gh for PR status · ← for agents`;

describe("looksIdle", () => {
  it("leaves a working agent alone", () => {
    // "esc to interrupt" is in the footer for exactly as long as a turn runs,
    // including while a long tool call is silent — which is what makes it a
    // better signal than a spinner.
    expect(looksIdle(BUSY, BUSY)).toBe(false);
  });

  it("notices an agent that finished its turn and stopped", () => {
    expect(looksIdle(DONE, DONE)).toBe(true);
  });

  it("notices an agent left idle by an interrupt", () => {
    // The state the operator actually produces by pressing Ctrl-C, and the
    // one the original implementation missed entirely.
    expect(looksIdle(INTERRUPTED, INTERRUPTED)).toBe(true);
  });

  it("notices a fresh pane that never got a turn", () => {
    expect(looksIdle(FRESH, FRESH)).toBe(true);
  });

  it("requires two identical samples, so output in flight is not idle", () => {
    expect(looksIdle(BUSY, DONE)).toBe(false);
    expect(looksIdle(DONE, INTERRUPTED)).toBe(false);
  });

  it("treats an empty capture as not idle rather than as stuck", () => {
    // A window that does not exist, or has not drawn yet. Nudging it would
    // type into whatever appears there next.
    expect(looksIdle("", "")).toBe(false);
    expect(looksIdle(DONE, "")).toBe(false);
    expect(looksIdle("", DONE)).toBe(false);
  });

  it("is not fooled by the word interrupt appearing in an agent's own output", () => {
    const talking = `● The tick loop can be interrupted by a disconnect mid-cast.
  Running pnpm test · 12s
────────────────────────────────────────────
  ⏵⏵ bypass permissions on · esc to interrupt · ← for agents`;

    expect(looksIdle(talking, talking)).toBe(false);
  });
});
