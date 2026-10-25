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
