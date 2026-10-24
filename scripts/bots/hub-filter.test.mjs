/**
 * Splitting output filters off a gh command line (#32 review). Both hub and
 * hubd use this, so a filter hub misses is one hubd would run on the host.
 */
import { describe, expect, it } from "vitest";

import { hasFilter, splitFilter } from "./hub-filter.mjs";

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
});
