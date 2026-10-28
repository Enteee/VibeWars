/**
 * The support jail's static guard (#148): what its bwrap arguments must
 * never name, checked where CI can run it.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { PLACEHOLDER_TOKEN, parseSupportJail, supportJailArgs } from "./jail-args.mjs";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "jail-args.mjs");

const ROOT = "/home/op/vibewars/.bots";

const JAIL = {
  employee: "support",
  role: "support",
  home: "/home/op",
  user: "op",
  uid: "1000",
  bus: `${ROOT}/bus`,
  hub: `${ROOT}/hub`,
  source: `${ROOT}/support-src/0123abc`,
  sourceSha: "0123abc",
  box: "/home/op/.claude-boxes/support",
  proxyDir: `${ROOT}/support-proxy/support`,
  path: "/nix/store/x-path/bin",
  shell: "/nix/store/x-bash/bin/bash",
  term: "xterm-256color",
  lang: "C.UTF-8",
  colorterm: "truecolor",
  project: "3",
  board: "{}",
};

const args = supportJailArgs(parseSupportJail(JSON.stringify(JAIL)));

/**
 * The paths a bind argument mounts, source and destination.
 *
 * @param {readonly string[]} argv
 * @returns {string[]}
 */
function bound(argv) {
  /** @type {string[]} */
  const paths = [];
  argv.forEach((arg, i) => {
    if (/^--(ro-)?bind(-try)?$/.test(arg)) {
      paths.push(argv[i + 1] ?? "", argv[i + 2] ?? "");
    }
  });
  return paths;
}

describe("supportJailArgs", () => {
  it("mounts no .git, no git config and no credentials file", () => {
    for (const arg of args) {
      expect(arg).not.toMatch(/\.git(\/|$)/);
      expect(arg).not.toMatch(/\.config\/git/);
      expect(arg).not.toMatch(/\.credentials\.json/);
    }
  });

  it("has no network: every namespace unshared, and the net never shared back", () => {
    expect(args).toContain("--unshare-all");
    expect(args).not.toContain("--share-net");
  });

  it("mounts only support's own bus and hub spool, and the heartbeats", () => {
    const ofBusOrHub = bound(args).filter(
      (p) => p.startsWith(`${ROOT}/bus`) || p.startsWith(`${ROOT}/hub`),
    );
    expect(new Set(ofBusOrHub)).toEqual(
      new Set([
        `${ROOT}/bus/support`,
        `${ROOT}/bus/_alive`,
        `${ROOT}/hub/support`,
        `${ROOT}/hub/_alive`,
      ]),
    );
    const at = args.indexOf(`${ROOT}/bus/_alive`);
    expect(args[at - 1]).toBe("--ro-bind");
  });

  it("works in main's export, read-only, and binds nothing else of the checkout", () => {
    const i = args.indexOf(JAIL.source);
    expect(args.slice(i - 1, i + 2)).toEqual(["--ro-bind", JAIL.source, JAIL.source]);
    expect(args.slice(args.indexOf("--chdir"), args.indexOf("--chdir") + 2)).toEqual([
      "--chdir",
      JAIL.source,
    ]);
    const ofCheckout = bound(args).filter((p) => p.startsWith("/home/op/vibewars"));
    expect(
      ofCheckout.every(
        (p) =>
          p === JAIL.source ||
          p === JAIL.proxyDir ||
          p.startsWith(`${ROOT}/bus/`) ||
          p.startsWith(`${ROOT}/hub/`),
      ),
    ).toBe(true);
  });

  it("points Claude at the proxy with a placeholder, never a credential", () => {
    const env = new Map();
    args.forEach((arg, i) => {
      if (arg === "--setenv") {
        env.set(args[i + 1], args[i + 2]);
      }
    });
    expect(env.get("ANTHROPIC_BASE_URL")).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(env.get("ANTHROPIC_AUTH_TOKEN")).toBe(PLACEHOLDER_TOKEN);
    expect(env.has("ANTHROPIC_API_KEY")).toBe(false);
    expect(env.has("CLAUDE_CODE_OAUTH_TOKEN")).toBe(false);
    expect(env.get("VIBEWARS_SOURCE_SHA")).toBe("0123abc");
  });
});

describe("parseSupportJail", () => {
  it("refuses a description missing a field", () => {
    const { source: _source, ...missing } = JAIL;
    expect(() => parseSupportJail(JSON.stringify(missing))).toThrow(/source/);
  });
});

describe("the CLI", () => {
  it("prints the arguments NUL-separated, for claude-bot to read with mapfile -d ''", () => {
    const run = spawnSync(process.execPath, [SCRIPT, "support", JSON.stringify(JAIL)], {
      encoding: "utf8",
    });
    expect(run.status).toBe(0);
    expect(run.stdout.split("\0").slice(0, -1)).toEqual(args);
  });
});
