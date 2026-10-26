/**
 * The suite guard (#737): which Bash commands each role may run, and the
 * hook's CLI as the jail calls it.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { DENY_REASON, suiteGuard } from "./suite-guard.mjs";

const GUARD = path.join(path.dirname(fileURLToPath(import.meta.url)), "suite-guard.mjs");

describe("suiteGuard for a developer", () => {
  it.each([
    // The command that started it, on 2026-10-26.
    "timeout 590 npx playwright test --reporter=line --workers=4",
    "npx playwright test e2e/training.spec.ts -g '#721'",
    "pnpm exec playwright test",
    "npm exec playwright test",
    "pnpm run test:e2e",
    "pnpm run ci",
    "pnpm -s run ci",
    "pnpm run ci:full",
    "pnpm test",
    "pnpm run test",
    "npm test",
    "npx vitest run",
    "npx vitest",
    "pnpm vitest run --reporter=dot",
    "pnpm --filter @vibewars/web exec vitest run",
    "cd apps/web && npx vitest run",
    "VIBEWARS_E2E_PORT=2591 VIBEWARS_CHROMIUM=/nix/x npx playwright test",
    "git fetch -q && timeout 300 pnpm run ci > /tmp/ci.log 2>&1; echo rc=$?",
    "(cd apps/web && npx vitest run)",
    "echo $(pnpm run ci)",
  ])("denies %j", (command) => {
    expect(suiteGuard(command, "developer-1")).toBe("deny");
  });

  it.each([
    "pnpm run dev",
    "pnpm dev",
    "pnpm -s run typecheck",
    "pnpm run lint",
    "pnpm run format",
    "pnpm run build",
    "npx vitest run scripts/bots/suite-guard.test.mjs",
    "cd apps/web && timeout 200 npx vitest run src/render/camera-rig.test.ts",
    "pnpm run test -- apps/web/src/render/camera-rig.test.ts",
    "npx tsc --build tsconfig.build.json",
    'git commit -m "local pnpm run ci passes"',
    "cat > /tmp/pr.md <<'EOF'\nRan `pnpm run ci` locally.\nnpx playwright test\nEOF\nhub pr create --body-file /tmp/pr.md",
    "grep -rn 'test:e2e' .claude/bots",
    "node scripts/p2p-smoke.mjs",
  ])("allows %j", (command) => {
    expect(suiteGuard(command, "developer-1")).toBe("allow");
  });

  it("holds for every role but qa-tester and cicd-engineer", () => {
    for (const role of ["developer-2", "asset-designer", "manager", "lead-dev", "perf-sec-qa"]) {
      expect(suiteGuard("pnpm run ci", role), role).toBe("deny");
      expect(suiteGuard("npx vitest run apps/web/src/x.test.ts", role), role).toBe("allow");
    }
  });
});

describe("suiteGuard for qa-tester", () => {
  it.each([
    "npx playwright test e2e/training.spec.ts",
    "npx playwright test e2e/builds.spec.ts -g '#710' --repeat-each=10",
    "pnpm run test:e2e -- e2e/builds.spec.ts",
    "npx vitest run apps/web/src/render/camera-rig.test.ts",
  ])("allows the selected %j", (command) => {
    expect(suiteGuard(command, "qa-tester")).toBe("allow");
  });

  it.each([
    "npx playwright test",
    "npx playwright test --workers=4 -g '#710'",
    "pnpm run test:e2e",
    "pnpm run ci",
    "pnpm run ci:full",
    "npx vitest run",
  ])("denies the unfiltered %j", (command) => {
    expect(suiteGuard(command, "qa-tester")).toBe("deny");
  });
});

describe("suiteGuard for anyone else", () => {
  it("leaves cicd-engineer unrestricted", () => {
    expect(suiteGuard("pnpm run ci:full", "cicd-engineer")).toBe("allow");
    expect(suiteGuard("npx playwright test", "cicd-engineer")).toBe("allow");
  });

  it("allows an unknown or missing role", () => {
    expect(suiteGuard("pnpm run ci", undefined)).toBe("allow");
    expect(suiteGuard("pnpm run ci", "intern")).toBe("allow");
  });
});

/**
 * @param {string} stdin
 * @param {string | undefined} role
 */
function hook(stdin, role) {
  const env = { ...process.env };
  delete env.VIBEWARS_BOT_ROLE;
  const result = spawnSync(process.execPath, [GUARD], {
    input: stdin,
    encoding: "utf8",
    env: role === undefined ? env : { ...env, VIBEWARS_BOT_ROLE: role },
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe("the hook CLI", () => {
  /** @param {string} command */
  const bash = (command) => JSON.stringify({ tool_name: "Bash", tool_input: { command } });

  it("denies with the documented hook output, exit 0", () => {
    const result = hook(bash("pnpm run ci"), "developer-1");
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: DENY_REASON,
      },
    });
  });

  it("allows with no output", () => {
    expect(hook(bash("pnpm run lint"), "developer-1")).toEqual({ code: 0, stdout: "", stderr: "" });
  });

  it("allows what it cannot parse", () => {
    expect(hook("not json", "developer-1")).toEqual({ code: 0, stdout: "", stderr: "" });
  });

  it("allows an unknown role, and says so on stderr", () => {
    const result = hook(bash("pnpm run ci"), undefined);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe('suite-guard: unknown role "", allowing\n');
  });
});
