import fs from "node:fs";
import path from "node:path";
import process from "node:process";

/**
 * One running copy of a host daemon, and no more (#23).
 *
 * Two hubds draining one spool would run every request twice, double
 * comments and double merges included, and two Telegram sidecars would make
 * Telegram answer "409 Conflict". So each takes a lock file at startup and
 * exits if it is held.
 *
 * `wx` makes taking the lock atomic, and a lock whose holder has gone is
 * taken over by renaming it. A pid alone does not say the holder is still
 * there: the lock files outlive a host reboot, and by then the pid may
 * belong to any program, which would keep hubd from ever starting again.
 * So the lock records the boot it was taken in, and the holder counts only
 * if it is from this boot, alive, and running the same daemon. This runs
 * on the host, so a pid is meaningful here, unlike inside the jails.
 */

const BOOT_ID = "/proc/sys/kernel/random/boot_id";

/** @returns {string} this boot's id, or "" where there is none to read */
function bootId() {
  try {
    return fs.readFileSync(BOOT_ID, "utf8").trim();
  } catch {
    return "";
  }
}

/** @returns {string} what this process writes into a lock it holds */
function mine() {
  return `${String(process.pid)} ${bootId()}\n`;
}

/**
 * Whether a lock's contents name a holder still running as `who`.
 *
 * @param {string} seen the lock file's contents
 * @param {string} who what the holder's command line must contain
 * @returns {boolean}
 */
function holderRuns(seen, who) {
  const [pid, boot = ""] = seen.trim().split(/\s+/);
  const number = Number.parseInt(pid ?? "", 10);
  if (!Number.isInteger(number) || number <= 0 || boot !== bootId()) {
    return false;
  }
  try {
    process.kill(number, 0);
  } catch {
    return false;
  }
  try {
    // NUL-separated arguments; the daemon's script is one of them.
    return fs.readFileSync(`/proc/${String(number)}/cmdline`, "utf8").includes(who);
  } catch {
    return false;
  }
}

/**
 * @param {string} lock
 * @param {string} [who] what a live holder's command line contains: by
 *   default this script's file name, such as `hubd.mjs`
 * @returns {boolean} whether this process now holds it
 */
export function takeLock(lock, who = path.basename(process.argv[1] ?? "")) {
  const record = mine();
  try {
    fs.writeFileSync(lock, record, { flag: "wx" });
    return true;
  } catch {
    /* held, or left behind; see below */
  }
  const seen = fs.readFileSync(lock, "utf8");
  if (holderRuns(seen, who)) {
    return false;
  }
  // Take over a gone holder's lock by renaming it away. Only one rename of
  // that file can succeed, so two daemons racing here cannot both win, and
  // checking the contents makes sure the file renamed is the stale one we
  // looked at, not a lock a faster daemon has just written.
  const stale = `${lock}.stale-${String(process.pid)}`;
  try {
    fs.renameSync(lock, stale);
  } catch {
    return false;
  }
  if (fs.readFileSync(stale, "utf8") !== seen) {
    fs.renameSync(stale, lock);
    return false;
  }
  fs.rmSync(stale, { force: true });
  try {
    fs.writeFileSync(lock, record, { flag: "wx" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Let go of a lock this process holds; one held by anyone else stays.
 *
 * @param {string} lock
 */
export function releaseLock(lock) {
  try {
    if (fs.readFileSync(lock, "utf8") === mine()) {
      fs.rmSync(lock, { force: true });
    }
  } catch {
    /* already gone */
  }
}
