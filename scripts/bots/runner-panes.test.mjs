import { describe, expect, it } from "vitest";

import { EXITED_KEEP_MS, SUPERVISOR_TITLE, reconcile } from "./runner-panes.mjs";

/** A tmux that remembers its panes, and a clock and runner list the test moves. */
function rig() {
  /** @type {string[][]} */
  const calls = [];
  /** @type {string[]} */
  const open = ["%0", "%99"]; // %99 is not ours
  let next = 1;
  let clock = 0;
  /** @type {string[]} */
  let alive = [];
  /** @type {string[]} */
  const said = [];
  /** @type {Map<string, import("./runner-panes.mjs").Pane>} */
  const panes = new Map();
  /** @type {import("./runner-panes.mjs").Deps} */
  const deps = {
    tmux: (args) => {
      calls.push(args);
      if (args[0] === "list-panes") {
        return `${open.join("\n")}\n`;
      }
      if (args[0] === "split-window") {
        const id = `%${String(next++)}`;
        open.push(id);
        return `${id}\n`;
      }
      if (args[0] === "kill-pane") {
        open.splice(open.indexOf(args[2] ?? ""), 1);
      }
      return "";
    },
    now: () => clock,
    window: "@1",
    logDir: "/logs",
    supervisorLog: "/logs/sup.log",
    tail: "tail",
    alive: () => alive,
    say: (line) => said.push(line),
    reason: () => "host load 9.0 is above its 8 CPUs",
  };
  return {
    calls,
    open,
    panes,
    said,
    step: (/** @type {string[]} */ names, /** @type {number} */ at) => {
      alive = names;
      clock = at;
      reconcile(panes, deps);
    },
    count: (/** @type {string} */ verb) => calls.filter((c) => c[0] === verb).length,
  };
}

describe("runner-panes", () => {
  it("one pane per alive runner above the supervisor's, tiled", () => {
    const r = rig();
    r.step(["vibewars-runner-1", "vibewars-runner-2"], 0);
    expect([...r.panes.keys()]).toEqual([
      SUPERVISOR_TITLE,
      "vibewars-runner-1",
      "vibewars-runner-2",
    ]);
    expect(r.count("split-window")).toBe(3);
    expect(r.calls.at(-1)).toEqual(["select-layout", "-t", "@1", "tiled"]);
    r.step(["vibewars-runner-1", "vibewars-runner-2"], 2000);
    expect(r.count("split-window")).toBe(3);
  });

  it("keeps an exited runner's pane for 60 s, then kills it, and never a pane not ours", () => {
    const r = rig();
    r.step(["a"], 0);
    r.step([], 1000);
    expect(r.panes.has("a")).toBe(true);
    r.step([], 1000 + EXITED_KEEP_MS - 1);
    expect(r.count("kill-pane")).toBe(0);
    r.step([], 1000 + EXITED_KEEP_MS);
    expect(r.panes.has("a")).toBe(false);
    expect(r.count("kill-pane")).toBe(1);
    expect(r.open).toContain("%99");
    expect(r.panes.has(SUPERVISOR_TITLE)).toBe(true);
  });

  it("says why when no runner is up", () => {
    const r = rig();
    r.step([], 0);
    expect(r.said).toEqual(["no runners up: host load 9.0 is above its 8 CPUs"]);
  });

  it("makes a pane again that was closed by hand", () => {
    const r = rig();
    r.step(["a"], 0);
    r.open.splice(r.open.indexOf(r.panes.get("a")?.id ?? ""), 1);
    r.step(["a"], 2000);
    expect(r.count("split-window")).toBe(3);
  });
});
