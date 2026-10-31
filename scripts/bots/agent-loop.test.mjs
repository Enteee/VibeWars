/**
 * The pauses between an agent's turns (#146): how long, what ends one
 * early, what the company hears when the loop gives up, and how the loop
 * waits out Claude's usage limit (#308). The last part runs the restart
 * loop itself, from nix/claude-llc.nix, against a stand-in for claude-bot.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  boardChanges,
  gaveUpText,
  hasWaking,
  IDLE_PAUSE,
  idleWait,
  idleWoke,
  wokeFile,
  wokeText,
  writeWoke,
  LIMIT_MAX,
  PAUSE_MAX,
  PAUSE_MIN,
  SHORT_TURN,
  claimNotice,
  hasUnread,
  limitPause,
  nextPause,
  releaseNotice,
} from "./agent-loop.mjs";
import { answerBoard, sweep } from "./hub-board.mjs";
import { idleWaitsDir, parseWaits, WAITS_FILE } from "./waits.mjs";
import { SYSTEM, obj } from "./protocol.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const AGENT_LOOP = path.join(HERE, "agent-loop.mjs");
const AGENT_TURN = path.join(HERE, "agent-turn.mjs");
const LLC_NIX = path.join(HERE, "..", "..", "nix", "claude-llc.nix");

/** @type {string[]} */
const dirs = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** @returns {string} */
function scratch() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-loop-test-"));
  dirs.push(dir);
  return dir;
}

describe("nextPause", () => {
  it("doubles while turns stay short, up to the cap", () => {
    const pauses = [];
    let previous = 0;
    for (let i = 0; i < 8; i += 1) {
      previous = nextPause({ previous, ran: 5, failed: false });
      pauses.push(previous);
    }
    expect(pauses).toEqual([10, 20, 40, 80, 160, 300, 300, 300]);
    expect(PAUSE_MIN).toBe(10);
    expect(PAUSE_MAX).toBe(300);
  });

  it("goes back to the minimum after a long turn", () => {
    expect(nextPause({ previous: 160, ran: SHORT_TURN, failed: false })).toBe(PAUSE_MIN);
    expect(nextPause({ previous: 160, ran: SHORT_TURN - 1, failed: false })).toBe(PAUSE_MAX);
  });

  it("backs off failed runs too, however long they ran", () => {
    const pauses = [];
    let previous = 0;
    for (let i = 0; i < 6; i += 1) {
      previous = nextPause({ previous, ran: i === 2 ? SHORT_TURN * 2 : 1, failed: true });
      pauses.push(previous);
    }
    expect(pauses).toEqual([10, 20, 40, 80, 160, 300]);
  });
});

describe("limitPause", () => {
  const now = 1_761_400_000;

  it("waits for a known reset, plus a minute", () => {
    expect(limitPause({ until: now + 1000, now, previous: 0 })).toBe(1060);
  });

  it("waits at least a minute, and at most six hours", () => {
    expect(limitPause({ until: now - 500, now, previous: 0 })).toBe(60);
    expect(limitPause({ until: now + 24 * 3600, now, previous: 0 })).toBe(LIMIT_MAX);
    expect(LIMIT_MAX).toBe(6 * 3600);
  });

  it("retries an unknown reset at 5 min, doubling to 30 min", () => {
    const waits = [];
    let previous = 0;
    for (let i = 0; i < 5; i += 1) {
      previous = limitPause({ until: null, now, previous });
      waits.push(previous);
    }
    expect(waits).toEqual([300, 600, 1200, 1800, 1800]);
  });
});

describe("the usage limit notice", () => {
  const now = 1_761_400_000;

  it("is claimed by exactly one role, and released by exactly one", () => {
    const root = scratch();
    expect(claimNotice(root, now + 600, now)).toBe(true);
    expect(claimNotice(root, now + 600, now)).toBe(false);
    expect(releaseNotice(root)).toBe(true);
    expect(releaseNotice(root)).toBe(false);
  });

  it("replaces a stale notice: a reset 10 min past, or no reset for 6 h", () => {
    const root = scratch();
    expect(claimNotice(root, now, now)).toBe(true);
    expect(claimNotice(root, null, now + 600)).toBe(false);
    expect(claimNotice(root, null, now + 601)).toBe(true);
    expect(claimNotice(root, null, now + 601 + LIMIT_MAX)).toBe(false);
    expect(claimNotice(root, null, now + 602 + LIMIT_MAX)).toBe(true);
  });

  it("replaces a notice that is not one", () => {
    const root = scratch();
    fs.writeFileSync(path.join(root, "usage-limit.json"), "{");
    expect(claimNotice(root, null, now)).toBe(true);
  });
});

describe("hasUnread", () => {
  /** One inbox line, as the sidecar writes it. */
  const line = `${JSON.stringify({ ts: 1, from: "manager", text: "next: #274" })}\n`;

  it("is false with no inbox, and with an inbox read to its end", () => {
    const dir = scratch();
    expect(hasUnread(dir)).toBe(false);
    fs.writeFileSync(path.join(dir, "inbox.jsonl"), line);
    fs.writeFileSync(path.join(dir, "cursor"), `${String(Buffer.byteLength(line))}\n`);
    expect(hasUnread(dir)).toBe(false);
  });

  it("is true for a line past the cursor, or with no cursor yet", () => {
    const dir = scratch();
    fs.writeFileSync(path.join(dir, "inbox.jsonl"), line);
    expect(hasUnread(dir)).toBe(true);
    fs.writeFileSync(path.join(dir, "cursor"), "0\n");
    expect(hasUnread(dir)).toBe(true);
  });
});

describe("hasWaking (#1694)", () => {
  /**
   * @param {string} text
   * @param {boolean} broadcast
   */
  const line = (text, broadcast) =>
    `${JSON.stringify({ ts: 1, from: "manager", kind: "peer", text, broadcast })}\n`;

  it("is woken as tg wait is: not by a plain broadcast, by one that names the role", () => {
    const dir = scratch();
    fs.writeFileSync(path.join(dir, "inbox.jsonl"), line("FYI #9 merged", true));
    expect(hasWaking(dir, "developer@2")).toBe(false);
    fs.appendFileSync(path.join(dir, "inbox.jsonl"), line("developer: take #12", true));
    expect(hasWaking(dir, "developer@2")).toBe(true);
  });
});

describe("idleWait (#1694)", () => {
  const REPO = "Enteee/VibeWars";

  /**
   * @param {number} number
   * @param {string} status
   * @returns {import("./hub-board.mjs").Item}
   */
  const item = (number, status) => ({
    id: `PVTI_${String(number)}`,
    title: `item ${String(number)}`,
    status,
    content: {
      type: "Issue",
      number,
      title: `item ${String(number)}`,
      url: `https://github.com/${REPO}/issues/${String(number)}`,
      repository: REPO,
    },
  });

  /**
   * A board that is `items` until the clock reaches `at`, then `later`;
   * a clock that each pause moves on; and the wait over both.
   *
   * @param {{
   *   items?: import("./hub-board.mjs").Item[],
   *   later?: import("./hub-board.mjs").Item[],
   *   at?: number,
   *   column?: string | null,
   *   mail?: (t: number) => boolean,
   *   rebooting?: (t: number) => boolean,
   *   board?: boolean,
   * }} options
   */
  async function idle({
    items = [item(8, "Ready")],
    later = items,
    at = Infinity,
    column = "Ready",
    mail = () => false,
    rebooting = () => false,
    board = true,
  }) {
    let t = 0;
    const first = sweep(null, items, 0, "e1", REPO);
    const second = sweep(first, later, 1, "e1", REPO);
    /** @type {number[]} */
    const polls = [];
    const woken = await idleWait({
      seconds: IDLE_PAUSE,
      column,
      mail: () => mail(t),
      rebooting: () => rebooting(t),
      changes: (since) => {
        polls.push(t);
        return board
          ? answerBoard(t >= at ? second : first, { verb: "changes", since }, REPO)
          : null;
      },
      now: () => t,
      pause: (ms) => {
        t += ms;
        return Promise.resolve();
      },
    });
    return { woken, t, polls };
  }

  it("sleeps the whole IDLE_PAUSE, 50 min, when nothing comes", async () => {
    const { woken, t } = await idle({});
    expect(IDLE_PAUSE).toBe(50 * 60);
    expect(woken).toEqual({ by: "timer" });
    expect(t).toBe(IDLE_PAUSE * 1000);
  });

  it("wakes on mail", async () => {
    const { woken, t } = await idle({ mail: (now) => now >= 60_000 });
    expect(woken).toEqual({ by: "message" });
    expect(t).toBe(60_000);
  });

  it("wakes on a card arriving in the column", async () => {
    const { woken, t } = await idle({
      later: [item(8, "Ready"), item(9, "Ready")],
      at: 120_000,
    });
    expect(woken).toEqual({ by: "card", number: 9, column: "Ready" });
    expect(t).toBe(120_000);
  });

  it("does not wake on a card already there, nor one arriving in another column", async () => {
    const { woken } = await idle({
      items: [item(8, "Ready"), item(9, "In Review")],
      later: [item(8, "Ready"), item(9, "QA"), item(10, "Backlog")],
      at: 1,
    });
    expect(woken).toEqual({ by: "timer" });
  });

  it("ends on a pending reboot", async () => {
    expect((await idle({ rebooting: (now) => now >= 4000 })).woken).toEqual({ by: "reboot" });
  });

  it("waits on mail alone with no board, and for a role with no column, without asking it", async () => {
    const unreadable = await idle({ board: false, mail: (now) => now >= 10_000 });
    expect(unreadable.woken).toEqual({ by: "message" });
    expect(unreadable.polls).toEqual([0]);
    const manager = await idle({ column: null });
    expect(manager.woken).toEqual({ by: "timer" });
    expect(manager.polls).toEqual([]);
  });

  it("says what woke it, and nothing for a reboot", () => {
    expect(wokeText({ by: "message" })).toBe("You were idle; woken by: a message.");
    expect(wokeText({ by: "card", number: 9, column: "Ready" })).toBe(
      "You were idle; woken by: card #9 in Ready.",
    );
    expect(wokeText({ by: "timer" })).toBe("You were idle; woken by: the 50-minute timer.");
    expect(wokeText({ by: "reboot" })).toBeNull();
  });

  it("says it in the wait log's words (#1615)", () => {
    expect(idleWoke({ by: "message" })).toBe("message");
    expect(idleWoke({ by: "card", number: 9, column: "Ready" })).toBe("card");
    expect(idleWoke({ by: "timer" })).toBe("timeout");
    expect(idleWoke({ by: "reboot" })).toBe("reboot");
  });

  it("says it outside the bus, which the jail can write", () => {
    const root = scratch();
    const file = wokeFile(root, "developer@2");
    expect(path.relative(path.join(root, "bus"), file).startsWith("..")).toBe(true);
    expect(file).toBe(path.join(root, "agents", "developer@2", "woke"));
    writeWoke(root, "developer@2", "You were idle; woken by: a message.");
    expect(fs.readFileSync(file, "utf8")).toBe("You were idle; woken by: a message.\n");
    expect(fs.readdirSync(path.dirname(file))).toEqual(["woke"]);
    writeWoke(root, "developer@2", null);
    expect(fs.existsSync(file)).toBe(false);
  });

  it("reads hubd's copy of the board, and nothing while there is none", () => {
    const root = scratch();
    const changes = boardChanges(root);
    expect(changes(null)).toBeNull();
    fs.mkdirSync(path.join(root, "hub"));
    fs.writeFileSync(path.join(root, "company.json"), JSON.stringify({ repo: REPO }));
    fs.writeFileSync(path.join(root, "hub", "board.json"), "{");
    expect(changes(null)).toBeNull();
    fs.writeFileSync(
      path.join(root, "hub", "board.json"),
      JSON.stringify(sweep(null, [item(8, "Ready")], 0, "e1", REPO)),
    );
    expect(changes(null)?.cards).toEqual([
      { id: "PVTI_8", number: 8, title: "item 8", status: "Ready", type: "Issue" },
    ]);
  });
});

describe("gaveUpText (#384)", () => {
  it("tells the manager's loop keeps trying, and every other that it stopped", () => {
    expect(gaveUpText("manager")).toMatch(/keeps trying/);
    expect(gaveUpText("developer@2")).toMatch(/is stopped.*claude-llc-agent developer@2/);
  });
});

describe("agent-loop.mjs", () => {
  it("logs an idle sleep outside the bus, with what woke it (#1615)", () => {
    const root = scratch();
    fs.writeFileSync(path.join(root, "reboot.json"), "{}");
    const before = Date.now();
    const result = spawnSync(process.execPath, [AGENT_LOOP, "idle", "developer@2"], {
      encoding: "utf8",
      env: { ...process.env, VIBEWARS_BOT_ROOT: root },
    });
    expect(result.status).toBe(0);
    const file = path.join(idleWaitsDir(root, "developer@2"), WAITS_FILE);
    expect(path.relative(path.join(root, "bus"), file).startsWith("..")).toBe(true);
    const [line, ...rest] = parseWaits(fs.readFileSync(file, "utf8"));
    expect(rest).toEqual([]);
    expect(line).toMatchObject({ cmd: "idle", woke: "reboot" });
    expect(line?.start).toBeGreaterThanOrEqual(before);
  });

  it("prints the next pause", () => {
    const result = spawnSync(process.execPath, [AGENT_LOOP, "pause", "20", "3", "0"], {
      encoding: "utf8",
    });
    expect(result.stdout.trim()).toBe("40");
  });

  it("tells the whole company when a loop gives up, through the system outbox", () => {
    const root = scratch();
    const result = spawnSync(process.execPath, [AGENT_LOOP, "gave-up", "developer"], {
      encoding: "utf8",
      env: { ...process.env, VIBEWARS_BOT_ROOT: root },
    });
    expect(result.status).toBe(0);
    const outbox = path.join(root, "bus", SYSTEM, "outbox");
    const files = fs.readdirSync(outbox);
    expect(files).toHaveLength(1);
    const message = obj(JSON.parse(fs.readFileSync(path.join(outbox, files[0] ?? ""), "utf8")));
    expect(message.to).toBe("all");
    expect(message.text).toMatch(/developer failed five runs in a row.*claude-llc-agent developer/);
  });

  /**
   * @param {string} root
   * @returns {string[]} the texts in the system outbox, oldest first
   */
  function outboxTexts(root) {
    const outbox = path.join(root, "bus", SYSTEM, "outbox");
    if (!fs.existsSync(outbox)) {
      return [];
    }
    return fs
      .readdirSync(outbox)
      .sort()
      .map((file) =>
        String(obj(JSON.parse(fs.readFileSync(path.join(outbox, file), "utf8"))).text),
      );
  }

  /**
   * @param {string[]} args
   * @param {string} root
   * @returns {import("node:child_process").SpawnSyncReturns<string>}
   */
  function loop(args, root) {
    return spawnSync(process.execPath, [AGENT_LOOP, ...args], {
      encoding: "utf8",
      env: { ...process.env, VIBEWARS_BOT_ROOT: root },
    });
  }

  it("tells the company once that the limit is reached, and when it resets", () => {
    const root = scratch();
    const state = scratch();
    const until = Math.floor(Date.now() / 1000) + 3600;
    fs.writeFileSync(path.join(state, "limited-until"), `${String(until)}\n`);

    const first = loop(["limited", "developer", state, "0"], root);
    const second = loop(["limited", "developer@2", state, "0"], root);

    expect(first.status).toBe(0);
    expect(Number(first.stdout.trim())).toBeGreaterThan(3600);
    expect(Number(first.stdout.trim())).toBeLessThanOrEqual(3660);
    expect(second.stdout.trim()).not.toBe("");
    const texts = outboxTexts(root);
    expect(texts).toHaveLength(1);
    expect(texts[0]).toMatch(/^Claude usage limit reached; agents resume at \d\d:\d\d\.$/);
  });

  it("says so when it does not know the reset, and backs off from the last wait", () => {
    const root = scratch();
    const state = scratch();
    fs.writeFileSync(path.join(state, "limited-until"), "");

    const result = loop(["limited", "developer", state, "600"], root);

    expect(result.stdout.trim()).toBe("1200");
    expect(outboxTexts(root)).toEqual([
      "Claude usage limit reached; agents retry every few minutes until it resets.",
    ]);
  });

  it("says the limit is over once, after the first turn that ends, and never without one", () => {
    const root = scratch();
    loop(["resumed", "qa-tester"], root);
    expect(outboxTexts(root)).toEqual([]);

    const state = scratch();
    loop(["limited", "developer", state, "0"], root);
    loop(["resumed", "qa-tester"], root);
    loop(["resumed", "developer"], root);

    expect(outboxTexts(root).slice(1)).toEqual(["Claude usage limit over; agents are back."]);
    expect(fs.existsSync(path.join(root, "usage-limit.json"))).toBe(false);
  });

  it("refuses a name that is not an employee id", () => {
    for (const name of ["../x", "developer@1", "developer@../x"]) {
      const result = spawnSync(process.execPath, [AGENT_LOOP, "gave-up", name], {
        encoding: "utf8",
        env: { ...process.env, VIBEWARS_BOT_ROOT: scratch() },
      });
      expect(result.status, name).toBe(2);
    }
  });

  it("names a further employee when its loop gives up (#62)", () => {
    const root = scratch();
    spawnSync(process.execPath, [AGENT_LOOP, "gave-up", "developer@2"], {
      encoding: "utf8",
      env: { ...process.env, VIBEWARS_BOT_ROOT: root },
    });
    expect(outboxTexts(root)).toEqual([
      expect.stringMatching(/^developer@2 failed .*claude-llc-agent developer@2$/),
    ]);
  });
});

/**
 * The restart loop, run for real: the `claude-llc-agent` script from
 * nix/claude-llc.nix, with the real agent-turn.mjs, a claude-bot that plays
 * a list of runs, and an agent-loop.mjs that records what it is asked and
 * never sleeps.
 */
describe("claude-llc-agent", () => {
  /** What a stand-in claude-bot prints and exits with, by kind of run. */
  const RUNS = {
    ok: `echo '{"type":"result","subtype":"success","is_error":false}'`,
    fail: "exit 1",
    limit: `echo '{"type":"rate_limit_event","rate_limit_info":{"status":"rejected"}}'`,
    // A turn whose last `tg wait` found nothing (#1694).
    idle: `touch "$DEVENV_ROOT/.bots/bus/$1/idle"; echo '{"type":"result","subtype":"success","is_error":false}'`,
  };

  /**
   * @returns {string} the loop's bash, as nix would write it, calling `scripts`
   * @param {string} scripts
   */
  function loopScript(scripts) {
    const nix = fs.readFileSync(LLC_NIX, "utf8");
    const match = /claude-llc-agent = \{[\s\S]*?exec = ''\n([\s\S]*?)\n\s*'';/.exec(nix);
    if (match?.[1] === undefined) {
      throw new Error("no claude-llc-agent exec in nix/claude-llc.nix");
    }
    return match[1]
      .replaceAll("${node}", process.execPath)
      .replaceAll("${llcScripts}", scripts)
      .replaceAll("''${", "${");
  }

  /**
   * @param {(keyof typeof RUNS)[]} plan
   * @param {Record<string, string>} [env]
   * @param {string} [employee]
   * @returns {{ code: number | null, calls: string[], runs: number, stdout: string, notes: string[], contextFile: string, ran: string, dir: string }}
   */
  function run(plan, env = {}, employee = "developer") {
    const dir = scratch();
    const scripts = path.join(dir, "scripts");
    const bin = path.join(dir, "bin");
    fs.mkdirSync(scripts);
    fs.mkdirSync(bin);
    fs.symlinkSync(AGENT_TURN, path.join(scripts, "agent-turn.mjs"));
    const calls = path.join(dir, "calls");
    // Records each call. `limited` prints the last wait plus one, so the
    // calls show the loop hands each wait back to the next.
    fs.writeFileSync(
      path.join(scripts, "agent-loop.mjs"),
      [
        'import fs from "node:fs";',
        "const args = process.argv.slice(2);",
        `fs.appendFileSync(${JSON.stringify(calls)}, args.join(" ") + "\\n");`,
        'if (args[0] === "pause") console.log("0");',
        // The waits stand for the loop's life: this many and the loop is stopped.
        'if (args[0] === "wait" && fs.readFileSync(' +
          JSON.stringify(calls) +
          ', "utf8").split("\\n").filter((l) => l.startsWith("wait ")).length > Number(process.env.STOP_AFTER_WAITS ?? 1e9)) process.exit(1);',
        'if (args[0] === "limited") console.log(String(Number(args[3]) + 1));',
      ].join("\n"),
    );
    const count = path.join(dir, "count");
    const notes = path.join(dir, "notes");
    const contextFile = path.join(dir, "context-file");
    fs.writeFileSync(count, "0");
    const cases = plan.map((kind, i) => `  ${String(i + 1)}) ${RUNS[kind]} ;;`).join("\n");
    fs.writeFileSync(
      path.join(bin, "claude-bot"),
      [
        "#!/usr/bin/env bash",
        `n=$(( $(cat ${count}) + 1 )); echo "$n" >${count}`,
        `echo "\${VIBEWARS_KICKOFF_NOTE-}" >>${notes}`,
        `echo "$VIBEWARS_CONTEXT_FILE" >${contextFile}`,
        `echo "$1" >${path.join(dir, "ran")}`,
        'case "$n" in',
        cases,
        "  *) exit 1 ;;",
        "esac",
        "",
      ].join("\n"),
      { mode: 0o755 },
    );
    const script = path.join(dir, "claude-llc-agent");
    fs.writeFileSync(script, loopScript(scripts));
    const result = spawnSync("bash", [script, employee], {
      encoding: "utf8",
      timeout: 30_000,
      env: { ...process.env, DEVENV_ROOT: dir, PATH: `${bin}:${process.env.PATH ?? ""}`, ...env },
    });
    return {
      code: result.status,
      calls: fs.existsSync(calls) ? fs.readFileSync(calls, "utf8").trim().split("\n") : [],
      runs: Number(fs.readFileSync(count, "utf8").trim()),
      stdout: result.stdout,
      notes: fs.existsSync(notes) ? fs.readFileSync(notes, "utf8").split("\n").slice(0, -1) : [],
      contextFile: path.relative(dir, fs.readFileSync(contextFile, "utf8").trim()),
      ran: fs.readFileSync(path.join(dir, "ran"), "utf8").trim(),
      dir,
    };
  }

  it("waits out five usage limits without giving up, then gives up on five failures", () => {
    const result = run([
      "limit",
      "limit",
      "limit",
      "limit",
      "limit",
      "fail",
      "fail",
      "fail",
      "fail",
      "fail",
    ]);

    expect(result.code).toBe(1);
    expect(result.runs).toBe(10);
    expect(result.calls.filter((call) => call.startsWith("limited "))).toEqual(
      [0, 1, 2, 3, 4].map(
        (previous) =>
          /** @type {unknown} */ (
            expect.stringMatching(`^limited developer .+ ${String(previous)}$`)
          ),
      ),
    );
    expect(result.calls.filter((call) => call.startsWith("sleep "))).toEqual([
      "sleep 1",
      "sleep 2",
      "sleep 3",
      "sleep 4",
      "sleep 5",
    ]);
    expect(result.calls.at(-1)).toBe("gave-up developer");
    expect(result.stdout).toContain("Claude usage limit reached; next turn for developer in 1s.");
  });

  it("never gives up on the manager: it says so once and keeps trying (#384)", () => {
    const result = run(
      ["fail", "fail", "fail", "fail", "fail", "fail", "fail", "ok"],
      { STOP_AFTER_WAITS: "7" },
      "manager",
    );

    expect(result.code).toBe(0);
    expect(result.runs).toBe(8);
    expect(result.calls.filter((call) => call.startsWith("gave-up"))).toEqual(["gave-up manager"]);
  });

  it("gives the reboot note to the first turn only (#321)", () => {
    const result = run(["ok", "ok"], { VIBEWARS_KICKOFF_NOTE: "Rebooted onto abc" });

    expect(result.runs).toBe(7);
    expect(result.notes).toEqual(["Rebooted onto abc", "", "", "", "", "", ""]);
  });

  it("names the employee's context file in its bus directory, where tg wait reads it (#321)", () => {
    expect(run(["fail"]).contextFile).toBe(".bots/bus/developer/context.json");
  });

  it("runs a second employee under its own id, state and bus directory (#62)", () => {
    const result = run(["fail"], {}, "developer@2");

    expect(result.ran).toBe("developer@2");
    expect(fs.readdirSync(path.join(result.dir, ".bots", "agents"))).toEqual(["developer@2"]);
    expect(result.contextFile).toBe(".bots/bus/developer@2/context.json");
    expect(result.stdout).toContain("next turn for developer@2 in 0s");
    expect(result.calls).toContain("wait developer@2 0");
  });

  it("sleeps an idle turn in agent-loop idle, and the next turn as before (#1694)", () => {
    const result = run(["idle", "ok", "fail", "fail", "fail", "fail", "fail"]);

    expect(result.calls.filter((call) => /^(idle|wait) /.test(call))).toEqual([
      "idle developer",
      "wait developer 0",
      "wait developer 0",
      "wait developer 0",
      "wait developer 0",
      "wait developer 0",
    ]);
    expect(result.stdout).toContain("developer is idle; next turn in 50 min");
    expect(fs.existsSync(path.join(result.dir, ".bots", "bus", "developer", "idle"))).toBe(false);
  });

  it("neither counts a limit as a failure nor lets it reset the count", () => {
    const result = run(["fail", "fail", "limit", "fail", "fail", "fail", "ok"]);

    expect(result.code).toBe(1);
    expect(result.runs).toBe(6);
    expect(result.calls.at(-1)).toBe("gave-up developer");
  });

  it("starts the limit backoff over, and says the limit is over, after a turn that ends", () => {
    const result = run(["limit", "limit", "ok", "limit", "fail", "fail", "fail", "fail", "fail"]);

    expect(result.code).toBe(1);
    expect(
      result.calls
        .filter((call) => call.startsWith("limited "))
        .map((call) => call.split(" ").at(-1)),
    ).toEqual(["0", "1", "0"]);
    expect(result.calls.filter((call) => call.startsWith("resumed "))).toEqual([
      "resumed developer",
    ]);
  });
});
