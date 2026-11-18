import { readFileSync, statSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { siteMetaPlugin, siteMetaTags } from "./site-meta.js";

const WEB = path.resolve(import.meta.dirname, "..");
const indexHtml = readFileSync(path.join(WEB, "index.html"), "utf8");

function transform(): string {
  const hook = siteMetaPlugin().transformIndexHtml;
  const fn = typeof hook === "function" ? hook : hook?.handler;
  return (fn as unknown as (html: string) => string)(indexHtml);
}

describe("site meta", () => {
  const saved = process.env.VIBEWARS_SITE_URL;
  afterEach(() => {
    if (saved === undefined) {
      delete process.env.VIBEWARS_SITE_URL;
    } else {
      process.env.VIBEWARS_SITE_URL = saved;
    }
  });

  it("points og:image and og:url at the deploy's own base", () => {
    process.env.VIBEWARS_SITE_URL = "https://x.github.io/VibeWars/next/";
    const html = transform();
    expect(html).toContain(
      '<meta property="og:image" content="https://x.github.io/VibeWars/next/share.png" />',
    );
    expect(html).toContain(
      '<meta property="og:url" content="https://x.github.io/VibeWars/next/" />',
    );
    expect(html).toContain(
      '<meta name="twitter:image" content="https://x.github.io/VibeWars/next/share.png" />',
    );
  });

  it("joins with exactly one slash", () => {
    expect(siteMetaTags("https://x.github.io/VibeWars")).toContain(
      "https://x.github.io/VibeWars/share.png",
    );
  });

  it("drops the URL tags when no site URL is set", () => {
    delete process.env.VIBEWARS_SITE_URL;
    const html = transform();
    expect(html).not.toContain('og:image"');
    expect(html).not.toContain('property="og:url"');
    expect(html).not.toContain('name="twitter:image"');
  });

  it("index.html carries the static tags", () => {
    for (const needle of [
      'name="description"',
      'property="og:type" content="website"',
      'property="og:site_name"',
      'property="og:title" content="VibeWars"',
      'property="og:description"',
      'property="og:image:width" content="1200"',
      'property="og:image:height" content="630"',
      'property="og:image:alt"',
      'name="twitter:card" content="summary_large_image"',
    ]) {
      expect(indexHtml).toContain(needle);
    }
  });

  it("share.png is 1200x630 and at most 300 KB", () => {
    const file = path.join(WEB, "public", "share.png");
    const png = readFileSync(file);
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
    expect(statSync(file).size).toBeLessThanOrEqual(300 * 1024);
  });
});
