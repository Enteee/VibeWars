/**
 * One licence, stated the same way everywhere (#139).
 *
 * The root `LICENSE` is the GNU AGPL v3 exactly as gnu.org publishes it,
 * and every package says the same SPDX id as the root, so the repository
 * never states two licences.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** sha256 of https://www.gnu.org/licenses/agpl-3.0.txt. */
const AGPL_3_SHA256 = "0d96a4ff68ad6d4b6f1f30f713b18d5184912ba8dd389f86aa7710db079abcb0";

/** @param {string} file */
const licenseOf = (file) => {
  /** @type {unknown} */
  const parsed = JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
  return typeof parsed === "object" && parsed !== null && "license" in parsed
    ? parsed.license
    : undefined;
};

const PACKAGES = ["apps", "packages"].flatMap((group) =>
  fs
    .readdirSync(path.join(ROOT, group))
    .map((name) => path.join(group, name, "package.json"))
    .filter((file) => fs.existsSync(path.join(ROOT, file))),
);

describe("the licence", () => {
  it("is the AGPL v3 text, unmodified", () => {
    const text = fs.readFileSync(path.join(ROOT, "LICENSE"));
    expect(createHash("sha256").update(text).digest("hex")).toBe(AGPL_3_SHA256);
  });

  it("finds the packages", () => {
    expect(PACKAGES).toContain(path.join("packages", "game-core", "package.json"));
  });

  it.each(PACKAGES)("%s says what the root says", (file) => {
    expect(licenseOf(file)).toBe(licenseOf("package.json"));
  });
});
