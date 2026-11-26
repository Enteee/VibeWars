/**
 * Splitting output filters off a gh command line (#32 review). Both hub and
 * hubd use this, so a filter hub misses is one hubd would run on the host.
 */
import { describe, expect, it } from "vitest";

import { hasFilter, shortFlag, splitFilter } from "./hub-filter.mjs";

describe("splitFilter", () => {
  it("takes --jq and -q off, in both spellings", () => {
    for (const argv of [
      ["issue", "view", "1", "--json", "body", "--jq", ".body"],
      ["issue", "view", "1", "--json", "body", "-q", ".body"],
      ["issue", "view", "1", "--json", "body", "--jq=.body"],
    ]) {
      expect(splitFilter(argv), argv.join(" ")).toEqual({
        argv: ["issue", "view", "1", "--json", "body"],
        jq: ".body",
        template: null,
      });
    }
  });

  it("takes --template and -t off a read", () => {
    expect(splitFilter(["pr", "list", "--json", "number", "-t", "{{.}}"])).toEqual({
      argv: ["pr", "list", "--json", "number"],
      jq: null,
      template: "{{.}}",
    });
  });

  it("leaves -t and --template alone where they mean a title or an issue template", () => {
    const create = ["pr", "create", "-t", "Fix it", "--body", "b"];
    expect(splitFilter(create)).toEqual({ argv: create, jq: null, template: null });
    const fromTemplate = ["issue", "create", "--template", "bug_report.md"];
    expect(hasFilter(fromTemplate)).toBe(false);
    expect(hasFilter(["issue", "edit", "1", "-t", "New title"])).toBe(false);
  });

  it("does not mistake a value that looks like a flag for one", () => {
    // The body text "--jq" is a value, consumed with its flag.
    expect(hasFilter(["issue", "comment", "1", "--body", "use --jq here"])).toBe(false);
  });

  it("treats a filter flag with no value as a filter, so hubd refuses it", () => {
    expect(hasFilter(["issue", "view", "1", "--jq"])).toBe(true);
  });

  it("catches a filter glued to its short flag, as gh's parser accepts it", () => {
    // Found in review of #32: each of these ran on the host as a filter.
    for (const [word, value] of [
      ["-q$ENV", "$ENV"],
      ["-q.[0]", ".[0]"],
      ["-q=.x", ".x"],
    ]) {
      const split = splitFilter(["issue", "view", "1", "--json", "title", word]);
      expect(split, word).toEqual({
        argv: ["issue", "view", "1", "--json", "title"],
        jq: value,
        template: null,
      });
    }
    expect(splitFilter(["pr", "view", "1", "-t{{.title}}"])).toMatchObject({
      template: "{{.title}}",
    });
  });

  it("catches a filter at the end of a cluster of short flags, keeping the others", () => {
    expect(splitFilter(["issue", "view", "1", "-cq.body"])).toEqual({
      argv: ["issue", "view", "1", "-c"],
      jq: ".body",
      template: null,
    });
    expect(splitFilter(["issue", "view", "1", "-cq", ".body"])).toEqual({
      argv: ["issue", "view", "1", "-c"],
      jq: ".body",
      template: null,
    });
  });

  it("leaves short flags that are not filters, and their glued values, alone", () => {
    expect(hasFilter(["issue", "list", "-L5"])).toBe(false);
    expect(hasFilter(["issue", "list", "-s", "closed"])).toBe(false);
    // Not a letter after the dash: a value, not flags.
    expect(hasFilter(["issue", "comment", "1", "--body", "-1, not convinced"])).toBe(false);
  });

  it("still reads -t as a title on create and edit, glued or not", () => {
    expect(hasFilter(["pr", "create", "-tFix it"])).toBe(false);
    expect(hasFilter(["issue", "edit", "1", "-t", "x"])).toBe(false);
    // ...but -q is a filter everywhere.
    expect(hasFilter(["pr", "create", "-q.url"])).toBe(true);
  });
});

describe("shortFlag", () => {
  it("reads a cluster the way gh's flag parser does", () => {
    const wanted = (/** @type {string} */ letter) => letter === "F";
    expect(shortFlag("-F", wanted)).toEqual({ letter: "F", glued: null, at: 1 });
    expect(shortFlag("-Fx", wanted)).toEqual({ letter: "F", glued: "x", at: 1 });
    expect(shortFlag("-eF/etc/passwd", wanted)).toEqual({
      letter: "F",
      glued: "/etc/passwd",
      at: 2,
    });
    expect(shortFlag("-eF=x", wanted)).toEqual({ letter: "F", glued: "x", at: 2 });
    expect(shortFlag("-e", wanted)).toBeNull();
    // After a non-letter the rest is a glued value, not more flags.
    expect(shortFlag("-e1F", wanted)).toBeNull();
    expect(shortFlag("--F", wanted)).toBeNull();
  });
});
