/**
 * The restarter, run for real against a scratch checkout and a local bare
 * remote. `devenv`, `tmux`, `pkill` and `pgrep` are stand-ins: the real
 * ones would build nix shells and kill processes this test does not own.
 */

import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { obj } from "./protocol.mjs";

const RESTART = path.join(path.dirname(fileURLToPath(import.meta.url)), "restart.mjs");

/** @type {string[]} */
const dirs = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * @param {string[]} args
 * @param {string} cwd
 * @returns {string}
 */
function sh(args, cwd) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" },
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  }
  return result.stdout.trim();
}

/**
 * @param {string} message
 * @param {string} cwd
 * @returns {void}
 */
function commit(message, cwd) {
  sh(["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", message], cwd);
}

/**
 * An operator checkout booted at one commit, a remote whose main is one
 * company commit ahead of it, and a reboot handed over by the supervisor.
 *
 * The tmux stand-in keeps a session up until `kill-session` has run
 * `survive` times more than once, and lists `panePid` as its one pane. The
 * devenv stand-in's `claude-llc up` fails, as the real one does, while that
 * session is up, and also the first `failUp` times it runs.
 *
 * @param {{ failBuild?: boolean, signed?: boolean, survive?: number, failUp?: number, panePid?: number }} [options]
 */
function setup(options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "restart-test-"));
  dirs.push(dir);
  const repo = path.join(dir, "repo");
  const remote = path.join(dir, "remote.git");
  const root = path.join(repo, ".bots");
  const bin = path.join(dir, "bin");
  const calls = path.join(dir, "calls.log");

  sh(["init", "--bare", "-q", "-b", "main", remote], dir);
  sh(["init", "-q", "-b", "main", repo], dir);
  fs.writeFileSync(path.join(repo, ".gitignore"), ".bots/\n");
  sh(["add", ".gitignore"], repo);
  commit("boot", repo);
  const boot = sh(["rev-parse", "HEAD"], repo);
  sh(["push", "-q", remote, "main"], repo);

  // The new main, made in a second clone so the checkout stays at boot.
  const other = path.join(dir, "other");
  sh(["clone", "-q", remote, other], dir);
  fs.mkdirSync(path.join(other, "scripts", "bots"), { recursive: true });
  fs.writeFileSync(path.join(other, "scripts", "bots", "new.mjs"), "x\n");
  sh(["add", "scripts"], other);
  commit("company: a new thing", other);
  if (options.signed === true) {
    // As GitHub signs the squash merges on main: any gpgsig header makes git
    // run gpg.program to check it, if it is asked to.
    const raw = sh(["cat-file", "commit", "HEAD"], other);
    const signature =
      "gpgsig -----BEGIN PGP SIGNATURE-----\n \n AAAA\n -----END PGP SIGNATURE-----";
    const signed = raw.replace(/^(committer .*)$/m, `$1\n${signature}`);
    fs.writeFileSync(path.join(dir, "signed"), `${signed}\n`);
    const sha = sh(["hash-object", "-t", "commit", "-w", path.join(dir, "signed")], other);
    sh(["update-ref", "refs/heads/main", sha], other);
  }
  sh(["push", "-q", "origin", "main"], other);
  const target = sh(["rev-parse", "HEAD"], other);

  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, "company.json"), JSON.stringify({ repo: "o/r" }));
  fs.writeFileSync(
    path.join(root, "rebooting.json"),
    JSON.stringify({
      requestedAt: 1,
      reason: "load it",
      by: "manager",
      deadline: 2,
      bootSha: boot,
    }),
  );

  fs.mkdirSync(bin);
  const fake = (/** @type {string} */ name, /** @type {string} */ body) => {
    fs.writeFileSync(path.join(bin, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  };
  const alive = path.join(dir, "session-up");
  const kills = path.join(dir, "kills");
  const ups = path.join(dir, "ups");
  fs.writeFileSync(alive, "");
  fake(
    "devenv",
    [
      `echo "devenv $PWD $* rebooted=$VIBEWARS_REBOOTED" >>${calls}`,
      `[ -e scripts/bots/new.mjs ] && echo "saw the new main in $PWD" >>${calls}`,
      options.failBuild === true ? 'case "$*" in *--help*) exit 1 ;; esac' : "",
      'case "$*" in *" up") ;; *) exit 0 ;; esac',
      `[ -e ${alive} ] && exit 1`,
      `n=$(($(cat ${ups} 2>/dev/null || echo 0) + 1)); echo $n >${ups}`,
      `[ $n -le ${String(options.failUp ?? 0)} ] && exit 1`,
      "exit 0",
    ].join("\n"),
  );
  fake(
    "tmux",
    [
      `echo "tmux $*" >>${calls}`,
      'case "$1" in',
      `  has-session) [ -e ${alive} ] ;;`,
      `  kill-session) n=$(($(cat ${kills} 2>/dev/null || echo 0) + 1)); echo $n >${kills}; [ $n -gt ${String(options.survive ?? 0)} ] && rm -f ${alive}; exit 0 ;;`,
      `  list-panes) echo ${String(options.panePid ?? 0)} ;;`,
      "esac",
    ].join("\n"),
  );
  fake("pkill", `echo "pkill $*" >>${calls}`);
  fake("pgrep", "exit 1");

  /** @param {Record<string, string>} env */
  const environment = (env) => ({
    ...process.env,
    PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
    DEVENV_ROOT: repo,
    VIBEWARS_BOT_ROOT: root,
    VIBEWARS_LLC_SESSION: "restart-test",
    VIBEWARS_TMUX: path.join(bin, "tmux"),
    VIBEWARS_GIT_REMOTE: remote,
    GIT_CONFIG_GLOBAL: "/dev/null",
    TELEGRAM_MANAGER_TOKEN: "",
    TELEGRAM_CHAT_ID: "",
    ...env,
  });
  /**
   * @param {number | null} code
   * @returns {{ code: number | null, boot: Record<string, unknown>, calls: string[] }}
   */
  const outcome = (code) => {
    const bootFile = path.join(root, "boot.json");
    /** @type {unknown} */
    const written = fs.existsSync(bootFile) ? JSON.parse(fs.readFileSync(bootFile, "utf8")) : {};
    return { code, boot: obj(written), calls: fs.readFileSync(calls, "utf8").split("\n") };
  };
  const restart = () =>
    outcome(spawnSync(process.execPath, [RESTART], { env: environment({}) }).status);
  /**
   * For a test that serves something the restarter calls, such as a fake
   * Telegram: spawnSync would block the event loop that answers it.
   *
   * @param {Record<string, string>} env
   */
  const restartAsync = async (env) => {
    const child = spawn(process.execPath, [RESTART], { env: environment(env), stdio: "ignore" });
    await once(child, "exit");
    return outcome(child.exitCode);
  };

  return { dir, repo, remote, root, boot, target, restart, restartAsync };
}

describe("the restarter", () => {
  it("stops the company, moves a clean main to the new main, and starts it", () => {
    const company = setup();

    const result = company.restart();

    expect(result.code).toBe(0);
    expect(sh(["rev-parse", "HEAD"], company.repo)).toBe(company.target);
    expect(result.calls).toContain("tmux kill-session -t =restart-test");
    expect(result.calls).toContain("pkill -f claude-llc-agent");
    expect(result.calls).toContain("pkill -f hubd.mjs");
    expect(
      result.calls.some((c) =>
        c.endsWith("reboot-check shell --refresh-eval-cache -- claude-llc --help rebooted=1"),
      ),
    ).toBe(true);
    expect(result.calls).toContain(
      `devenv ${company.repo} shell --refresh-eval-cache -- claude-llc up rebooted=1`,
    );
    expect(result.boot).toMatchObject({
      sha: company.target,
      previousSha: company.boot,
      updated: true,
      note: `Rebooted onto ${company.target.slice(0, 8)}: company: a new thing.`,
    });
    expect(fs.existsSync(path.join(company.root, "rebooting.json"))).toBe(false);
    expect(fs.existsSync(path.join(company.root, "reboot-check"))).toBe(false);
  });

  it("starts every agent on a fresh conversation", () => {
    const company = setup();
    const agent = path.join(company.root, "agents", "developer-1");
    fs.mkdirSync(agent, { recursive: true });
    fs.writeFileSync(path.join(agent, "session-id"), "0f3c9a1e\n");
    fs.writeFileSync(path.join(agent, "between-turns"), "");

    expect(company.restart().code).toBe(0);
    expect(fs.existsSync(path.join(company.root, "agents"))).toBe(false);
  });

  it("never moves a checkout on another branch, and restarts on what it has", () => {
    const company = setup();
    sh(["checkout", "-q", "-b", "mine"], company.repo);

    const result = company.restart();

    expect(sh(["rev-parse", "HEAD"], company.repo)).toBe(company.boot);
    expect(String(result.boot.note)).toMatch(/NOT updated: checkout is on branch mine/);
    expect(result.calls).toContain(
      `devenv ${company.repo} shell --refresh-eval-cache -- claude-llc up rebooted=1`,
    );
  });

  it("never moves a checkout with local changes", () => {
    const company = setup();
    fs.writeFileSync(path.join(company.repo, ".gitignore"), "changed\n");

    const result = company.restart();

    expect(sh(["rev-parse", "HEAD"], company.repo)).toBe(company.boot);
    expect(String(result.boot.note)).toMatch(/NOT updated: checkout has local changes/);
  });

  it("keeps the old code when the new main does not build", () => {
    const company = setup({ failBuild: true });

    const result = company.restart();

    expect(sh(["rev-parse", "HEAD"], company.repo)).toBe(company.boot);
    expect(String(result.boot.note)).toMatch(
      new RegExp(
        `main ${company.target.slice(0, 8)} failed to build; running ${company.boot.slice(0, 8)}`,
      ),
    );
    expect(result.calls).toContain(
      `devenv ${company.repo} shell --refresh-eval-cache -- claude-llc up rebooted=1`,
    );
  });
});

/**
 * A Bot API that records what it is sent and answers ok. Closed after each test.
 *
 * @returns {Promise<{ env: Record<string, string>, sent: { path: string, body: unknown }[] }>}
 */
async function fakeTelegram() {
  /** @type {{ path: string, body: unknown }[]} */
  const sent = [];
  const server = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => (body += String(chunk)));
    request.on("end", () => {
      sent.push({ path: request.url ?? "", body: JSON.parse(body) });
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ ok: true, result: {} }));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  servers.push(server);
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  return {
    sent,
    env: {
      VIBEWARS_TELEGRAM_API: `http://127.0.0.1:${String(port)}`,
      TELEGRAM_MANAGER_TOKEN: "T0KEN",
      TELEGRAM_CHAT_ID: "-100",
    },
  };
}

/** @type {http.Server[]} */
const servers = [];

afterEach(() => {
  for (const server of servers.splice(0)) {
    server.close();
  }
});

describe("the restarter, when the old session will not go (#315)", () => {
  /** @type {import("node:child_process").ChildProcess[]} */
  const children = [];
  afterEach(() => {
    for (const child of children.splice(0)) {
      child.kill("SIGKILL");
    }
  });

  it("kills the processes in a session that survives kill-session, then starts the company", async () => {
    const pane = spawn("sleep", ["60"]);
    children.push(pane);
    const exited = once(pane, "exit");
    const company = setup({ survive: 1, panePid: pane.pid });

    const result = company.restart();

    expect(result.code).toBe(0);
    expect((await exited)[1]).toBe("SIGKILL");
    expect(result.calls.filter((c) => c === "tmux kill-session -t =restart-test")).toHaveLength(2);
    expect(fs.readFileSync(path.join(company.root, "hub", "reboot.log"), "utf8")).toMatch(
      /restart-test survived kill-session \(attempt 1\); killing its panes/,
    );
  }, 20_000);

  it("tries once more when claude-llc up fails, and says so in the boot note", () => {
    const company = setup({ failUp: 1 });

    const result = company.restart();

    expect(result.code).toBe(0);
    expect(result.calls.filter((c) => c.endsWith("claude-llc up rebooted=1"))).toHaveLength(2);
    expect(String(result.boot.note)).toMatch(
      /^Rebooted onto .* It came up on the second try: the first claude-llc up exited 1\.$/,
    );
  }, 20_000);

  it("tells the operator on Telegram when claude-llc up fails twice", async () => {
    const telegram = await fakeTelegram();
    const company = setup({ failUp: 2 });
    fs.writeFileSync(
      path.join(company.root, "registry.json"),
      JSON.stringify({ offset: 0, operator: { topicId: 42 } }),
    );

    const result = await company.restartAsync(telegram.env);

    expect(result.code).toBe(1);
    expect(String(result.boot.note)).toMatch(/^Reboot FAILED: claude-llc up exited 1, twice\./);
    expect(telegram.sent).toHaveLength(1);
    expect(telegram.sent[0]).toMatchObject({
      path: "/botT0KEN/sendMessage",
      body: { chat_id: "-100", message_thread_id: 42 },
    });
    expect(String(obj(telegram.sent[0]?.body).text)).toMatch(
      /^Reboot FAILED: claude-llc up exited 1, twice/,
    );
  }, 30_000);

  it("never runs claude-llc up into a session that will not stop, and says so", async () => {
    const telegram = await fakeTelegram();
    const company = setup({ survive: 99 });

    const result = await company.restartAsync(telegram.env);

    expect(result.code).toBe(1);
    expect(result.calls.some((c) => c.includes("claude-llc up"))).toBe(false);
    expect(result.calls.filter((c) => c === "tmux kill-session -t =restart-test")).toHaveLength(3);
    expect(fs.readFileSync(path.join(company.root, "hub", "reboot.log"), "utf8")).toMatch(
      /tmux session restart-test would not stop/,
    );
    expect(fs.existsSync(path.join(company.root, "rebooting.json"))).toBe(false);
    expect(String(obj(telegram.sent[0]?.body).text)).toMatch(
      /^Reboot FAILED: tmux session restart-test would not stop/,
    );
  }, 30_000);
});

describe("the restarter, against a checkout an agent has tampered with", () => {
  /**
   * A script that leaves a marker if anything ever runs it.
   *
   * @param {string} dir
   * @returns {{ script: string, marker: string }}
   */
  const trap = (dir) => {
    const marker = path.join(dir, "trap-ran");
    const script = path.join(dir, "trap.sh");
    fs.writeFileSync(script, `#!/bin/sh\ntouch ${marker}\ncat\n`, { mode: 0o755 });
    return { script, marker };
  };

  it("never fetches main through a URL rewrite in the checkout's config", () => {
    const company = setup();
    // An unreviewed repository the rewrite would hand back instead.
    const evil = path.join(company.dir, "evil.git");
    sh(["clone", "-q", "--bare", company.remote, evil], company.dir);
    const work = path.join(company.dir, "evil");
    sh(["clone", "-q", evil, work], company.dir);
    fs.writeFileSync(path.join(work, "evil.txt"), "x\n");
    sh(["add", "evil.txt"], work);
    commit("unreviewed", work);
    sh(["push", "-q", "origin", "main"], work);
    sh(["config", `url.${evil}.insteadOf`, company.remote], company.repo);

    const result = company.restart();

    expect(sh(["rev-parse", "HEAD"], company.repo)).toBe(company.target);
    expect(fs.existsSync(path.join(company.repo, "evil.txt"))).toBe(false);
    expect(result.boot).toMatchObject({ updated: true });
  });

  it("refuses a commit that is not the mirror's, whatever the checkout fetched", () => {
    const company = setup();
    const evil = path.join(company.dir, "evil.git");
    sh(["init", "--bare", "-q", "-b", "main", evil], company.dir);
    sh(["push", "-q", evil, "HEAD:refs/heads/main"], company.repo);
    sh(
      ["config", `url.${evil}.insteadOf`, path.join(company.root, "hub", ".git-mirror")],
      company.repo,
    );

    const result = company.restart();

    expect(sh(["rev-parse", "HEAD"], company.repo)).toBe(company.boot);
    expect(String(result.boot.note)).toMatch(/NOT updated: fetching main from hubd's mirror gave/);
  });

  it("runs no filter driver the checkout's config names", () => {
    const company = setup();
    const { script, marker } = trap(company.dir);
    for (const key of ["smudge", "clean", "process"]) {
      sh(["config", `filter.evil.${key}`, script], company.repo);
    }
    sh(["config", "filter.evil.required", "true"], company.repo);
    fs.writeFileSync(path.join(company.repo, ".git", "info", "attributes"), "* filter=evil\n");

    const result = company.restart();

    expect(fs.existsSync(marker)).toBe(false);
    expect(sh(["rev-parse", "HEAD"], company.repo)).toBe(company.target);
    expect(fs.readFileSync(path.join(company.repo, "scripts", "bots", "new.mjs"), "utf8")).toBe(
      "x\n",
    );
    expect(result.boot).toMatchObject({ updated: true });
  });

  it("runs no gpg program on GitHub's signed commits", () => {
    const company = setup({ signed: true });
    const { script, marker } = trap(company.dir);
    sh(["config", "gpg.program", script], company.repo);
    sh(["config", "merge.verifySignatures", "true"], company.repo);
    sh(["config", "log.showSignature", "true"], company.repo);

    const result = company.restart();

    expect(fs.existsSync(marker)).toBe(false);
    expect(result.boot).toMatchObject({ updated: true });
  });

  it("builds main from the mirror, not from the checkout", () => {
    const company = setup();

    const result = company.restart();

    expect(
      result.calls.includes(`saw the new main in ${path.join(company.root, "reboot-check")}`),
    ).toBe(true);
  });
});

describe("the restarter, against replace refs in the checkout", () => {
  it("checks out main's own tree, not one a replace ref swaps in under its sha", () => {
    const company = setup();
    // An agent's commit, and a replace ref claiming it is main.
    sh(["checkout", "-q", "-b", "agent"], company.repo);
    fs.writeFileSync(path.join(company.repo, "evil.txt"), "x\n");
    sh(["add", "evil.txt"], company.repo);
    commit("unreviewed", company.repo);
    const evil = sh(["rev-parse", "HEAD"], company.repo);
    sh(["checkout", "-q", "main"], company.repo);
    sh(["branch", "-q", "-D", "agent"], company.repo);
    fs.mkdirSync(path.join(company.repo, ".git", "refs", "replace"), { recursive: true });
    fs.writeFileSync(
      path.join(company.repo, ".git", "refs", "replace", company.target),
      `${evil}\n`,
    );

    const result = company.restart();

    expect(result.boot).toMatchObject({ updated: true });
    expect(fs.existsSync(path.join(company.repo, "evil.txt"))).toBe(false);
    expect(fs.existsSync(path.join(company.repo, "scripts", "bots", "new.mjs"))).toBe(true);
  });
});
