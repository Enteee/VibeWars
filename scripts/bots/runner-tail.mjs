#!/usr/bin/env node
/**
 * `runner-tail.mjs <file>`: follow a runner log in a tmux pane (#2729).
 * Prints the last lines, then each new one through `redact()`, and starts
 * over when the file is rotated to `.1` or replaced. Read-only: nothing
 * typed into the pane reaches a runner.
 */
import fs from "node:fs";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { redact } from "./peek.mjs";
import { readTail, tailLines } from "./runner-logs.mjs";

export const FIRST_LINES = 40;

/**
 * A follower of one file: `poll()` prints what was appended since the last
 * call. Whole lines only, a half line waits for its end.
 *
 * @param {string} file
 * @param {(line: string) => void} print
 * @returns {{ poll: () => void }}
 */
export function follow(file, print) {
  let offset = 0;
  let inode = -1;
  let held = "";
  let started = false;
  /** @param {string} line */
  const emit = (line) => {
    print(redact(line));
  };
  return {
    poll() {
      let stat;
      try {
        stat = fs.statSync(file);
      } catch {
        return;
      }
      if (!started) {
        started = true;
        for (const line of tailLines(readTail(file) ?? "", FIRST_LINES)) {
          emit(line);
        }
        offset = stat.size;
        inode = stat.ino;
        return;
      }
      if (stat.ino !== inode || stat.size < offset) {
        // Rotated: the new file is all news.
        offset = 0;
        inode = stat.ino;
        held = "";
      }
      if (stat.size === offset) {
        return;
      }
      const fd = fs.openSync(file, "r");
      try {
        const buffer = Buffer.alloc(stat.size - offset);
        const read = fs.readSync(fd, buffer, 0, buffer.length, offset);
        offset += read;
        const lines = `${held}${buffer.toString("utf8", 0, read)}`.split("\n");
        held = lines.pop() ?? "";
        for (const line of lines) {
          emit(line);
        }
      } finally {
        fs.closeSync(fd);
      }
    },
  };
}

if (
  process.argv[1] !== undefined &&
  fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const file = process.argv[2];
  if (file === undefined) {
    console.error("usage: runner-tail.mjs <file>");
    process.exit(2);
  }
  const follower = follow(file, (line) => {
    console.log(line);
  });
  for (;;) {
    follower.poll();
    await sleep(500);
  }
}
