/**
 * runner-panes (#2729) against a tmux stand-in that keeps a window of panes
 * and their `@vibewars-runner-pane` marks, and a clock the test moves.
 */
import { describe, expect, it } from "vitest";

import { KEEP_MS, MARK, SUPERVISOR, paneReconciler } from "./runner-panes.mjs";

/**
 * @typedef {{ id: string, mark: string, title: string, command: string }} FakePane
 */

/**
 * @param {FakePane[]} [start] panes already in the window
 */
function fakeTmux(start = []) {
  /** @type {FakePane[]} */
  const panes = [{ id: "%0", mark: "", title: "RUNNER-PANES", command: "daemon" }, ...start];
  /** @type {string[][]} */
  const calls = [];
  let next = 10;
  /** @param {string[]} args */
  const tmux = (args) => {
    calls.push(args);
    const target = args[args.indexOf("-t") + 1] ?? "";
    switch (args[0]) {
      case "list-panes":
        return { code: 0, stdout: panes.map((p) => `${p.id}\t${p.mark}`).join("\n") + "\n" };
      case "split-window": {
        const id = `%${String(next++)}`;
        panes.push({ id, mark: "", title: "", command: args.at(-1) ?? "" });
        return { code: 0, stdout: `${id}\n` };
      }
      case "set-option": {
        const pane = panes.find((p) => p.id === target);
        if (pane !== undefined && args.at(-2) === MARK) {
          pane.mark = args.at(-1) ?? "";
        }
        return { code: 0, stdout: "" };
      }
      case "select-pane": {
        const pane = panes.find((p) => p.id === target);
        if (pane !== undefined) {
          pane.title = args.at(-1) ?? "";
        }
        return { code: 0, stdout: "" };
      }
      case "kill-pane":
        panes.splice(
          panes.findIndex((p) => p.id === target),
          1,
        );
        return { code: 0, stdout: "" };
      default:
        return { code: 0, stdout: "" };
    }
  };
  return { tmux, panes, calls };
}

/**
 * @param {ReturnType<typeof fakeTmux>} fake
 * @param {{ runners: import("./runner-panes.mjs").RunnerLog[], at: number }} world
 */
function reconciler(fake, world) {
  /** @type {string[]} */
  const said = [];
  const panes = paneReconciler({
    tmux: fake.tmux,
    index: () => world.runners,
    now: () => world.at,
    reason: () => "the target is 0",
    say: (line) => said.push(line),
    tail: (file) => `tail ${file}`,
    window: "=s:100",
    self: "%0",
    cwd: "/bots",
    supervisorLog: "/bots/hub/runner-supervisor.log",
  });
  return { tick: panes.tick, said };
}

/**
 * @param {string} name
 * @param {boolean} alive
 * @returns {import("./runner-panes.mjs").RunnerLog}
 */
const runner = (name, alive) => ({
  name,
  file: `/bots/hub/runners/${name}.log`,
  alive,
  exitCode: alive ? null : 0,
});

const tiled = (/** @type {string[][]} */ calls) =>
  calls.filter((c) => c[0] === "select-layout" && c.at(-1) === "tiled").length;

describe("runner-panes", () => {
  it("opens the supervisor's pane above and one pane per alive runner, then tiles", () => {
    const fake = fakeTmux();
    const world = { runners: [runner("r1", true), runner("r2", true), runner("r0", false)], at: 0 };
    const { tick } = reconciler(fake, world);

    tick();

    const ours = fake.panes.filter((p) => p.mark !== "");
    expect(ours.map((p) => [p.mark, p.title, p.command])).toEqual([
      [SUPERVISOR, "runner-supervisor", "tail /bots/hub/runner-supervisor.log"],
      ["r1", "r1", "tail /bots/hub/runners/r1.log"],
      ["r2", "r2", "tail /bots/hub/runners/r2.log"],
    ]);
    const supervisorSplit = fake.calls.find((c) => c[0] === "split-window");
    expect(supervisorSplit).toContain("-b");
    expect(tiled(fake.calls)).toBe(1);

    // Nothing changed: nothing opened, nothing laid out again.
    const before = fake.calls.length;
    tick();
    expect(fake.calls.slice(before).map((c) => c[0])).toEqual(["list-panes"]);
  });

  it("keeps an exited runner's pane 60 s, then kills it", () => {
    const fake = fakeTmux();
    const world = { runners: [runner("r1", true), runner("r2", true)], at: 0 };
    const { tick } = reconciler(fake, world);
    tick();

    world.runners = [runner("r1", true), runner("r2", false)];
    world.at = 2_000;
    tick();
    const r2 = fake.panes.find((p) => p.mark === "r2");
    expect(r2?.title).toBe("r2 (exited 0)");

    world.at = 2_000 + KEEP_MS - 1;
    tick();
    expect(fake.panes.some((p) => p.mark === "r2")).toBe(true);

    world.at = 2_000 + KEEP_MS;
    tick();
    expect(fake.panes.some((p) => p.mark === "r2")).toBe(false);
    expect(fake.panes.some((p) => p.mark === "r1")).toBe(true);
    expect(tiled(fake.calls)).toBe(2);
  });

  it("never touches a pane it did not open", () => {
    const fake = fakeTmux([{ id: "%5", mark: "", title: "r9", command: "vim" }]);
    const world = { runners: [runner("r9", false)], at: 0 };
    const { tick } = reconciler(fake, world);

    tick();
    world.at = 10 * KEEP_MS;
    tick();

    expect(fake.panes.find((p) => p.id === "%5")).toEqual({
      id: "%5",
      mark: "",
      title: "r9",
      command: "vim",
    });
    expect(fake.calls.some((c) => c.includes("%5"))).toBe(false);
  });

  it("adopts its own panes after a restart rather than opening them twice", () => {
    const fake = fakeTmux([
      { id: "%3", mark: SUPERVISOR, title: "runner-supervisor", command: "tail" },
      { id: "%4", mark: "r1", title: "r1", command: "tail" },
    ]);
    const { tick } = reconciler(fake, { runners: [runner("r1", true)], at: 0 });

    tick();

    expect(fake.calls.some((c) => c[0] === "split-window")).toBe(false);
  });

  it("with no runner up, keeps the supervisor's pane alone and says why, once", () => {
    const fake = fakeTmux();
    const { tick, said } = reconciler(fake, { runners: [], at: 0 });

    tick();
    tick();

    expect(fake.panes.filter((p) => p.mark !== "").map((p) => p.mark)).toEqual([SUPERVISOR]);
    expect(said).toEqual(["no runners up: the target is 0"]);
  });
});
