/**
 * `claude-llc-init`'s hibernation step (#2794): explain it, check the
 * machine can do it, install the root units through sudo and offer a real
 * test. Every root command is printed before it runs, as in
 * `runner-disk.mjs`. Whatever happens here, init goes on; a step that fails
 * only leaves hibernation off.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { DEFAULT_WAKE_MARGIN, hibernateSetting, validMargin } from "./hub-sleep.mjs";
import {
  SLEEP_DIR,
  SLEEP_PATH_TEXT,
  SLEEP_PATH_UNIT,
  SLEEP_SCRIPT,
  SLEEP_SCRIPT_TEXT,
  SLEEP_SERVICE_TEXT,
  SLEEP_SERVICE_UNIT,
  SLEEP_TMPFILES,
  sleepTmpfiles,
} from "./hub-sleep-units.mjs";

const WAKE_ALARM = "/sys/class/rtc/rtc0/wakealarm";
/** The test's alarm, in seconds. */
const TEST_SLEEP = 300;
/** How long `systemctl hibernate` gets to take the machine down, in seconds. */
const TEST_TAKES_EFFECT = 120;
/** Where NixOS fetches the module from: GitHub, never the checkout (#3202). */
const REPO = "https://github.com/Enteee/VibeWars";
const NIXOS_MODULE = "nix/nixos/vibewars-sleep.nix";

/**
 * @typedef {object} HibernateHost
 * @property {(argv: string[], input?: string) => { code: number }} run
 * @property {(question: string) => Promise<string>} ask
 * @property {(line: string) => void} say
 * @property {boolean} canAsk stdin is a tty and sudo is on PATH
 * @property {boolean} nixos
 * @property {() => string | null} mainRev GitHub's main as the checkout fetches
 *   it, `null` if the fetch failed
 * @property {(rev: string) => boolean} hasModuleAt `rev` holds the NixOS module
 * @property {(url: string) => string | null} prefetch the sha256 of the unpacked
 *   tarball, `null` if nix-prefetch-url is missing or failed
 * @property {string} user
 * @property {() => string} canHibernate logind's answer
 * @property {() => boolean} hasWakeAlarm
 * @property {() => boolean} unitsInstalled
 * @property {() => Promise<number | null>} awaySeconds after the test's
 *   hibernate: how long the machine was away, `null` if it never went
 */

/**
 * @param {{ stdin: { isTTY: boolean } }} proc
 * @param {(question: string) => Promise<string>} ask
 * @param {(line: string) => void} say
 * @param {string} checkout the VibeWars checkout this init runs for
 * @returns {HibernateHost}
 */
export function realHibernateHost(proc, ask, say, checkout) {
  return {
    run: (argv, input) => {
      const [command = "", ...args] = argv;
      const result = spawnSync(command, args, {
        input,
        // tee echoes what it writes; sudo asks on the terminal.
        stdio: input === undefined ? "inherit" : ["pipe", "ignore", "inherit"],
      });
      return { code: result.status ?? 1 };
    },
    ask,
    say,
    canAsk: proc.stdin.isTTY && spawnSync("sudo", ["--version"], { stdio: "ignore" }).status === 0,
    nixos: fs.existsSync("/etc/NIXOS"),
    mainRev: () => {
      const git = (/** @type {string[]} */ ...args) =>
        spawnSync("git", ["-C", checkout, ...args], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "inherit"],
        });
      if (git("fetch", "--quiet", `${REPO}.git`, "main").status !== 0) {
        return null;
      }
      return git("rev-parse", "FETCH_HEAD").stdout.trim();
    },
    hasModuleAt: (rev) =>
      spawnSync("git", ["-C", checkout, "cat-file", "-e", `${rev}:${NIXOS_MODULE}`], {
        stdio: "ignore",
      }).status === 0,
    prefetch: (url) => {
      const result = spawnSync("nix-prefetch-url", ["--unpack", url], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "inherit"],
      });
      return result.status === 0 ? result.stdout.trim() : null;
    },
    user: os.userInfo().username,
    canHibernate: () =>
      /"(\w+)"/.exec(
        spawnSync(
          "busctl",
          [
            "call",
            "org.freedesktop.login1",
            "/org/freedesktop/login1",
            "org.freedesktop.login1.Manager",
            "CanHibernate",
          ],
          { encoding: "utf8" },
        ).stdout,
      )?.[1] ?? "unknown",
    hasWakeAlarm: () => fs.existsSync(WAKE_ALARM),
    unitsInstalled: () => fs.existsSync(SLEEP_PATH_UNIT),
    awaySeconds: async () => {
      const started = Date.now();
      let last = started;
      while (Date.now() - started < TEST_TAKES_EFFECT * 1000) {
        await sleep(1000);
        const now = Date.now();
        // Timers do not count time asleep; the wall clock does.
        if (now - last > 30_000) {
          return Math.round((now - started) / 1000);
        }
        last = now;
      }
      return null;
    },
  };
}

/**
 * A command as the operator could paste it.
 *
 * @param {readonly string[]} argv
 * @returns {string}
 */
function shown(argv) {
  return argv
    .map((arg) => (/^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", `'\\''`)}'`))
    .join(" ");
}

/**
 * @param {HibernateHost} host
 * @param {string} question
 * @returns {Promise<boolean>} default no
 */
async function yes(host, question) {
  return (await host.ask(`  ${question} [y/N] `)).trim().toLowerCase() === "y";
}

/**
 * @param {HibernateHost} host
 * @param {readonly string[]} argv
 * @param {string} [input]
 * @returns {boolean} whether it worked
 */
function rootStep(host, argv, input) {
  host.say(`  $ ${shown(argv)}`);
  return host.run([...argv], input).code === 0;
}

/**
 * @param {HibernateHost} host
 * @returns {boolean} whether every step worked
 */
function install(host) {
  // Debian and Ubuntu do not ship it.
  if (!rootStep(host, ["sudo", "mkdir", "-p", path.dirname(SLEEP_SCRIPT)])) {
    return false;
  }
  /** @type {[string, string, string?][]} */
  const files = [
    [SLEEP_SCRIPT, SLEEP_SCRIPT_TEXT, "755"],
    [SLEEP_PATH_UNIT, SLEEP_PATH_TEXT],
    [SLEEP_SERVICE_UNIT, SLEEP_SERVICE_TEXT],
    [SLEEP_TMPFILES, sleepTmpfiles(host.user)],
  ];
  for (const [file, text, mode] of files) {
    if (
      !rootStep(host, ["sudo", "tee", file], text) ||
      !rootStep(host, ["sudo", "chmod", mode ?? "644", file])
    ) {
      return false;
    }
  }
  return (
    rootStep(host, ["sudo", "systemd-tmpfiles", "--create", SLEEP_TMPFILES]) &&
    rootStep(host, ["sudo", "systemctl", "daemon-reload"]) &&
    rootStep(host, ["sudo", "systemctl", "enable", "--now", "vibewars-sleep.path"])
  );
}

/**
 * @param {HibernateHost} host
 * @param {number} suggested
 * @returns {Promise<number>} minutes
 */
async function askMargin(host, suggested) {
  for (;;) {
    const answer = (
      await host.ask(`  Wake this many minutes before the reset [${String(suggested)}]: `)
    ).trim();
    const margin = answer === "" ? suggested : Number(answer);
    if (validMargin(margin)) {
      return margin;
    }
    host.say("  A whole number from 1 to 60, please.");
  }
}

/**
 * Hibernate now, wake by the RTC alarm, and ask how that went.
 *
 * @param {HibernateHost} host
 * @returns {Promise<{ wakeMarginMinutes: number } | null>}
 */
async function test(host) {
  const went =
    rootStep(host, ["sudo", "rtcwake", "-m", "no", "-s", String(TEST_SLEEP)]) &&
    rootStep(host, ["sudo", "systemctl", "hibernate"]);
  const away = went ? await host.awaySeconds() : null;
  if (away === null) {
    host.say("  The machine did not hibernate, so waking is unproven.");
    return unproven(host);
  }
  host.say(`  The machine was away for ${String(away)} s.`);
  if (await yes(host, "Did it wake by itself, without anyone pressing power?")) {
    const past = Math.ceil(Math.max(0, away - TEST_SLEEP) / 60) + 2;
    return {
      wakeMarginMinutes: await askMargin(host, Math.min(60, Math.max(DEFAULT_WAKE_MARGIN, past))),
    };
  }
  host.say("  Warning: on this machine the host would stay down until someone wakes it.");
  return (await yes(host, "Enable hibernation anyway?"))
    ? { wakeMarginMinutes: DEFAULT_WAKE_MARGIN }
    : null;
}

/**
 * @param {HibernateHost} host
 * @returns {Promise<{ wakeMarginMinutes: number } | null>}
 */
async function unproven(host) {
  host.say("  Warning: if the alarm does not fire, the host stays down until someone wakes it.");
  return (await yes(host, "Enable hibernation without a proven wake?"))
    ? { wakeMarginMinutes: DEFAULT_WAKE_MARGIN }
    : null;
}

/**
 * Say what a NixOS host imports. Root applies the module, so it is pinned to
 * a commit of GitHub's main and its hash, never read from the checkout, which
 * the company user can write (#3202).
 *
 * @param {HibernateHost} host
 */
function nixosImport(host) {
  const rev = host.mainRev();
  if (rev === null) {
    host.say(`  Could not fetch main from ${REPO}: hibernation stays off.`);
    return;
  }
  if (!host.hasModuleAt(rev)) {
    host.say(`  main (${rev}) has no ${NIXOS_MODULE} yet: hibernation stays off.`);
    return;
  }
  const url = `${REPO}/archive/${rev}.tar.gz`;
  const sha256 = host.prefetch(url);
  if (sha256 === null) {
    host.say(`  nix-prefetch-url --unpack ${url} failed: hibernation stays off.`);
    return;
  }
  host.say("  Hibernation stays off until this is in your NixOS configuration and rebuilt:");
  host.say('    imports = [ "${builtins.fetchTarball {');
  host.say(`      url = "${url}";`);
  host.say(`      sha256 = "${sha256}";`);
  host.say(`    }}/${NIXOS_MODULE}" ];`);
  host.say(`    services.vibewars-sleep = { enable = true; user = "${host.user}"; };`);
  host.say(
    `  Flake config: add input vibewars = { url = "github:Enteee/VibeWars/${rev}"; flake = false; };`,
  );
  host.say(`    and import "\${inputs.vibewars}/${NIXOS_MODULE}" instead.`);
}

/**
 * Ask whether this machine may hibernate, and set it up if so.
 *
 * @param {object} options
 * @param {unknown} options.previous the parsed `company.json`, if there is one
 * @param {HibernateHost} options.host
 * @returns {Promise<{ wakeMarginMinutes: number } | null>} `company.json`'s `hibernate`
 */
export async function askHibernate({ previous, host }) {
  const asked = typeof previous === "object" && previous !== null && "hibernate" in previous;
  const stored = hibernateSetting(previous);
  if (!host.canAsk) {
    return stored;
  }
  if (asked) {
    const now =
      stored === null
        ? "off"
        : `on, waking ${String(stored.wakeMarginMinutes)} min before the reset`;
    const again = (
      await host.ask(`  Hibernation is ${now}. Enter keeps it; "s" sets it up again: `)
    )
      .trim()
      .toLowerCase();
    if (again !== "s") {
      return stored;
    }
  }
  host.say("  The company can hibernate this machine while every agent waits on the");
  host.say("  usage limit, and wake it before the reset. Automatic wake depends on the");
  host.say("  hardware (a firmware RTC alarm from hibernate), and the machine needs");
  host.say("  unattended disk unlock, or it sits at the passphrase prompt until someone comes.");
  if (!(await yes(host, "Hibernate this machine during usage limits?"))) {
    return null;
  }
  const can = host.canHibernate();
  if (can !== "yes") {
    host.say(`  logind's CanHibernate says "${can}": hibernation stays off.`);
    return null;
  }
  if (!host.hasWakeAlarm()) {
    host.say(`  ${WAKE_ALARM} does not exist: hibernation stays off.`);
    return null;
  }
  if (host.nixos && !host.unitsInstalled()) {
    nixosImport(host);
    host.say("  Then run claude-llc-init again.");
    return null;
  }
  if (!host.nixos && !install(host)) {
    host.say(
      `  That failed. To set it up by hand, install these as root, then enable the path unit:`,
    );
    host.say(`    ${SLEEP_SCRIPT}, ${SLEEP_PATH_UNIT}, ${SLEEP_SERVICE_UNIT}`);
    host.say(`    ${SLEEP_DIR} owned by ${host.user}, mode 0700 (${SLEEP_TMPFILES})`);
    host.say("  See docs/development/agent-company-host.md. Hibernation stays off.");
    return null;
  }
  host.say("  This hibernates the machine now and tries to wake it in 5 minutes. Save your work.");
  const answer = (await host.ask("  Run the test? [Y/n] ")).trim().toLowerCase();
  return answer === "" || answer === "y" ? test(host) : unproven(host);
}
