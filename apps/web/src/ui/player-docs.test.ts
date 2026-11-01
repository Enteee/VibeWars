import { describe, expect, it } from "vitest";

import {
  PLAYER_DOC_PAGES,
  PLAYER_DOC_SOURCES,
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

describe("docs/player (#1257)", () => {
  it("index.md lists every page in docs/player once, and each one it lists exists", () => {
    const index = PLAYER_DOC_SOURCES.get("index.md") ?? "";
    const listed = [...index.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1]);
    const files = [...PLAYER_DOC_SOURCES.keys()].filter((name) => name !== "index.md");
    expect(new Set(listed).size).toBe(listed.length);
    expect([...listed].sort()).toEqual([...files].sort());
    expect(PLAYER_DOC_PAGES.map((page) => `${page.id}.md`)).toEqual(listed);
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
