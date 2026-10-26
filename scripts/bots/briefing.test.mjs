/**
 * A role briefing's frontmatter (#322): the pure parse, and the CLI
 * claude-bot runs on a briefing file.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_MODEL, parseBriefing } from "./briefing.mjs";

const BRIEFING = path.join(path.dirname(fileURLToPath(import.meta.url)), "briefing.mjs");

/** @type {string[]} */
const dirs = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * @param {string} command
 * @param {string} text the briefing file's contents
 * @returns {{ code: number | null, stdout: string, stderr: string }}
 */
function briefing(command, text) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "briefing-test-"));
  dirs.push(dir);
  const file = path.join(dir, "manager.md");
  fs.writeFileSync(file, text);
  const result = spawnSync(process.execPath, [BRIEFING, command, file], { encoding: "utf8" });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe("parseBriefing", () => {
  it("without frontmatter: no model, and the body is the whole text", () => {
    const text = "# Role: developer-1\n\nYou are developer 1.\n";
    expect(parseBriefing(text)).toEqual({ model: undefined, body: text });
  });

  it("reads model from frontmatter, and the body loses the frontmatter", () => {
    const text = "---\nmodel: claude-sonnet-5-5\n---\n# Role: manager\n";
    expect(parseBriefing(text)).toEqual({ model: "claude-sonnet-5-5", body: "# Role: manager\n" });
  });

  it("ignores keys other than model", () => {
    const text = "---\nowner: operator\n---\n# Role: architect\n";
    expect(parseBriefing(text)).toEqual({ model: undefined, body: "# Role: architect\n" });
  });

  it("a --- anywhere but line 1 is just text", () => {
    const text = "# Role: lead-dev\n---\nmodel: claude-sonnet-5-5\n---\n";
    expect(parseBriefing(text)).toEqual({ model: undefined, body: text });
  });

  it("a --- on line 1 that never closes is just text", () => {
    const text = "---\nmodel: claude-sonnet-5-5\n# Role: manager\n";
    expect(parseBriefing(text)).toEqual({ model: undefined, body: text });
  });
});

describe("briefing.mjs", () => {
  it("prints the model a briefing names", () => {
    const result = briefing("model", "---\nmodel: claude-sonnet-5-5\n---\n# Role: manager\n");
    expect(result).toEqual({ code: 0, stdout: "claude-sonnet-5-5\n", stderr: "" });
  });

  it("prints claude-opus-5-5 for a briefing that names none", () => {
    expect(DEFAULT_MODEL).toBe("claude-opus-5-5");
    expect(briefing("model", "# Role: developer-1\n").stdout).toBe("claude-opus-5-5\n");
  });

  it.each(["claude-opus-5-5[1m]", "gpt-4", ""])("refuses %j with exit 2", (model) => {
    const result = briefing("model", `---\nmodel: ${model}\n---\n# Role: manager\n`);
    expect(result.code).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("claude-bot: manager.md: model must match claude-[a-z0-9-]+\n");
  });

  it("prints the body without its frontmatter", () => {
    const result = briefing("body", "---\nmodel: claude-sonnet-5-5\n---\n# Role: manager\n");
    expect(result).toEqual({ code: 0, stdout: "# Role: manager\n", stderr: "" });
  });

  it("refuses an unknown command with exit 2", () => {
    expect(briefing("models", "# Role: manager\n").code).toBe(2);
  });
});

describe("the briefings in .claude/bots (#735)", () => {
  const BOTS = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../.claude/bots");
  const briefs = fs.readdirSync(BOTS).filter((name) => name.endsWith(".md"));

  it("include every role and the protocol", () => {
    expect(briefs).toContain("_protocol.md");
    expect(briefs).toContain("developer-1.md");
  });

  // CI runs the suites (ci-is-truth): a brief, read every turn, never
  // tells an agent to run one locally.
  it.each(briefs)("%s names no suite command to run", (name) => {
    const text = fs.readFileSync(path.join(BOTS, name), "utf8");
    for (const command of ["pnpm run ci", "ci:full", "test:e2e"]) {
      expect(text, command).not.toContain(command);
    }
  });
});
