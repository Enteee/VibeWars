/**
 * jail-fs.mjs against what a jail can plant in its own directories (#329):
 * every write leaves a target outside byte-identical, and refuses or logs.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { openJailDir, withJailDir } from "./jail-fs.mjs";

/** @type {string[]} */
const dirs = [];
/** @type {import("node:child_process").ChildProcess[]} */
const children = [];

afterEach(() => {
  for (const child of children.splice(0)) {
    child.kill("SIGKILL");
  }
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * A role directory, and outside it a directory and a file a jail must
 * never reach.
 */
function tree() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jail-fs-test-"));
  dirs.push(dir);
  const role = path.join(dir, "role");
  const outside = path.join(dir, "outside");
  fs.mkdirSync(role);
  fs.mkdirSync(outside);
  const victim = path.join(outside, "victim");
  fs.writeFileSync(victim, "the operator's\n");
  return { role, outside, victim };
}

/**
 * @param {string} dir
 * @returns {Record<string, string>} every file in it, by name
 */
function snapshot(dir) {
  return Object.fromEntries(
    fs.readdirSync(dir).map((name) => [name, fs.readFileSync(path.join(dir, name), "utf8")]),
  );
}

describe("openJailDir", () => {
  it("refuses a directory the jail replaced with a symlink", () => {
    const { role, outside } = tree();
    fs.symlinkSync(outside, path.join(role, "res"));

    expect(() => openJailDir(role, "res", { create: true })).toThrow();
    expect(snapshot(outside)).toEqual({ victim: "the operator's\n" });
  });

  it("refuses a file where a directory should be", () => {
    const { role } = tree();
    fs.writeFileSync(path.join(role, "res"), "");

    expect(() => openJailDir(role, "res")).toThrow();
  });

  it("makes what is missing, when asked to", () => {
    const { role } = tree();

    withJailDir(role, "res", { create: true }, (res) => {
      res.writeAtomic("1.json", "{}");
    });

    expect(fs.readFileSync(path.join(role, "res", "1.json"), "utf8")).toBe("{}");
  });

  it("refuses a name that is not one name", () => {
    const { role } = tree();
    const dir = openJailDir(role, "");
    try {
      for (const name of ["../x", "a/b", ".", "..", "", "x\n"]) {
        expect(() => {
          dir.writeAtomic(name, "y");
        }).toThrow(/refused name/);
      }
    } finally {
      dir.close();
    }
    expect(() => openJailDir(role, "../outside")).toThrow(/refused name/);
  });
});

describe("a JailDir", () => {
  it("replaces a symlink at the name it writes, and never writes through it", () => {
    const { role, outside, victim } = tree();
    fs.symlinkSync(victim, path.join(role, "1.json"));

    withJailDir(role, "", {}, (dir) => {
      dir.writeAtomic("1.json", "{}");
    });

    expect(snapshot(outside)).toEqual({ victim: "the operator's\n" });
    expect(fs.lstatSync(path.join(role, "1.json")).isFile()).toBe(true);
  });

  it("will not append through a symlink", () => {
    const { role, outside, victim } = tree();
    fs.symlinkSync(victim, path.join(role, "inbox.jsonl"));

    withJailDir(role, "", {}, (dir) => {
      expect(() => {
        dir.append("inbox.jsonl", "x\n");
      }).toThrow();
      expect(() => {
        dir.create("inbox.jsonl");
      }).toThrow();
    });
    expect(snapshot(outside)).toEqual({ victim: "the operator's\n" });
  });

  it("will not append to a hard link", () => {
    const { role, outside, victim } = tree();
    fs.linkSync(victim, path.join(role, "inbox.jsonl"));

    withJailDir(role, "", {}, (dir) => {
      expect(() => {
        dir.append("inbox.jsonl", "x\n");
      }).toThrow(/not a plain file/);
    });
    expect(snapshot(outside)).toEqual({ victim: "the operator's\n" });
  });

  it("neither blocks on nor appends to a FIFO", () => {
    const { role } = tree();
    const fifo = path.join(role, "inbox.jsonl");
    expect(spawnSync("mkfifo", [fifo]).status).toBe(0);

    withJailDir(role, "", {}, (dir) => {
      expect(() => {
        dir.append("inbox.jsonl", "x\n");
      }).toThrow();
      expect(() => dir.readSmall("inbox.jsonl", 100)).toThrow();
    });
  });

  it("appends to a plain file, and leaves one that exists alone", () => {
    const { role } = tree();

    withJailDir(role, "", {}, (dir) => {
      dir.create("inbox.jsonl");
      dir.append("inbox.jsonl", "a\n");
      dir.create("inbox.jsonl");
      dir.append("inbox.jsonl", "b\n");
    });

    expect(fs.readFileSync(path.join(role, "inbox.jsonl"), "utf8")).toBe("a\nb\n");
  });

  it("reads a small file, and refuses a symlink, a directory or one too big", () => {
    const { role, victim } = tree();
    fs.writeFileSync(path.join(role, "1.json"), '{"a":1}');
    fs.writeFileSync(path.join(role, "big.json"), "x".repeat(101));
    fs.symlinkSync(victim, path.join(role, "2.json"));
    fs.mkdirSync(path.join(role, "3.json"));

    withJailDir(role, "", {}, (dir) => {
      expect(dir.readSmall("1.json", 100)).toBe('{"a":1}');
      expect(() => dir.readSmall("big.json", 100)).toThrow(/over 100 bytes/);
      expect(() => dir.readSmall("2.json", 100)).toThrow();
      expect(() => dir.readSmall("3.json", 100)).toThrow();
    });
  });

  it("removes a symlink, not what it points to", () => {
    const { role, outside, victim } = tree();
    fs.symlinkSync(victim, path.join(role, "1.json"));

    withJailDir(role, "", {}, (dir) => {
      dir.remove("1.json");
      dir.remove("not-there.json");
    });

    expect(fs.existsSync(path.join(role, "1.json"))).toBe(false);
    expect(snapshot(outside)).toEqual({ victim: "the operator's\n" });
  });

  it("never writes outside while the jail swaps a directory for a symlink", async () => {
    const { role, outside } = tree();
    const res = path.join(role, "res");
    const swapper = spawn("sh", [
      "-c",
      `while :; do rm -rf "${res}"; mkdir "${res}" 2>/dev/null; rm -rf "${res}"; ln -s "${outside}" "${res}" 2>/dev/null; done`,
    ]);
    children.push(swapper);
    await new Promise((resolve) => setTimeout(resolve, 100));

    let wrote = 0;
    for (let i = 0; i < 1000; i += 1) {
      try {
        withJailDir(role, "res", { create: true }, (dir) => {
          dir.writeAtomic(`${String(i)}.json`, "{}");
        });
        wrote += 1;
      } catch {
        // Refused, or the directory went from under it: either is fine.
      }
    }
    swapper.kill("SIGKILL");

    expect(snapshot(outside)).toEqual({ victim: "the operator's\n" });
    // The race ran: some writes went through to a real directory.
    expect(wrote).toBeGreaterThan(0);
  }, 30_000);
});
