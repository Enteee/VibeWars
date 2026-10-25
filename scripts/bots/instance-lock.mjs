import fs from "node:fs";

/**
 * One running copy of a host daemon, and no more (#23).
 *
 * Two hubds draining one spool would run every request twice, double
 * comments and double merges included, and two Telegram sidecars would make
 * Telegram answer "409 Conflict". So each takes a lock file at startup and
 * exits if it is held.
 *
 * `wx` makes taking the lock atomic, and a lock whose holder has died is
 * taken over by renaming it. This runs on the host, so a pid is meaningful
 * here, unlike inside the jails.
 */

/**
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
    fs.writeFileSync(lock, mine, { flag: "wx" });
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
    if (fs.readFileSync(lock, "utf8") === `${String(process.pid)}\n`) {
      fs.rmSync(lock, { force: true });
    }
  } catch {
    /* already gone */
  }
}
