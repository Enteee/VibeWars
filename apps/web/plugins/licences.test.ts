import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { collectLicences, packageDirOf, repositoryUrl } from "./licences.js";

let root = "";

/** A package in a pnpm-shaped store under `root`, with `files` beside its manifest. */
function pkg(
  name: string,
  version: string,
  manifest: Record<string, unknown>,
  files: Record<string, string> = {},
): string {
  const dir = path.join(
    root,
    "node_modules",
    ".pnpm",
    `${name.replace("/", "+")}@${version}`,
    "node_modules",
    name,
  );
  mkdirSync(path.join(dir, "dist"), { recursive: true });
  writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name, version, ...manifest }));
  for (const [file, text] of Object.entries(files)) {
    writeFileSync(path.join(dir, file), text);
  }
  const entry = path.join(dir, "dist", "index.js");
  writeFileSync(entry, "export {};\n");
  return entry;
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "licences-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("collectLicences (#1242)", () => {
  it("lists each package once, by name, with its licence file verbatim", () => {
    const a = pkg(
      "zeta",
      "1.0.0",
      { license: "MIT", repository: "github:z/zeta" },
      { LICENSE: "Zeta licence\n" },
    );
    const b = pkg("@scope/alpha", "2.0.0", { license: "ISC" }, { "LICENCE.md": "Alpha licence" });
    const listed = collectLicences([a, `${a}?worker`, b, path.join(path.dirname(b), "other.js")]);
    expect(listed).toEqual([
      {
        name: "@scope/alpha",
        version: "2.0.0",
        spdx: "ISC",
        url: "https://www.npmjs.com/package/@scope/alpha",
        text: "Alpha licence",
      },
      {
        name: "zeta",
        version: "1.0.0",
        spdx: "MIT",
        url: "https://github.com/z/zeta",
        text: "Zeta licence",
      },
    ]);
  });

  it("keeps two versions of one package apart", () => {
    const one = pkg("tone", "4.0.0", { license: "MIT" }, { LICENSE: "four" });
    const two = pkg("tone", "5.0.0", { license: "MIT" }, { LICENSE: "five" });
    expect(collectLicences([one, two]).map((entry) => entry.version)).toEqual(["4.0.0", "5.0.0"]);
  });

  it("carries an Apache package's NOTICE after its LICENSE", () => {
    const entry = pkg(
      "midi",
      "3.0.0",
      { license: "Apache-2.0" },
      { LICENSE: "Apache text", NOTICE: "Copyright Midi" },
    );
    expect(collectLicences([entry])[0]?.text).toBe("Apache text\n\nCopyright Midi");
  });

  it("says so when a package ships no licence file, and does not fail", () => {
    const entry = pkg("bare", "1.0.0", { license: "MIT" });
    expect(collectLicences([entry])[0]?.text).toBe("MIT: licence file not shipped by the package.");
  });

  it("skips our own workspace packages, virtual modules and code outside node_modules", () => {
    const own = pkg("@vibewars/game-core", "0.0.0", { license: "AGPL-3.0-or-later" });
    expect(collectLicences([own, "\0vite/preload-helper", "/repo/apps/web/src/main.ts"])).toEqual(
      [],
    );
  });

  it("fails the build on a licence nobody has read yet, naming the package", () => {
    const gpl = pkg("copyleft", "1.0.0", { license: "GPL-2.0" });
    expect(() => collectLicences([gpl])).toThrow(/copyleft@1\.0\.0 .*"GPL-2\.0"/);
    const none = pkg("silent", "1.0.0", {});
    expect(() => collectLicences([none])).toThrow(/silent@1\.0\.0/);
  });
});

describe("packageDirOf and repositoryUrl (#1242)", () => {
  it("finds the innermost package, scoped or not", () => {
    expect(packageDirOf("/r/node_modules/.pnpm/a@1/node_modules/@s/b/dist/x.js")).toBe(
      "/r/node_modules/.pnpm/a@1/node_modules/@s/b",
    );
    expect(packageDirOf("/r/node_modules/phaser/dist/phaser.esm.js")).toBe(
      "/r/node_modules/phaser",
    );
  });

  it("turns every repository form into a browsable https URL", () => {
    expect(repositoryUrl({ type: "git", url: "git+https://github.com/a/b.git" })).toBe(
      "https://github.com/a/b",
    );
    expect(repositoryUrl("https://phaserjs@github.com/phaserjs/phaser.git")).toBe(
      "https://github.com/phaserjs/phaser",
    );
    expect(repositoryUrl("git@github.com:a/b.git")).toBe("https://github.com/a/b");
    expect(repositoryUrl("http://github.com/estools/escodegen")).toBe(
      "https://github.com/estools/escodegen",
    );
    expect(repositoryUrl("a/b")).toBe("https://github.com/a/b");
    expect(repositoryUrl(undefined)).toBeUndefined();
  });
});
