import type { Plugin } from "vite";

/**
 * The link preview's absolute URLs (#3534). Crawlers want `og:image` and
 * `og:url` absolute and https, and only a deploy knows its own address:
 * `VIBEWARS_SITE_URL` (set by pages.yml, ending in the deploy's base) plus
 * `share.png`. Unset, as in the dev server and local builds, the tags are
 * left out, so a crawler never sees a local address.
 */

const SHARE_IMAGE = "share.png";

/** The tags that carry a URL, as HTML to put before `</head>`; empty when no site URL is set. */
export function siteMetaTags(siteUrl: string | undefined): string {
  if (siteUrl === undefined || siteUrl === "") {
    return "";
  }
  const base = siteUrl.replace(/\/+$/, "");
  const image = `${base}/${SHARE_IMAGE}`;
  return [
    `<meta property="og:url" content="${base}/" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta name="twitter:image" content="${image}" />`,
  ]
    .map((tag) => `    ${tag}\n`)
    .join("");
}

export function siteMetaPlugin(): Plugin {
  return {
    name: "vibewars-site-meta",
    transformIndexHtml(html) {
      const tags = siteMetaTags(process.env.VIBEWARS_SITE_URL);
      return tags === "" ? html : html.replace("  </head>", `${tags}  </head>`);
    },
  };
}
