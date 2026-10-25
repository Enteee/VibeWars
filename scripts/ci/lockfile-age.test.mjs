import { describe, expect, it } from "vitest";

import { diffPackages, packagesOf, tooYoung } from "./lockfile-age.mjs";

const base = `lockfileVersion: '9.0'

importers:
  .:
    dependencies:
      a:
        version: 1.0.0

packages:

  '@scope/b@2.0.0':
    resolution: {integrity: sha512-b}

  a@1.0.0:
    resolution: {integrity: sha512-a}

snapshots:

  a@1.0.0: {}
`;

/**
 * @param {string} lockfile
 * @param {string} entries
 */
const withEntries = (lockfile, entries) => lockfile.replace("snapshots:", `${entries}\nsnapshots:`);

describe("lockfile age check", () => {
  it("reads each packages: entry with its resolution, and nothing else", () => {
    expect([...packagesOf(base)]).toEqual([
      ["@scope/b@2.0.0", "resolution: {integrity: sha512-b}"],
      ["a@1.0.0", "resolution: {integrity: sha512-a}"],
    ]);
  });

  it("finds what the head lockfile adds", () => {
    const head = withEntries(
      base,
      "  c@3.1.0-beta.1:\n    resolution: {integrity: sha512-c}\n\n  '@scope/d@0.0.1':\n    resolution: {integrity: sha512-d}\n",
    );
    expect(diffPackages(base, head)).toEqual({
      added: ["@scope/d@0.0.1", "c@3.1.0-beta.1"],
      problems: [],
    });
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
  it("fails a git or tarball entry added to the lockfile", () => {
    const head = withEntries(
      base,
      "  u@https://codeload.github.com/o/u/tar.gz/abc123:\n    resolution: {gitHosted: true, tarball: https://codeload.github.com/o/u/tar.gz/abc123}\n",
    );
    const { problems } = diffPackages(base, head);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("blockExoticSubdeps");
  });

  it("fails an existing key whose resolution is rewritten to a tarball", () => {
    const head = base.replace(
      "{integrity: sha512-a}",
      "{integrity: sha512-evil, tarball: https://evil.example/a.tgz}",
    );
    const { added, problems } = diffPackages(base, head);
    expect(added).toEqual([]);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain("resolution changed");
    expect(problems[1]).toContain("tarball");
  });

  it("fails an existing key whose integrity is swapped", () => {
    const head = base.replace("sha512-a", "sha512-other");
    expect(diffPackages(base, head).problems).toHaveLength(1);
  });

  it("passes an exotic entry that is identical to the base", () => {
    const exotic = withEntries(
      base,
      "  u@https://x.example/u.tgz:\n    resolution: {tarball: https://x.example/u.tgz}\n",
    );
    expect(diffPackages(exotic, exotic)).toEqual({ added: [], problems: [] });
  });

  it("fails closed on a key line it cannot parse", () => {
    expect(() => packagesOf(withEntries(base, "  weird key:\n"))).toThrow("cannot parse");
  });
});
