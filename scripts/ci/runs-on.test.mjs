/**
 * Which workflow jobs may run on a company runner (#1891, ADR-0045).
 *
 * The bulk-minute jobs pick their runner with one expression; everything
 * else stays on GitHub's hosted runners. The expression is an event
 * allowlist, so a trigger nobody thought of runs hosted. A job that holds a
 * secret or a write permission never takes it. Read as text, like
 * workflow-permissions.test.mjs: a grant is a grant in any YAML style.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORKFLOWS = path.join(ROOT, ".github", "workflows");

const CANONICAL =
  "runs-on: ${{ (vars.COMPANY_RUNNERS == '1' && (github.event_name == 'push' || github.event_name == 'schedule' || github.event_name == 'workflow_dispatch' || (github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository))) && fromJSON('[\"self-hosted\",\"vibewars-company\"]') || 'ubuntu-latest' }}";

/** Security tooling and deploys stay on clean hosts. */
const HOSTED_ONLY = ["codeql.yml", "dependency-review.yml", "audit.yml", "pages.yml", "ci.yml"];

const files = fs.readdirSync(WORKFLOWS).filter((n) => n.endsWith(".yml") || n.endsWith(".yaml"));

/** The text before `jobs:` and each job's block, keyed by job id. */
/**
 * @param {string} text
 * @returns {{ head: string, jobs: Record<string, string> }}
 */
function split(text) {
  const at = text.search(/^jobs:\s*$/m);
  const head = text.slice(0, at);
  const body = text.slice(at).replace(/^jobs:\s*\n/, "");
  /** @type {Record<string, string>} */
  const jobs = {};
  const parts = body.split(/^ {2}([\w-]+):\s*$/m);
  for (let i = 1; i < parts.length; i += 2) jobs[String(parts[i])] = String(parts[i + 1]);
  return { head, jobs };
}

/**
 * The indented lines under a top-level or job-level `permissions:` key.
 * @param {string} text
 * @param {string} indent
 * @returns {string | null}
 */
function permissionLines(text, indent) {
  const m = new RegExp(`^${indent}permissions:(.*)\\n((?:${indent} +.*\\n?)*)`, "m").exec(text);
  return m ? `${m[1] ?? ""}\n${m[2] ?? ""}` : null;
}

/** Every permission is read or none; anything else could write. */
/** @param {string | null} perms */
function readOnly(perms) {
  if (perms === null) return false;
  if (/\bwrite/.test(perms)) return false;
  const scopes = perms.split("\n").flatMap((l) => (l.includes(":") ? [l] : []));
  return scopes.every(
    (l) => /:\s*["']?(read|none)\b/.test(l) || /:\s*\{\s*\}/.test(l) || /permissions:\s*$/.test(l),
  );
}

const workflows = Object.fromEntries(
  files.map((name) => [name, split(fs.readFileSync(path.join(WORKFLOWS, name), "utf8"))]),
);

/** @type {[string, string, string][]} */
const eligible = [];
for (const [name, { jobs }] of Object.entries(workflows)) {
  for (const [id, block] of Object.entries(jobs)) {
    if (block.includes("vibewars-company")) eligible.push([name, id, block]);
  }
}

describe("company runner selection", () => {
  it("finds the jobs that use it", () => {
    expect(eligible.map(([n, id]) => `${n}:${id}`).sort()).toEqual([
      "e2e-repeat.yml:e2e-repeat",
      "e2e-soak.yml:soak",
      "music-measure.yml:measure",
    ]);
  });

  it.each(eligible)("%s %s uses exactly the canonical expression", (_n, _id, block) => {
    const line = block.split("\n").find((l) => l.trim().startsWith("runs-on:"));
    expect(line.trim()).toBe(CANONICAL);
  });

  it.each(eligible)("%s %s holds no secret and no write permission", (name, id, block) => {
    const head = workflows[name]?.head ?? "";
    const jobPerms = permissionLines(block, "    ");
    const effective = jobPerms ?? permissionLines(head, "");
    expect(readOnly(effective), "explicit read-only permissions").toBe(true);
    expect(block).not.toMatch(/\bsecrets\b/);
    expect(head).not.toMatch(/\bsecrets\b/);
    expect(block).not.toMatch(/^\s+uses:\s+\S+\.ya?ml/m);
    expect(block).not.toMatch(/id-token/);
  });

  it.each(HOSTED_ONLY)("%s never uses a company runner", (name) => {
    expect(files).toContain(name);
    expect(fs.readFileSync(path.join(WORKFLOWS, name), "utf8")).not.toContain("vibewars-company");
  });

  it("names exactly the events the job-started hook allows", () => {
    /** @type {unknown} */
    const raw = JSON.parse(
      fs.readFileSync(path.join(ROOT, "scripts", "bots", "runner-events.json"), "utf8"),
    );
    const events = /** @type {{ any: string[], sameRepository: string[] }} */ (raw);
    const allowed = [...events.any, ...events.sameRepository].sort();
    const named = [
      ...new Set([...CANONICAL.matchAll(/github\.event_name == '(\w+)'/g)].map((m) => m[1])),
    ].sort();
    expect(named).toEqual(allowed);
  });

  it.each([
    ["no permissions", null, false],
    ["write-all", " write-all\n", false],
    ["contents write", "\n      contents: write\n", false],
    ["id-token write", "\n      id-token: write\n", false],
    ["contents read", "\n  contents: read\n", true],
  ])("readOnly judges %s", (_label, perms, ok) => {
    expect(readOnly(perms)).toBe(ok);
  });
});
