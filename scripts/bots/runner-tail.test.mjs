import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { follow } from "./runner-tail.mjs";

describe("runner-tail follow", () => {
  it("prints the tail, then only new whole lines, redacted, and follows a rotation", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tail-"));
    const file = path.join(dir, "r.log");
    fs.writeFileSync(file, "old\n");
    /** @type {string[]} */
    const out = [];
    const f = follow(file, (line) => out.push(line));
    f.poll();
    expect(out).toEqual(["old"]);
    fs.appendFileSync(file, "new1\nhal");
    f.poll();
    expect(out).toEqual(["old", "new1"]);
    fs.appendFileSync(file, "f ghs_abcdefghijklmnopqrstuvwxyz0123456789\n");
    f.poll();
    expect(out.at(-1)).toBe("half [redacted]");
    fs.renameSync(file, `${file}.1`);
    fs.writeFileSync(file, "fresh\n");
    f.poll();
    expect(out.at(-1)).toBe("fresh");
  });
});
