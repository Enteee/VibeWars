import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  COOLDOWN_MS,
  DRAIN_MS,
  INFLIGHT_GRACE_MS,
  betweenTurns,
  bootNote,
  drainStep,
  fastForwardDecision,
  parseReboot,
  isCompanyPath,
  isStagedScript,
  rebootAllowed,
  scriptDrift,
} from "./reboot.mjs";

const NOW = 1_800_000_000_000;

/** @type {string[]} */
const dirs = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("isCompanyPath", () => {
  it("is the code a reboot loads, and nothing else", () => {
    for (const file of [
      "scripts/bots/hubd.mjs",
      "nix/claude-llc.nix",
      "nix/claude-bot.nix",
      ".claude/bots/manager.md",
      "devenv.nix",
    ]) {
      expect(isCompanyPath(file), file).toBe(true);
    }
    for (const file of ["apps/web/src/main.ts", "nix/other.nix", "README.md", "scripts/x.mjs"]) {
      expect(isCompanyPath(file), file).toBe(false);
    }
  });
});

describe("rebootAllowed", () => {
  const base = {
    bootSha: "abc12345def",
    changedPaths: ["scripts/bots/hubd.mjs", "apps/web/src/main.ts"],
    lastRebootAt: NOW - COOLDOWN_MS,
    now: NOW,
    pending: null,
  };

  it("allows a reboot that loads new company code", () => {
    expect(rebootAllowed(base)).toEqual({ ok: true });
  });

  it("refuses when main changed no company code", () => {
    const answer = rebootAllowed({ ...base, changedPaths: ["apps/web/src/main.ts"] });
    expect(answer).toMatchObject({ ok: false });
    expect("reason" in answer ? answer.reason : "").toMatch(/not a way to unstick agents/);
  });

  it("refuses inside the cooldown", () => {
    expect(rebootAllowed({ ...base, lastRebootAt: NOW - COOLDOWN_MS + 1 })).toMatchObject({
      ok: false,
    });
  });

  it("refuses a second request while one is pending", () => {
    const pending = {
      requestedAt: NOW - 1000,
      reason: "x",
      by: "manager",
      deadline: NOW + DRAIN_MS,
      bootSha: "abc",
      ready: [],
    };
    const answer = rebootAllowed({ ...base, pending });
    expect("reason" in answer ? answer.reason : "").toMatch(/already scheduled for \d\d:\d\d/);
  });

  it("refuses when it cannot tell what changed, or when the boot is unknown", () => {
    expect(rebootAllowed({ ...base, changedPaths: null })).toMatchObject({ ok: false });
    expect(rebootAllowed({ ...base, bootSha: null })).toMatchObject({ ok: false });
    expect(rebootAllowed({ ...base, lastRebootAt: null })).toMatchObject({ ok: false });
  });
});

describe("drainStep", () => {
  const reboot = {
    requestedAt: NOW,
    reason: "x",
    by: "manager",
    deadline: NOW + DRAIN_MS,
    bootSha: "abc",
    ready: ["manager"],
  };
  const base = {
    now: NOW + 60_000,
    reboot,
    running: ["manager", "developer-1"],
    between: [],
    inflight: 0,
    drainedAt: null,
  };

  it("waits while a running agent is neither ready nor between turns", () => {
    expect(drainStep(base)).toEqual({ stop: false, drainedAt: null });
  });

  it("stops once everyone is ready", () => {
    expect(
      drainStep({ ...base, reboot: { ...reboot, ready: ["manager", "developer-1"] } }),
    ).toEqual({
      stop: true,
      drainedAt: base.now,
    });
  });

  it("counts an agent between turns as ready", () => {
    expect(drainStep({ ...base, between: ["developer-1"] }).stop).toBe(true);
    expect(drainStep({ ...base, between: ["architect"] }).stop).toBe(false);
  });

  it("waits for each employee of a role, not for the role (#62)", () => {
    const two = { ...base, running: ["manager", "developer-1", "developer-1@2"] };
    const one = { ...reboot, ready: ["manager", "developer-1"] };
    expect(drainStep({ ...two, reboot: one }).stop).toBe(false);
    expect(drainStep({ ...two, reboot: one, between: ["developer-1@2"] }).stop).toBe(true);
  });

  it("stops at the deadline whoever is still busy", () => {
    expect(drainStep({ ...base, now: reboot.deadline }).stop).toBe(true);
  });

  it("waits for a request in flight, but only for the grace period", () => {
    const drained = {
      ...base,
      reboot: { ...reboot, ready: ["manager", "developer-1"] },
      inflight: 1,
    };
    expect(drainStep(drained)).toEqual({ stop: false, drainedAt: base.now });
    expect(drainStep({ ...drained, drainedAt: base.now, now: base.now + 1000 }).stop).toBe(false);
    expect(
      drainStep({ ...drained, drainedAt: base.now, now: base.now + INFLIGHT_GRACE_MS }).stop,
    ).toBe(true);
    expect(drainStep({ ...drained, drainedAt: base.now, inflight: 0 }).stop).toBe(true);
  });
});

describe("fastForwardDecision", () => {
  it("updates only a clean main that fast-forwards", () => {
    expect(fastForwardDecision({ branch: "main", dirty: false, fastForward: true })).toEqual({
      update: true,
    });
  });

  it("never touches a checkout on another branch, with changes, or diverged", () => {
    expect(fastForwardDecision({ branch: "feature", dirty: false, fastForward: true })).toEqual({
      update: false,
      reason: "checkout is on branch feature",
    });
    expect(fastForwardDecision({ branch: null, dirty: false, fastForward: true })).toEqual({
      update: false,
      reason: "checkout is on a detached HEAD",
    });
    expect(fastForwardDecision({ branch: "main", dirty: true, fastForward: true })).toEqual({
      update: false,
      reason: "checkout has local changes",
    });
    expect(fastForwardDecision({ branch: "main", dirty: false, fastForward: false })).toMatchObject(
      { update: false },
    );
  });
});

describe("parseReboot", () => {
  it("reads a record, and rejects anything else", () => {
    const record = {
      requestedAt: 1,
      reason: "x",
      by: "manager",
      deadline: 2,
      bootSha: "abc",
      ready: ["qa-tester"],
    };
    expect(parseReboot(record)).toEqual(record);
    expect(parseReboot({ ...record, ready: [1] })).toBeNull();
    expect(parseReboot({ ...record, deadline: "2" })).toBeNull();
    expect(parseReboot(null)).toBeNull();
  });
});

describe("isStagedScript", () => {
  it("is what nix copies into the store: .mjs files, not their tests", () => {
    expect(isStagedScript("hubd.mjs")).toBe(true);
    expect(isStagedScript("hubd.test.mjs")).toBe(false);
    expect(isStagedScript("README.md")).toBe(false);
  });
});

describe("scriptDrift", () => {
  it("is empty when the running copy is the checkout's", () => {
    const scripts = { "hubd.mjs": "a", "reboot.mjs": "b" };
    expect(scriptDrift(scripts, { ...scripts })).toEqual([]);
  });

  it("names changed, added and removed scripts, sorted", () => {
    expect(
      scriptDrift(
        { "hubd.mjs": "new", "hub-spend.mjs": "x", "same.mjs": "s" },
        { "hubd.mjs": "old", "gone.mjs": "y", "same.mjs": "s" },
      ),
    ).toEqual(["gone.mjs", "hub-spend.mjs", "hubd.mjs"]);
  });

  it("ignores tests and other files, which never run", () => {
    expect(
      scriptDrift({ "hubd.test.mjs": "new", "notes.md": "a" }, { "hubd.test.mjs": "old" }),
    ).toEqual([]);
  });
});

describe("bootNote", () => {
  const sha = "0123456789abcdef0123456789abcdef01234567";
  const running = "/nix/store/x-vibewars-llc-scripts";

  it("leaves the note alone when the scripts are the checkout's", () => {
    expect(bootNote({ note: "Rebooted onto 01234567: x.", sha, drift: [], running })).toBe(
      "Rebooted onto 01234567: x.",
    );
    expect(bootNote({ note: null, sha, drift: [], running })).toBeNull();
  });

  it("withdraws a reboot's claim to have loaded the new commit", () => {
    const note = bootNote({
      note: "Rebooted onto 01234567: company: a new thing.",
      sha,
      drift: ["hubd.mjs"],
      running,
    });
    expect(note).not.toMatch(/Rebooted onto/);
    expect(note).toMatch(/^Rebooted, but its company code did NOT load\. WARNING/);
    expect(note).toMatch(/NOT running the checkout's scripts \(01234567\): hubd\.mjs differs from/);
    expect(note).toContain(running);
    expect(note).toContain("devenv shell --refresh-eval-cache -- claude-llc");
  });

  it("keeps a reboot's own reason for not updating, and adds the warning", () => {
    const note = bootNote({
      note: "Rebooted, but NOT updated: checkout has local changes.",
      sha,
      drift: ["hubd.mjs"],
      running,
    });
    expect(note).toMatch(/^Rebooted, but NOT updated: checkout has local changes\. WARNING/);
  });

  it("warns on a plain start too, which has no note of its own", () => {
    expect(bootNote({ note: null, sha, drift: ["hubd.mjs"], running })).toMatch(/^WARNING/);
  });

  it("names a few scripts and counts the rest", () => {
    const drift = ["a.mjs", "b.mjs", "c.mjs", "d.mjs", "e.mjs", "f.mjs", "g.mjs"];
    expect(bootNote({ note: null, sha, drift, running })).toContain(
      "a.mjs, b.mjs, c.mjs, d.mjs, e.mjs and 2 more differ",
    );
  });
});

describe("betweenTurns", () => {
  it("is the employees whose loop has written its marker, and no others", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "reboot-test-"));
    dirs.push(root);
    fs.mkdirSync(path.join(root, "agents", "manager"), { recursive: true });
    fs.writeFileSync(path.join(root, "agents", "manager", "between-turns"), "");
    // In a turn: the state directory and its session, but no marker.
    fs.mkdirSync(path.join(root, "agents", "architect"), { recursive: true });
    fs.writeFileSync(path.join(root, "agents", "architect", "session-id"), "abc\n");

    fs.mkdirSync(path.join(root, "agents", "architect@2"), { recursive: true });
    fs.writeFileSync(path.join(root, "agents", "architect@2", "between-turns"), "");

    expect(betweenTurns(root, ["manager", "architect", "architect@2", "developer-1"])).toEqual([
      "manager",
      "architect@2",
    ]);
  });
});
