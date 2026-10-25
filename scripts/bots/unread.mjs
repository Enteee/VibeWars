/**
 * What an employee has not read yet: its inbox from its cursor. Both files
 * are jail-writable, so they are read without following links and with a cap
 * (jail-fs.mjs); a FIFO, a symlink or an oversized file reads as no lines.
 * Shared by link (to skip a nudge still unread) and the dashboard (#547).
 */
import path from "node:path";

import { withJailDir } from "./jail-fs.mjs";
import { readInbox } from "./protocol.mjs";

/** The most of an inbox read to tell whether a nudge is still unread. */
const INBOX_READ_MAX_BYTES = 16 * 1024 * 1024;

/**
 * @param {string} bus
 * @param {string} employee
 * @returns {import("./protocol.mjs").InboxLine[]}
 */
export function unreadOf(bus, employee) {
  try {
    return withJailDir(path.join(bus, employee), "", {}, (dir) => {
      let cursor = 0;
      try {
        cursor = Number.parseInt(dir.readSmall("cursor", 64).trim(), 10) || 0;
      } catch {
        // Never read: everything is unread.
      }
      return readInbox(dir.readSmall("inbox.jsonl", INBOX_READ_MAX_BYTES), cursor).lines;
    });
  } catch {
    return [];
  }
}
