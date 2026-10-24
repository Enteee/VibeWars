/**
 * What main's workflows may do with the token GitHub hands them (#116).
 *
 * A workflow that can write checks or statuses can post a passing one for
 * any commit, under the same app as real CI, and the merge guard reads
 * checks. hubd keeps every role but cicd-engineer from pushing workflow
 * changes at all; this keeps the reviewed path honest too. Every workflow
 * declares its permissions at the top, so nothing runs with the
 * repository's default, and none grants `checks` or `statuses` write.
 *
 * Read as text, not parsed: a grant is a grant in any YAML style, and a
 * test that a clever indentation could slip past would be worse than none.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const WORKFLOWS = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  ".github",
  "workflows",
);

/** A `checks` or `statuses` write grant, either side quoted or not. */
const GRANT = /["']?\b(checks|statuses)["']?\s*:\s*["']?write\b/;

const files = fs
  .readdirSync(WORKFLOWS)
  .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"));

describe("workflow permissions", () => {
  it("finds the workflows", () => {
    expect(files).toContain("ci.yml");
  });

  it.each([
    "checks: write",
    'checks: "write"',
    "checks: 'write'",
    '"checks": write',
    "'statuses': 'write'",
    "{ contents: read, checks: write }",
  ])("sees the grant in %s", (line) => {
    expect(line).toMatch(GRANT);
  });

  it.each(["checks: read", 'statuses: "read"', "contents: write"])("lets %s through", (line) => {
    expect(line).not.toMatch(GRANT);
  });

  it.each(files)("%s declares its permissions and cannot write checks", (name) => {
    const text = fs.readFileSync(path.join(WORKFLOWS, name), "utf8");

    expect(text, "a top-level permissions: block").toMatch(/^permissions:/m);
    expect(text).not.toMatch(GRANT);
    expect(text).not.toMatch(/\bwrite-all\b/);
  });
});
