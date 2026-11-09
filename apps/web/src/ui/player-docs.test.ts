import { afterEach, describe, expect, it } from "vitest";

import {
  PLAYER_DOC_PAGES,
  PLAYER_DOC_SOURCES,
  helpDocPages,
  loadPlayerDocs,
  playerDocPages,
  renderPlayerDoc,
  type DocNode,
  type DocTargets,
} from "./player-docs.js";

const TARGETS: DocTargets = {
  pages: new Set(["getting-started", "controls"]),
  images: new Map([["img/lobby.png", "/assets/lobby-abc.png"]]),
  base: "/vibewars/",
};

/** Every element in `nodes`, depth first. */
function elements(nodes: readonly DocNode[]): Extract<DocNode, { kind: "element" }>[] {
  return nodes.flatMap((node) =>
    node.kind === "element" ? [node, ...elements(node.children)] : [],
  );
}

function textOf(nodes: readonly DocNode[]): string {
  return nodes.map((node) => (node.kind === "text" ? node.text : textOf(node.children))).join("");
}

/** Every `docs/player/<code>/*.md`, by language and then by file name. */
const TRANSLATED_DOCS = new Map<string, Map<string, string>>();
for (const [path, markdown] of Object.entries(
  import.meta.glob<string>("../../../../docs/player/*/*.md", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
)) {
  const [code = "", file = ""] = path.split("/").slice(-2);
  TRANSLATED_DOCS.set(
    code,
    (TRANSLATED_DOCS.get(code) ?? new Map<string, string>()).set(file, markdown),
  );
}

/** The anchors a page's headings get, as GitHub writes them. */
function anchors(markdown: string): Set<string> {
  const seen = new Map<string, number>();
  const found = new Set<string>();
  for (const [, heading = ""] of markdown.matchAll(/^#{1,6}\s+(.+?)\s*$/gm)) {
    const slug = heading
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, "")
      .replace(/\s/g, "-");
    const count = seen.get(slug) ?? 0;
    seen.set(slug, count + 1);
    found.add(count === 0 ? slug : `${slug}-${String(count)}`);
  }
  return found;
}

/** Each `[..](page.md#anchor)` in `sources` that no heading answers. */
function brokenAnchors(sources: ReadonlyMap<string, string>): string[] {
  return [...sources].flatMap(([file, markdown]) =>
    [...markdown.matchAll(/\]\(([a-z0-9-]+\.md)#([^)]+)\)/g)]
      .filter(([, page = "", anchor = ""]) => !anchors(sources.get(page) ?? "").has(anchor))
      .map(([, page = "", anchor = ""]) => `${file} -> ${page}#${anchor}`),
  );
}

describe("docs/player in other languages (#2665)", () => {
  afterEach(async () => {
    await loadPlayerDocs("en", {});
  });

  it("every language folder has exactly the English file set", () => {
    const english = [...PLAYER_DOC_SOURCES.keys()].sort();
    for (const [code, sources] of TRANSLATED_DOCS) {
      expect([...sources.keys()].sort(), code).toEqual(english);
    }
  });

  it("every link to an anchor resolves to a heading in its own language", () => {
    expect(brokenAnchors(PLAYER_DOC_SOURCES)).toEqual([]);
    for (const [code, sources] of TRANSLATED_DOCS) {
      expect(brokenAnchors(sources), code).toEqual([]);
    }
  });

  it("finds an anchor no heading in that language answers", () => {
    const sources = new Map([
      ["a.md", "[x](b.md#armor) [y](b.md#rustung) [z](b.md#rustung-1)"],
      ["b.md", "# Rüstung\n\n## Rustung\n\n## Rustung\n"],
    ]);
    expect(brokenAnchors(sources)).toEqual(["a.md -> b.md#armor"]);
  });

  it("anchors keep a translated heading's letters", () => {
    expect(anchors("## Équipe & Rüstung")).toEqual(new Set(["équipe--rüstung"]));
  });

  it("shows English for a language with no folder", async () => {
    await loadPlayerDocs("de", { "../../docs/player/fr/index.md": () => Promise.resolve("") });
    expect(helpDocPages()).toBe(PLAYER_DOC_PAGES);
  });

  it("shows a language's pages in the order of its own index.md", async () => {
    const page = (markdown: string) => () => Promise.resolve(markdown);
    await loadPlayerDocs("de", {
      "../../docs/player/de/index.md": page("- [Zwei](two.md)\n- [Eins](one.md)\n"),
      "../../docs/player/de/one.md": page("# Eins\n"),
      "../../docs/player/de/two.md": page("# Zwei\n"),
      "../../docs/player/fr/one.md": page("# Un\n"),
    });
    expect(helpDocPages().map((doc) => [doc.id, doc.title, doc.markdown])).toEqual([
      ["two", "Zwei", "# Zwei\n"],
      ["one", "Eins", "# Eins\n"],
    ]);
  });
});

describe("docs/player (#1257)", () => {
  it("index.md lists every page in docs/player once, and each one it lists exists", () => {
    const index = PLAYER_DOC_SOURCES.get("index.md") ?? "";
    const listed = [...index.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1]);
    const files = [...PLAYER_DOC_SOURCES.keys()].filter((name) => name !== "index.md");
    expect(new Set(listed).size).toBe(listed.length);
    expect([...listed].sort()).toEqual([...files].sort());
    expect(PLAYER_DOC_PAGES.map((page) => `${page.id}.md`)).toEqual(listed);
  });

  it("has no page `licences`: Help draws that page itself (#2559)", () => {
    expect(PLAYER_DOC_PAGES.map((page) => page.id)).not.toContain("licences");
  });

  it("starts with Getting started", () => {
    expect(PLAYER_DOC_PAGES[0]?.id).toBe("getting-started");
    expect(PLAYER_DOC_PAGES[0]?.title).toBe("Getting started");
  });

  it("ends with Support VibeWars, whose sponsor link opens in a new tab (#2097)", () => {
    expect(PLAYER_DOC_PAGES.at(-1)?.id).toBe("support");
    const nodes = renderPlayerDoc(PLAYER_DOC_SOURCES.get("support.md") ?? "", TARGETS);
    const sponsor = elements(nodes).filter(
      (node) => node.tag === "a" && node.attrs.href?.includes("/sponsors/"),
    );
    expect(sponsor.map((node) => node.attrs)).toEqual([
      { href: "https://github.com/sponsors/Enteee", target: "_blank", rel: "noopener noreferrer" },
    ]);
  });

  it("keeps index.md's order and names, and leaves out a file that is not there", () => {
    const pages = playerDocPages(
      new Map([
        ["index.md", "# Help\n\n- [B page](b.md)\n- [Gone](gone.md)\n- [A page](a.md)\n"],
        ["a.md", "# A"],
        ["b.md", "# B"],
      ]),
    );
    expect(pages.map((page) => [page.id, page.title])).toEqual([
      ["b", "B page"],
      ["a", "A page"],
    ]);
  });
});

describe("renderPlayerDoc (#1257)", () => {
  it("keeps headings, paragraphs, lists, tables, emphasis and code", () => {
    const nodes = renderPlayerDoc(
      "# Title\n\nSome **bold** and *em* and `code`.\n\n1. one\n2. two\n\n" +
        "| a | b |\n|---|---|\n| 1 | 2 |\n\n```\nx < y\n```\n",
      TARGETS,
    );
    expect(elements(nodes).map((node) => node.tag)).toEqual([
      "h1",
      "p",
      "strong",
      "em",
      "code",
      "ol",
      "li",
      "li",
      "table",
      "thead",
      "tr",
      "th",
      "th",
      "tbody",
      "tr",
      "td",
      "td",
      "pre",
      "code",
    ]);
    expect(textOf(nodes)).toContain("x < y");
  });

  it("shows inline code and entities literally, never escaped twice", () => {
    const nodes = renderPlayerDoc(
      "Press `<Esc>` &amp; go, `a &amp;& b` &lt;3 &#x41;&#66; &bogus;\n",
      TARGETS,
    );
    expect(textOf(nodes)).toBe("Press <Esc> & go, a &amp;& b <3 AB &bogus;");
  });

  it("drops <script>, event handlers and any other raw HTML", () => {
    const nodes = renderPlayerDoc(
      '<script>alert(1)</script>\n\nHi <b onclick="alert(2)">there</b><img src=x onerror=alert(3)>\n',
      TARGETS,
    );
    expect(elements(nodes).map((node) => node.tag)).toEqual(["p"]);
    expect(textOf(nodes)).toBe("Hi there");
  });

  it("links a page in the screen, the web in a new tab, and javascript: nowhere", () => {
    const nodes = renderPlayerDoc(
      "[keys](controls.md#move) [site](https://example.com/a) [bad](javascript:alert(1)) " +
        "[gone](missing.md) [rel](../secret.md)",
      TARGETS,
    );
    const links = elements(nodes).filter((node) => node.tag === "a");
    expect(links.map((node) => node.attrs)).toEqual([
      { href: "#controls", "data-page": "controls" },
      { href: "https://example.com/a", target: "_blank", rel: "noopener noreferrer" },
    ]);
    expect(textOf(nodes)).toBe("keys site bad gone rel");
  });

  it("shows images from docs/player/img and the game's icons, nothing else", () => {
    const nodes = renderPlayerDoc(
      "![Lobby](img/lobby.png) ![Icon](/icons/skill/monk.heal.svg) " +
        "![x](https://evil.example/x.png) ![y](/icons/../secret.svg) ![z](javascript:1)",
      TARGETS,
    );
    expect(
      elements(nodes)
        .filter((node) => node.tag === "img")
        .map((node) => node.attrs),
    ).toEqual([
      { src: "/assets/lobby-abc.png", alt: "Lobby" },
      { src: "/vibewars/icons/skill/monk.heal.svg", alt: "Icon" },
    ]);
  });
});
