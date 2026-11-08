/**
 * The store paths of main's CI devenv shell, built on the host so a job on a
 * company runner finds them already in its jail (#2792, ADR-0045).
 *
 * Every job there fills an empty `/nix`, so a CI run with eight devenv jobs
 * unpacked the whole shell eight times. Here the host realises it once, from
 * a fresh clone of main (never a PR branch: main changes only by reviewed
 * pull request), under a `HOME` of its own, and writes a directory the jail
 * mounts read-only:
 *
 *     <state>/preload/current -> preload-<hash of devenv.lock + devenv.nix + devenv.yaml>/
 *         store-paths      every path to mount, one per line
 *         registration     `nix-store --dump-db` of exactly those paths
 *         fetcher-cache/   Nix's fetcher cache, which the jail copies into the job's HOME
 *         roots/           GC roots, until the next preload replaces this one
 *
 * `current` is swapped by renaming a symlink, so a jail never reads a half
 * built list. Paths already in the runner's own closure are left out: the
 * jail loads both registrations, and a path in both would be registered twice.
 * The shell is realised with `devenv print-dev-env`, which builds it
 * without running `enterShell`: no hook of the repository runs on the host.
 *
 *     node runner-preload.mjs --state <dir> --repo <owner/name> --exclude <store-paths file> [--extra <path>]...
 */
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

/** The files whose content decides the shell's closure. */
export const INPUT_FILES = ["devenv.lock", "devenv.nix", "devenv.yaml"];

/** What the action writes, so the shell is the one CI's jobs enter. */
const LOCAL_NIX = "{ vibewars.claudeBot.enable = false; }\n";

/**
 * Every locked input's store path, fetched the way a job's evaluation does,
 * so the sources are in the store and in the fetcher cache.
 */
const LOCK_SOURCES = `let l = builtins.fromJSON (builtins.readFile ./devenv.lock); in builtins.concatStringsSep "\\n" (map (n: (builtins.fetchTree n.locked).outPath) (builtins.filter (n: n ? locked) (builtins.attrValues l.nodes)))`;

/**
 * @callback Run
 * @param {string} command
 * @param {string[]} args
 * @param {{ cwd?: string, env?: Record<string, string | undefined> }} [options]
 * @returns {string} stdout
 */

/** @type {Run} */
export const runCommand = (command, args, options = {}) =>
  execFileSync(command, args, {
    ...options,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    maxBuffer: 1 << 28,
  });

/**
 * @param {string} dir a checkout of main
 * @returns {string} the hash the preload's directory is named by
 */
export function inputHash(dir) {
  const hash = crypto.createHash("sha256");
  for (const name of INPUT_FILES) {
    const file = path.join(dir, name);
    hash.update(`${name}\0`);
    hash.update(fs.existsSync(file) ? fs.readFileSync(file) : "");
  }
  return hash.digest("hex").slice(0, 16);
}

/**
 * @param {string} text
 * @returns {string[]}
 */
function lines(text) {
  return text.split("\n").filter((line) => line !== "");
}

/**
 * What a local derivation of the shell needs and its runtime closure does
 * not hold (stdenv, builder scripts): the realised outputs of the shell
 * derivation's input derivations, and its source paths.
 *
 * @param {Run} run
 * @param {string} shell
 * @returns {string[]}
 */
function derivationInputs(run, shell) {
  const drv = lines(run("nix-store", ["-qd", shell]))[0];
  if (drv === undefined) {
    throw new Error(`runner-preload: no derivation for ${shell}`);
  }
  return lines(run("nix-store", ["-q", "--references", drv])).flatMap((ref) =>
    ref.endsWith(".drv") ? lines(run("nix-store", ["-q", "--outputs", ref])) : [ref],
  );
}

/**
 * Builds the preload for main's current inputs, unless it exists, and makes
 * it `current`.
 *
 * @param {object} options
 * @param {string} options.state the preload's parent directory
 * @param {string} options.repoUrl
 * @param {ReadonlySet<string>} options.exclude paths the jail mounts anyway
 * @param {readonly string[]} options.extra tools the jail's `Install devenv` runs: Nix, bash, coreutils
 * @param {Run} [options.run]
 * @returns {{ dir: string, built: boolean }}
 */
export function buildPreload({ state, repoUrl, exclude, extra, run = runCommand }) {
  const root = path.join(state, "preload");
  const work = path.join(state, "preload-work");
  const home = path.join(work, "home");
  const src = path.join(work, "src");
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(home, { recursive: true, mode: 0o700 });
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  try {
    run("git", ["clone", "--quiet", "--depth", "1", "--branch", "main", repoUrl, src]);
    const name = `preload-${inputHash(src)}`;
    const dir = path.join(root, name);
    if (fs.existsSync(path.join(dir, "registration"))) {
      swapCurrent(root, name);
      return { dir, built: false };
    }

    fs.writeFileSync(path.join(src, "devenv.local.nix"), LOCAL_NIX);
    const env = { ...process.env, HOME: home };
    run("devenv", ["print-dev-env"], { cwd: src, env });
    const shell = fs.realpathSync(path.join(src, ".devenv", "gc", "shell"));
    /** @type {unknown} */
    const raw = JSON.parse(fs.readFileSync(path.join(src, "devenv.lock"), "utf8"));
    const lock = /** @type {{ nodes: { nixpkgs: { locked: { rev: string } } } }} */ (raw);
    const cli = lines(
      run("nix", [
        "build",
        "--no-link",
        "--print-out-paths",
        `github:cachix/devenv-nixpkgs/${lock.nodes.nixpkgs.locked.rev}#devenv`,
      ]),
    )[0];
    if (cli === undefined) {
      throw new Error("runner-preload: the devenv CLI built no output");
    }
    const sources = lines(
      run("nix", ["eval", "--impure", "--raw", "--expr", LOCK_SOURCES], { cwd: src, env }),
    );
    const roots = [
      ...new Set([shell, cli, ...derivationInputs(run, shell), ...sources, ...extra]),
    ].filter((p) => fs.existsSync(p));
    const paths = lines(run("nix-store", ["-qR", ...roots]))
      .filter((p) => !exclude.has(p))
      .sort();
    const registration = run("nix-store", ["--dump-db", ...paths]);

    const tmp = path.join(root, `.tmp-${name}`);
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(path.join(tmp, "fetcher-cache"), { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(tmp, "store-paths"), `${paths.join("\n")}\n`);
    fs.writeFileSync(path.join(tmp, "registration"), registration);
    const cache = path.join(home, ".cache", "nix");
    for (const entry of fs.existsSync(cache) ? fs.readdirSync(cache) : []) {
      if (entry.startsWith("fetcher-cache") || entry.startsWith("tarball-cache")) {
        fs.cpSync(path.join(cache, entry), path.join(tmp, "fetcher-cache", entry), {
          recursive: true,
        });
      }
    }
    fs.renameSync(tmp, dir);
    fs.mkdirSync(path.join(dir, "roots"));
    roots.forEach((p, i) => {
      run("nix-store", [
        "--realise",
        "--add-root",
        path.join(dir, "roots", String(i)),
        "--indirect",
        p,
      ]);
    });
    swapCurrent(root, name);
    return { dir, built: true };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

/**
 * Makes `name` the `current` preload, atomically, and drops the others
 * (their GC roots go with them).
 *
 * @param {string} root
 * @param {string} name
 */
function swapCurrent(root, name) {
  const next = path.join(root, ".current-next");
  fs.rmSync(next, { force: true });
  fs.symlinkSync(name, next);
  fs.renameSync(next, path.join(root, "current"));
  for (const entry of fs.readdirSync(root)) {
    if (entry !== name && entry !== "current") {
      fs.rmSync(path.join(root, entry), { recursive: true, force: true });
    }
  }
}

/**
 * What the jail mounts from the preload: nothing when there is none.
 *
 * @param {string} state the preload's parent directory
 * @returns {{ storePaths: string[], registration: string, fetcherCache: string } | null}
 */
export function readPreload(state) {
  const dir = path.join(state, "preload", "current");
  let real;
  try {
    real = fs.realpathSync(dir);
  } catch {
    return null;
  }
  return {
    storePaths: lines(fs.readFileSync(path.join(real, "store-paths"), "utf8")),
    registration: path.join(real, "registration"),
    fetcherCache: path.join(real, "fetcher-cache"),
  };
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({
    options: {
      state: { type: "string" },
      repo: { type: "string" },
      exclude: { type: "string" },
      extra: { type: "string", multiple: true },
    },
  });
  if (
    values.state === undefined ||
    values.repo === undefined ||
    !/^[\w.-]+\/[\w.-]+$/.test(values.repo) ||
    values.exclude === undefined
  ) {
    console.error(
      "usage: runner-preload.mjs --state <dir> --repo <owner/name> --exclude <store-paths file> [--extra <path>]...",
    );
    process.exit(2);
  }
  const { built, dir } = buildPreload({
    state: values.state,
    repoUrl: `https://github.com/${values.repo}.git`,
    exclude: new Set(lines(fs.readFileSync(values.exclude, "utf8"))),
    extra: values.extra ?? [],
  });
  console.error(`runner-preload: ${built ? "built" : "kept"} ${dir}`);
}
