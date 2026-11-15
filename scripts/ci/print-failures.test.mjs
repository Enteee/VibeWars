import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import {
  MAX_TEST_LINES,
  MAX_TOTAL_LINES,
  printFailures,
  readZipEntry,
  traceSummary,
} from "./print-failures.mjs";

/** A one-entry zip, deflated, enough for the reader. */
/**
 * @param {string} name
 * @param {string} text
 */
function zipOf(name, text) {
  const data = deflateRawSync(Buffer.from(text));
  const n = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt16LE(n.length, 26);
  const cen = Buffer.alloc(46);
  cen.writeUInt32LE(0x02014b50, 0);
  cen.writeUInt16LE(8, 10);
  cen.writeUInt32LE(data.length, 20);
  cen.writeUInt16LE(n.length, 28);
  cen.writeUInt32LE(0, 42);
  const body = Buffer.concat([local, n, data]);
  const dir = Buffer.concat([cen, n]);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(body.length, 16);
  return Buffer.concat([body, dir, end]);
}

/** @param {number} i */
const before = (i) =>
  JSON.stringify({
    type: "before",
    apiName: "locator.click",
    startTime: i,
    params: { selector: "#b" + String(i) },
  });

/**
 * @param {Buffer | undefined} trace
 * @param {string} [context]
 */
function fixture(trace, context = '- heading "Hi"') {
  const root = mkdtempSync(join(tmpdir(), "pf-"));
  const dir = join(root, "tutorial-flake");
  mkdirSync(dir);
  writeFileSync(join(dir, "error-context.md"), context);
  if (trace !== undefined) writeFileSync(join(dir, "trace.zip"), trace);
  return root;
}

describe("print-failures", () => {
  it("reads a deflated zip entry", () => {
    expect(readZipEntry(zipOf("trace.trace", "abc"), "trace.trace").toString()).toBe("abc");
  });

  it("keeps the last 30 actions", () => {
    const text = Array.from({ length: 40 }, (_, i) => before(i)).join("\n");
    const out = traceSummary(text);
    expect(out).toHaveLength(30);
    expect(out[29]).toBe("39 locator.click #b39");
  });

  it("prints the context and the trace in a group", () => {
    const out = printFailures(fixture(zipOf("trace.trace", before(1)))).join("\n");
    expect(out).toContain("::group::tutorial-flake");
    expect(out).toContain('- heading "Hi"');
    expect(out).toContain("1 locator.click #b1");
    expect(out).toContain("::endgroup::");
  });

  it("says so for a broken trace and keeps going", () => {
    expect(printFailures(fixture(Buffer.from("junk"))).join("\n")).toContain("trace unreadable");
  });

  it("prints one line where there is nothing", () => {
    expect(printFailures(join(tmpdir(), "pf-missing"))).toHaveLength(1);
  });

  it("caps a test and the whole output", () => {
    const long = Array.from({ length: 900 }, (_, i) => "l" + String(i)).join("\n");
    const one = printFailures(fixture(undefined, long));
    expect(one.length).toBeLessThanOrEqual(MAX_TEST_LINES + 2);
    const root = fixture(undefined, "x");
    for (let i = 0; i < 20; i++) {
      mkdirSync(join(root, "t" + String(i)));
      writeFileSync(join(root, "t" + String(i), "error-context.md"), long);
    }
    expect(printFailures(root).length).toBeLessThanOrEqual(MAX_TOTAL_LINES + 1);
  });
});

describe("print-failures hardening", () => {
  it("defuses a page line that looks like a workflow command", () => {
    const out = printFailures(fixture(undefined, "::error::boom")).join("\n");
    expect(out).not.toMatch(/^::error::/m);
    expect(out).toContain(" ::error::boom");
  });
});
