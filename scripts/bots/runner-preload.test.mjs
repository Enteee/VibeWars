import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildPreload, inputHash, readPreload } from "./runner-preload.mjs";

/** @type {string[]} */
const tmps = [];
afterEach(() => {
  for (const dir of tmps.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const tmp = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "preload-"));
  tmps.push(dir);
  return dir;
};

/**
 * A fake toolchain: `git clone` writes main's inputs, `devenv` roots a shell,
 * and the nix commands answer from a table.
 *
 * @param {string} store a directory standing in for /nix/store
 * @param {{ lock?: string, failAt?: string }} [options]
 */
function toolchain(
  store,
  { lock = '{"nodes":{"nixpkgs":{"locked":{"rev":"abc"}}}}', failAt } = {},
) {
  /** @type {string[][]} */
  const calls = [];
  const p = (/** @type {string} */ name) => {
    const full = path.join(store, name);
    fs.mkdirSync(full, { recursive: true });
    return full;
  };
  const shell = p("shell");
  const cli = p("cli");
  const stdenv = p("stdenv");
  const dep = p("dep");
  const src = p("lock-src");
  const tool = p("coreutils");
  const mounted = p("runner-closure-path");
  /** @type {import("./runner-preload.mjs").Run} */
  const run = (command, args, options) => {
    calls.push([command, ...args]);
    if (failAt === command) {
      throw new Error(`${command} failed`);
    }
    if (command === "git") {
      const dest = /** @type {string} */ (args.at(-1));
      fs.mkdirSync(dest, { recursive: true });
      fs.writeFileSync(path.join(dest, "devenv.lock"), lock);
      fs.writeFileSync(path.join(dest, "devenv.nix"), "{}");
      return "";
    }
    if (command === "devenv") {
      const gc = path.join(/** @type {string} */ (options?.cwd), ".devenv", "gc");
      fs.mkdirSync(gc, { recursive: true });
      fs.symlinkSync(shell, path.join(gc, "shell"));
      fs.mkdirSync(path.join(options?.env?.HOME ?? "", ".cache", "nix", "tarball-cache-v2"), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(options?.env?.HOME ?? "", ".cache", "nix", "fetcher-cache-v4.sqlite"),
        "db",
      );
      return "";
    }
    if (command === "nix" && args[0] === "build") {
      return `${cli}\n`;
    }
    if (command === "nix" && args[0] === "eval") {
      return src;
    }
    if (command === "nix-store" && args[0] === "-qd") {
      return "/nix/store/x.drv\n";
    }
    if (command === "nix-store" && args[1] === "--references") {
      return "/nix/store/stdenv.drv\n" + `${dep}\n`;
    }
    if (command === "nix-store" && args[1] === "--outputs") {
      return `${stdenv}\n`;
    }
    if (command === "nix-store" && args[0] === "-qR") {
      return [...args.slice(1), mounted].join("\n") + "\n";
    }
    if (command === "nix-store" && args[0] === "--dump-db") {
      return `DB ${args.slice(1).join(" ")}\n`;
    }
    return "";
  };
  return { run, calls, paths: { shell, cli, stdenv, dep, src, tool, mounted } };
}

describe("buildPreload (#2792)", () => {
  it("lists the shell, the CLI, the derivation's inputs, the lock's sources and the tools, less what the jail mounts anyway", () => {
    const state = tmp();
    const t = toolchain(tmp());
    const { dir, built } = buildPreload({
      state,
      repoUrl: "https://example.test/r.git",
      exclude: new Set([t.paths.mounted]),
      extra: [t.paths.tool],
      run: t.run,
    });
    expect(built).toBe(true);
    const listed = fs.readFileSync(path.join(dir, "store-paths"), "utf8").trim().split("\n");
    expect(listed).toEqual(
      [t.paths.shell, t.paths.cli, t.paths.stdenv, t.paths.dep, t.paths.src, t.paths.tool].sort(),
    );
    // The registration is dumped for exactly that list.
    expect(fs.readFileSync(path.join(dir, "registration"), "utf8")).toBe(
      `DB ${listed.join(" ")}\n`,
    );
    expect(
      fs.readFileSync(path.join(dir, "fetcher-cache", "fetcher-cache-v4.sqlite"), "utf8"),
    ).toBe("db");
    expect(fs.existsSync(path.join(dir, "fetcher-cache", "tarball-cache-v2"))).toBe(true);
    expect(t.calls.filter((c) => c[1] === "--realise")).toHaveLength(6);
    // main only, and the shell is not entered.
    expect(t.calls[0]).toEqual(expect.arrayContaining(["clone", "--branch", "main"]));
    expect(t.calls.some((c) => c[0] === "devenv" && c[1] === "shell")).toBe(false);
    expect(readPreload(state)?.storePaths).toEqual(listed);
  });

  it("keeps the previous preload when the build fails, and builds nothing twice", () => {
    const state = tmp();
    const store = tmp();
    const first = toolchain(store);
    const opts = { state, repoUrl: "u", exclude: new Set(/** @type {string[]} */ ([])), extra: [] };
    const { dir } = buildPreload({ ...opts, run: first.run });
    const second = toolchain(store, {
      lock: '{"nodes":{"nixpkgs":{"locked":{"rev":"def"}}}}',
      failAt: "nix-store",
    });
    expect(() => buildPreload({ ...opts, run: second.run })).toThrow(/failed/);
    expect(fs.realpathSync(path.join(state, "preload", "current"))).toBe(fs.realpathSync(dir));
    expect(fs.existsSync(path.join(state, "preload-work"))).toBe(false);

    const again = toolchain(store);
    expect(buildPreload({ ...opts, run: again.run })).toEqual({ dir, built: false });
    expect(again.calls.some((c) => c[0] === "devenv")).toBe(false);
  });

  it("replaces the old preload when main's inputs change, current only ever whole", () => {
    const state = tmp();
    const store = tmp();
    const opts = { state, repoUrl: "u", exclude: new Set(/** @type {string[]} */ ([])), extra: [] };
    const old = buildPreload({ ...opts, run: toolchain(store).run });
    const next = buildPreload({
      ...opts,
      run: toolchain(store, { lock: '{"nodes":{"nixpkgs":{"locked":{"rev":"def"}}}}' }).run,
    });
    expect(next.dir).not.toBe(old.dir);
    expect(fs.existsSync(old.dir)).toBe(false);
    expect(fs.realpathSync(path.join(state, "preload", "current"))).toBe(fs.realpathSync(next.dir));
  });
});

describe("inputHash / readPreload", () => {
  it("hashes the three input files; none yet means no preload", () => {
    const a = tmp();
    const b = tmp();
    fs.writeFileSync(path.join(a, "devenv.lock"), "1");
    fs.writeFileSync(path.join(b, "devenv.lock"), "2");
    expect(inputHash(a)).not.toBe(inputHash(b));
    expect(readPreload(tmp())).toBeNull();
  });
});
