import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import type { Plugin } from "vite";

import { LICENCES_FILE, type BundledLicence } from "../src/ui/licences-file.js";

/**
 * The npm packages whose code is in the built client, each with its licence
 * text (#1242, ADR-0039): written to `licences.json` at build, for Options →
 * Third-party licences. Generated, never hand-kept, so a new dependency is
 * listed the day it ships.
 */

/**
 * The licences a bundled package may carry. Anything else, or none, fails
 * the build, so a person reads a new dependency's terms before it ships.
 */
export const ALLOWED_LICENCES: readonly string[] = [
  "MIT",
  "ISC",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "Apache-2.0",
  "0BSD",
  "CC0-1.0",
  "AGPL-3.0-or-later",
  "AGPL-3.0-only",
  "MPL-2.0",
];

/** Our own workspace packages: our licence, not a third party's. */
const OWN_SCOPE = "@vibewars/";

const NODE_MODULES = `${path.sep}node_modules${path.sep}`;

/** The directory of the package `moduleId` is in, or `undefined` outside `node_modules`. */
export function packageDirOf(moduleId: string): string | undefined {
  // Virtual modules start with NUL; a query is not part of the path.
  if (moduleId.startsWith("\0")) {
    return undefined;
  }
  const file = moduleId.split("?")[0] ?? moduleId;
  const at = file.lastIndexOf(NODE_MODULES);
  if (at < 0) {
    return undefined;
  }
  const rest = file.slice(at + NODE_MODULES.length).split(path.sep);
  const [first, second] = rest;
  if (first === undefined || second === undefined) {
    return undefined;
  }
  const name = first.startsWith("@") ? `${first}${path.sep}${second}` : first;
  return file.slice(0, at + NODE_MODULES.length) + name;
}

/** A package's `repository` (or `homepage`) as a browsable https URL, or `undefined`. */
export function repositoryUrl(repository: unknown): string | undefined {
  const raw =
    typeof repository === "string"
      ? repository
      : typeof repository === "object" && repository !== null && "url" in repository
        ? repository.url
        : undefined;
  if (typeof raw !== "string") {
    return undefined;
  }
  const shorthand = /^(?:github:)?([\w.-]+\/[\w.-]+)$/.exec(raw);
  if (shorthand?.[1] !== undefined) {
    return `https://github.com/${shorthand[1]}`;
  }
  const url = raw
    .replace(/^git\+/, "")
    .replace(/^(?:git|http):\/\//, "https://")
    .replace(/^ssh:\/\/git@/, "https://")
    .replace(/^git@([^:]+):/, "https://$1/")
    .replace(/\.git$/, "")
    // A user name before the host, `https://phaserjs@github.com/...`.
    .replace(/^https:\/\/[^/@]+@/, "https://");
  return url.startsWith("https://") ? url : undefined;
}

/** The package's LICENSE (or LICENCE) files, then its NOTICE files, verbatim. */
function licenceText(dir: string, spdx: string): string {
  const files = readdirSync(dir).sort();
  const pick = (pattern: RegExp) => files.filter((file) => pattern.test(file));
  const texts = [...pick(/^licen[cs]e/i), ...pick(/^notice/i)].map((file) =>
    readFileSync(path.join(dir, file), "utf8").trim(),
  );
  return texts.length === 0
    ? `${spdx}: licence file not shipped by the package.`
    : texts.join("\n\n");
}

/**
 * Every third-party package among `moduleIds`, once per name and version,
 * sorted by name. Throws, naming the package, on a licence not in
 * `ALLOWED_LICENCES` or none.
 */
export function collectLicences(moduleIds: Iterable<string>): BundledLicence[] {
  const dirs = new Set<string>();
  for (const id of moduleIds) {
    const dir = packageDirOf(id);
    if (dir !== undefined) {
      dirs.add(dir);
    }
  }
  const found = new Map<string, BundledLicence>();
  for (const dir of dirs) {
    const manifest = path.join(dir, "package.json");
    if (!existsSync(manifest)) {
      continue;
    }
    const json: unknown = JSON.parse(readFileSync(manifest, "utf8"));
    if (typeof json !== "object" || json === null) {
      throw new Error(`${manifest}: not a package manifest`);
    }
    const { name, version, license, repository, homepage } = json as Record<string, unknown>;
    if (typeof name !== "string" || typeof version !== "string") {
      throw new Error(`${manifest}: no name or version`);
    }
    if (name.startsWith(OWN_SCOPE) || found.has(`${name}@${version}`)) {
      continue;
    }
    if (typeof license !== "string" || !ALLOWED_LICENCES.includes(license)) {
      throw new Error(
        `${name}@${version} ships in the client under licence ${JSON.stringify(license)}, ` +
          `which is not allowed yet (apps/web/plugins/licences.ts ALLOWED_LICENCES): a person reads its terms first`,
      );
    }
    found.set(`${name}@${version}`, {
      name,
      version,
      spdx: license,
      url:
        repositoryUrl(repository) ??
        repositoryUrl(homepage) ??
        `https://www.npmjs.com/package/${name}`,
      text: licenceText(dir, license),
    });
  }
  return [...found.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
  );
}

/** Writes `LICENCES_FILE` from every chunk of the build, both pages'. */
export function licencesPlugin(): Plugin {
  return {
    name: "vibewars-licences",
    apply: "build",
    generateBundle(_options, bundle) {
      const ids = Object.values(bundle).flatMap((output) =>
        output.type === "chunk" ? output.moduleIds : [],
      );
      this.emitFile({
        type: "asset",
        fileName: LICENCES_FILE,
        source: `${JSON.stringify(collectLicences(ids), null, 2)}\n`,
      });
    },
  };
}
