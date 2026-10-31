/**
 * The hub window, against a tmux stand-in that records what it is asked and
 * answers list-windows with the windows a test gives it (#315).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const HUB_WINDOW = path.join(path.dirname(fileURLToPath(import.meta.url)), "hub-window.mjs");

/** @type {string[]} */
const dirs = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * @param {string} command
 * @param {string} windows what list-windows prints, one `index name` a line
 * @param {{ failNewWindow?: boolean, path?: string }} [options]
 * @returns {{ code: number | null, stderr: string, calls: string[] }}
 */
function hubWindow(command, windows, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hub-window-test-"));
  dirs.push(dir);
  const calls = path.join(dir, "calls.log");
  const tmux = path.join(dir, "tmux");
  fs.writeFileSync(path.join(dir, "windows"), windows);
  fs.writeFileSync(
    tmux,
    [
      "#!/bin/sh",
      `printf '%s\\n' "$*" >>${calls}`,
      'case "$1" in',
      `  list-windows) cat ${path.join(dir, "windows")} ;;`,
      `  new-window) ${options.failNewWindow === true ? "echo 'create window failed: index 99 in use' >&2; exit 1" : "echo %7"} ;;`,
      "  split-window) echo %8 ;;",
      "esac",
    ].join("\n"),
    { mode: 0o755 },
  );
  const result = spawnSync(process.execPath, [HUB_WINDOW, command], {
    env: {
      PATH: options.path ?? process.env.PATH ?? "",
      VIBEWARS_TMUX: tmux,
      VIBEWARS_LLC_SESSION: "hub-test",
      DEVENV_ROOT: dir,
      VIBEWARS_CODE: dir,
      VIBEWARS_BOT_ROOT: path.join(dir, ".bots"),
      VIBEWARS_LLC_RESTART: "/restarter",
      VIBEWARS_CLAUDE_BOXES: "/boxes",
    },
    encoding: "utf8",
  });
  return {
    code: result.status,
    stderr: result.stderr,
    calls: fs.existsSync(calls) ? fs.readFileSync(calls, "utf8").trim().split("\n") : [],
  };
}

describe("hub-window check", () => {
  it("finds the hub window at 99", () => {
    expect(hubWindow("check", "0 dashboard\n1 manager\n99 hub\n").code).toBe(0);
  });

  it("does not take a window at 99 that lost its name for the hub window", () => {
    expect(hubWindow("check", "0 dashboard\n99 node\n").code).toBe(1);
  });

  it("does not take a hub window anywhere but 99 for it", () => {
    expect(hubWindow("check", "0 dashboard\n3 hub\n").code).toBe(1);
  });

  it("finds none when there is no session", () => {
    expect(hubWindow("check", "").code).toBe(1);
  });
});

describe("hub-window open", () => {
  it("replaces whatever holds index 99, rather than failing on it", () => {
    const result = hubWindow("open", "0 dashboard\n99 node\n");

    expect(result.code).toBe(0);
    const open = result.calls.find((c) => c.startsWith("new-window"));
    expect(open).toMatch(/ -k /);
    expect(open).toMatch(/ -t =hub-test:99 -n hub /);
    expect(open).toMatch(/run-forever\.mjs hubd -- .*hubd\.mjs$/);
    expect(result.calls.find((c) => c.startsWith("split-window"))).toMatch(
      /run-forever\.mjs supervisor -- .*supervisor\.mjs$/,
    );
  });

  it("pins the window's name, so check can find it", () => {
    const result = hubWindow("open", "");

    expect(result.calls).toContain("set-option -w -t %7 automatic-rename off");
    expect(result.calls).toContain("set-option -w -t %7 allow-rename off");
  });

  it("hands the daemons the tmux it ran on, the restarter and the Claude logs", () => {
    const open = hubWindow("open", "").calls.find((c) => c.startsWith("new-window"));

    expect(open).toMatch(/-e VIBEWARS_TMUX=\S+\/tmux /);
    expect(open).toMatch(/-e VIBEWARS_LLC_RESTART=\/restarter /);
    expect(open).toMatch(/-e VIBEWARS_CLAUDE_BOXES=\/boxes /);
  });

  it("hands them each PATH entry once, so nested nix shells cannot make tmux refuse it", () => {
    const base = process.env.PATH ?? "";
    const open = hubWindow("open", "", { path: `${base}:${base}:${base}` }).calls.find((c) =>
      c.startsWith("new-window"),
    );

    const passed = open?.match(/-e PATH=(\S*) /)?.[1] ?? "";
    const entries = passed.split(":");
    expect(entries.length).toBeGreaterThan(0);
    expect(new Set(entries).size).toBe(entries.length);
  });

  it("fails loudly when tmux will not open it", () => {
    const result = hubWindow("open", "", { failNewWindow: true });

    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/could not open the hub window at hub-test:99/);
    expect(result.calls.some((c) => c.startsWith("split-window"))).toBe(false);
  });
});
