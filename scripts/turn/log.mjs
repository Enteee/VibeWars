/**
 * Reading coturn's verbose log (#974) for turn-dash: the lines worth a human's
 * attention, and when each user last allocated.
 */
import fs from "node:fs";

/** The kinds of line the log pane keeps. */
const INTERESTING = [
  / session \S+: new, /,
  / session \S+: closed /,
  / session \S+: usage: /,
  /check_stun_auth/,
  / error \d{3}: /,
  /^\S+ (ERROR|WARNING) /,
];

/**
 * @param {readonly string[]} lines
 * @returns {string[]}
 */
export function filterLog(lines) {
  return lines.filter((line) => INTERESTING.some((re) => re.test(line)));
}

const ALLOCATED =
  /^(\S+) .* session \S+: realm <[^>]*> user <([^>]*)>: incoming packet ALLOCATE processed, success/;

/**
 * The timestamp of each user's last successful allocation.
 *
 * @param {readonly string[]} lines
 * @returns {Map<string, string>}
 */
export function lastAllocations(lines) {
  /** @type {Map<string, string>} */
  const last = new Map();
  for (const line of lines) {
    const m = ALLOCATED.exec(line);
    if (m !== null) last.set(/** @type {string} */ (m[2]), /** @type {string} */ (m[1]));
  }
  return last;
}

/**
 * The last `bytes` of a file as lines, the first (likely cut) one dropped
 * when the file is longer than that. Empty when there is no file yet.
 *
 * @param {string} file
 * @param {number} [bytes]
 * @returns {string[]}
 */
export function tailLines(file, bytes = 1 << 20) {
  let fd;
  try {
    fd = fs.openSync(file, "r");
  } catch {
    return [];
  }
  try {
    const size = fs.fstatSync(fd).size;
    const start = Math.max(0, size - bytes);
    const buf = Buffer.alloc(size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    const lines = buf.toString("utf8").split("\n");
    if (start > 0) lines.shift();
    return lines.filter((line) => line !== "");
  } finally {
    fs.closeSync(fd);
  }
}
