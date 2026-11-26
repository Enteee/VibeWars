/**
 * hub reads --body-file in the sandbox and sends --body (#26, item 2), so
 * agents keep the convenience while gh on the host never reads a path.
 */
import { describe, expect, it } from "vitest";

import { inlineBodyFile } from "./hub-body.mjs";

/** @param {string} path */
const read = (path) => `contents of ${path}`;

describe("inlineBodyFile", () => {
  it("turns every spelling of the file flag into --body with the contents", () => {
    for (const argv of [
      ["pr", "create", "--title", "t", "--body-file", "pr.md"],
      ["pr", "create", "--title", "t", "--body-file=pr.md"],
      ["pr", "create", "--title", "t", "-F", "pr.md"],
      ["pr", "create", "--title", "t", "-Fpr.md"],
    ]) {
      expect(inlineBodyFile(argv, read), argv.join(" ")).toEqual({
        argv: ["pr", "create", "--title", "t", "--body", "contents of pr.md"],
      });
    }
  });

  it("uses --notes for a release", () => {
    expect(inlineBodyFile(["release", "create", "v1", "--notes-file", "n.md"], read)).toEqual({
      argv: ["release", "create", "v1", "--notes", "contents of n.md"],
    });
  });

  it("leaves commands that take no body file alone", () => {
    const argv = ["issue", "view", "1", "-F"];
    expect(inlineBodyFile(argv, read)).toEqual({ argv });
  });

  it("says what went wrong when the file cannot be read", () => {
    const missing = () => {
      throw new Error("ENOENT");
    };
    expect(inlineBodyFile(["issue", "comment", "1", "-F", "x.md"], missing)).toEqual({
      error: "could not read x.md: ENOENT",
    });
    const result = inlineBodyFile(["issue", "comment", "1", "--body-file"], read);
    expect("error" in result && result.error).toMatch(/needs a file/);
  });
});
