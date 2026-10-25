import { describe, expect, it } from "vitest";

import { addedPackages, packagesOf, tooYoung } from "./lockfile-age.mjs";

const base = `lockfileVersion: '9.0'

importers:
  .:
    dependencies:
      a:
        version: 1.0.0

packages:

  '@scope/b@2.0.0':
    resolution: {integrity: x}

  a@1.0.0:
    resolution: {integrity: y}

snapshots:

  a@1.0.0: {}
`;
const head = base.replace(
  "snapshots:",
  "  c@3.1.0-beta.1:\n    resolution: {integrity: z}\n\n  '@scope/d@0.0.1':\n    resolution: {integrity: w}\n\nsnapshots:",
);

describe("lockfile age check", () => {
  it("reads name@version keys from packages: only", () => {
    expect([...packagesOf(base)].sort()).toEqual(["@scope/b@2.0.0", "a@1.0.0"]);
  });

  it("finds what the head lockfile adds", () => {
    expect(addedPackages(base, head)).toEqual(["@scope/d@0.0.1", "c@3.1.0-beta.1"]);
  });

  it("flags young and unknown versions, passes old ones", async () => {
    const now = new Date("2026-10-25T00:00:00Z");
    /** @type {Record<string, string>} */
    const dates = {
      "a@1.0.0": "2026-10-20T00:00:00Z",
      "@scope/b@2.0.0": "2026-10-10T00:00:00Z",
    };
    const problems = await tooYoung(
      ["a@1.0.0", "@scope/b@2.0.0", "c@1.0.0"],
      (name, version) => Promise.resolve(dates[`${name}@${version}`]),
      now,
    );
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain("a@1.0.0");
    expect(problems[1]).toContain("c@1.0.0");
  });
});

describe("exotic resolutions", () => {
  it("fails a git or tarball entry added to the lockfile", async () => {
    const withUrl = `${base}\n`.replace(
      "snapshots:",
      "  u@https://codeload.github.com/o/u/tar.gz/abc123:\n    resolution: {gitHosted: true}\n\nsnapshots:",
    );
    const added = addedPackages(base, withUrl);
    expect(added).toEqual(["u@https://codeload.github.com/o/u/tar.gz/abc123"]);
    const problems = await tooYoung(
      added,
      () => Promise.resolve("2020-01-01T00:00:00Z"),
      new Date(),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("blockExoticSubdeps");
  });
});
