/**
 * One running copy of a daemon, per company.
 *
 * The sidecar, hubd and the supervisor must each run exactly once: two
 * sidecars on one bot token get "409 Conflict" and the company goes deaf, and
 * two hubds draining the same spool would carry out every request twice
 * (double comments, double merges).
 *
 * Typed with JSDoc; see protocol.mjs.
 */
import fs from "node:fs";
import process from "node:process";

/**
 * Take the lock at `lock`, or say someone else holds it.
 *
 * `wx` makes taking it atomic, and a lock whose holder has died is taken over
 * by renaming it. These daemons run on the host, so a pid is meaningful here,
 * unlike inside the jails.
 *
 * @param {string} lock
 * @returns {boolean} whether this process now holds it
 */
export function takeLock(lock) {
  const mine = `${String(process.pid)}\n`;
  try {
    fs.writeFileSync(lock, mine, { flag: "wx" });
    return true;
  } catch {
    /* held, or left behind; see below */
  }
  const seen = fs.readFileSync(lock, "utf8");
  try {
    process.kill(Number.parseInt(seen.trim(), 10), 0);
    return false;
  } catch {
    /* the holder is dead */
  }
  // Take over a dead holder's lock by renaming it away. Only one rename of
  // that file can succeed, so two processes racing here cannot both win, and
  // checking the contents makes sure the file renamed is the stale one we
  // looked at, not a lock a faster process has just written.
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
    fs.writeFileSync(lock, mine, { flag: "wx" });
    return true;
  } catch {
    return false;
  }
}
