import { describe, expect, it } from "vitest";

import {
  COOLDOWN_MS,
  DRAIN_MS,
  INFLIGHT_GRACE_MS,
  drainStep,
  fastForwardDecision,
  isCompanyPath,
  rebootAllowed,
} from "./reboot.mjs";

const NOW = 1_800_000_000_000;

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
    idle: {},
    inflight: 0,
    drainedAt: null,
  };

  it("waits while a running agent is neither ready nor idle", () => {
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

  it("counts an agent idle for two samples as ready", () => {
    expect(drainStep({ ...base, idle: { "developer-1": 1 } }).stop).toBe(false);
    expect(drainStep({ ...base, idle: { "developer-1": 2 } }).stop).toBe(true);
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
