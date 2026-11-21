import { Lexer, type Token, type Tokens } from "marked";

import type { LanguageCode } from "../i18n/languages.js";

/**
 * The player docs (#1257): `docs/player/*.md`, bundled at build time, and
 * turned into a tree of a few safe elements for the Help screen.
 *
 * Markdown never becomes HTML here. `marked` only tokenises it; each token
 * the Help screen can show becomes a node with a tag from `DocTag` and the
 * attributes that tag may carry, and everything else, raw HTML first, is
 * dropped. A link goes to another page, out to the web in a new tab, or
 * nowhere: its text stays, as text.
 *
 * Images come from two places, by the path that also works on GitHub: a
 * game icon, `../../apps/web/public/icons/<path>.svg` (one `../` more from
 * a language folder), drawn from the game's own file, and a diagram,
 * `img/<file>` (`../img/<file>`). An icon in prose is a chip-sized
 * `doc-icon`, and with bold text right after it a `doc-chip`, as the
 * effects bar shows a status; a paragraph of only a diagram is a figure,
 * captioned by its alt text. An image without alt text is not shown.
 */

/** Every tag a page can produce. */
export type DocTag =
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "p"
  | "ul"
  | "ol"
  | "li"
  | "table"
  | "thead"
  | "tbody"
  | "tr"
  | "th"
  | "td"
  | "strong"
  | "em"
  | "del"
  | "code"
  | "pre"
  | "blockquote"
  | "hr"
  | "br"
  | "a"
  | "img"
  | "span"
  | "div"
  | "figure"
  | "figcaption";

/** The only classes a page can produce; none comes from the Markdown. */
export type DocClass = "doc-icon" | "doc-chip" | "doc-figure" | "doc-table";

export type DocNode =
  | { readonly kind: "text"; readonly text: string }
  | {
      readonly kind: "element";
      readonly tag: DocTag;
      readonly attrs: Readonly<Record<string, string>>;
      readonly children: readonly DocNode[];
    };

/** A page of the Help screen, in `index.md`'s order. */
export interface PlayerDocPage {
  /** The file's name without `.md`. */
  readonly id: string;
  /** The page list's name for it, from `index.md`. */
  readonly title: string;
  readonly markdown: string;
}

/** Where a page's links and images may point. */
export interface DocTargets {
  /** The ids of the pages a link may switch to. */
  readonly pages: ReadonlySet<string>;
  /** `img/<file>` to its bundled URL. */
  readonly images: ReadonlyMap<string, string>;
  /** Where the game's `icons/...` live in this build. */
  readonly base: string;
}

/** Every `docs/player/*.md`, by file name. */
export const PLAYER_DOC_SOURCES: ReadonlyMap<string, string> = byFileName(
  import.meta.glob<string>("../../../../docs/player/*.md", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
);

/** Every `docs/player/<code>/*.md` (#2665), fetched only for the language in use. */
const PLAYER_DOC_TRANSLATIONS = import.meta.glob<string>("../../../../docs/player/*/*.md", {
  query: "?raw",
  import: "default",
});

/** Every `docs/player/img/*`, as `img/<file>`, to its bundled URL. */
export const PLAYER_DOC_IMAGES: ReadonlyMap<string, string> = new Map(
  [
    ...byFileName(
      import.meta.glob<string>("../../../../docs/player/img/*", {
        query: "?url",
        import: "default",
        eager: true,
      }),
    ),
  ].map(([name, url]) => [`img/${name}`, url]),
);

function byFileName(modules: Record<string, string>): ReadonlyMap<string, string> {
  return new Map(
    Object.entries(modules).map(([path, value]) => [path.slice(path.lastIndexOf("/") + 1), value]),
  );
}

/**
 * The pages `index.md` lists, in its order: each link to a `.md` file in
 * a list item is one page, named by the link's text. A listed file that
 * does not exist is left out; the unit test keeps that from happening.
 */
export function playerDocPages(sources: ReadonlyMap<string, string>): readonly PlayerDocPage[] {
  const pages: PlayerDocPage[] = [];
  const visit = (tokens: readonly Token[]): void => {
    for (const token of tokens) {
      if (token.type === "link") {
        const link = token as Tokens.Link;
        const file = link.href;
        const markdown = sources.get(file);
        if (file.endsWith(".md") && markdown !== undefined) {
          pages.push({ id: file.slice(0, -".md".length), title: link.text, markdown });
        }
      } else if (token.type === "list") {
        visit((token as Tokens.List).items);
      } else if ("tokens" in token && Array.isArray(token.tokens)) {
        visit(token.tokens);
      }
    }
  };
  for (const token of Lexer.lex(sources.get("index.md") ?? "")) {
    if (token.type === "list") {
      visit([token]);
    }
  }
  return pages;
}

/** The pages of this build's Help screen. */
export const PLAYER_DOC_PAGES: readonly PlayerDocPage[] = playerDocPages(PLAYER_DOC_SOURCES);

let helpPages = PLAYER_DOC_PAGES;

/** The pages the Help screen shows: the player's language's, else English. */
export function helpDocPages(): readonly PlayerDocPage[] {
  return helpPages;
}

/**
 * Fetch `code`'s pages for the Help screen before the first screen draws
 * (#2665). A language with no folder under `docs/player/` keeps English.
 */
export async function loadPlayerDocs(
  code: LanguageCode,
  loaders: Readonly<Record<string, () => Promise<string>>> = PLAYER_DOC_TRANSLATIONS,
): Promise<void> {
  const files = Object.entries(loaders).filter(([path]) => path.split("/").at(-2) === code);
  if (files.length === 0) {
    helpPages = PLAYER_DOC_PAGES;
    return;
  }
  const sources = await Promise.all(
    files.map(async ([path, load]): Promise<[string, string]> => [
      path.slice(path.lastIndexOf("/") + 1),
      await load(),
    ]),
  );
  helpPages = playerDocPages(new Map(sources));
}

/** The default targets: the Help screen's pages and this build's images. */
export function playerDocTargets(): DocTargets {
  return {
    pages: new Set(helpPages.map((page) => page.id)),
    images: PLAYER_DOC_IMAGES,
    base: import.meta.env.BASE_URL,
  };
}

/** `markdown` as the nodes the Help screen draws; see the module comment. */
export function renderPlayerDoc(markdown: string, targets: DocTargets): readonly DocNode[] {
  return blocks(Lexer.lex(markdown), targets);
}

function element(
  tag: DocTag,
  children: readonly DocNode[],
  attrs: Readonly<Record<string, string>> = {},
  className?: DocClass,
): DocNode {
  return {
    kind: "element",
    tag,
    attrs: className === undefined ? attrs : { ...attrs, class: className },
    children,
  };
}

function text(value: string): DocNode {
  return { kind: "text", text: value };
}

/** The entities Markdown text may use, as characters. */
const ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
};

/**
 * Prose as the reader sees it: marked leaves `&amp;` and `&#60;` in a text
 * token as written. Decoded here, never by the DOM; an unknown entity, or a
 * code point out of range, stays as written.
 */
function prose(value: string): DocNode {
  return text(
    value.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (entity, name: string) => {
      if (name.startsWith("#")) {
        const hex = name[1] === "x" || name[1] === "X";
        const code = Number.parseInt(name.slice(hex ? 2 : 1), hex ? 16 : 10);
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
      }
      return ENTITIES[name] ?? entity;
    }),
  );
}

function blocks(tokens: readonly Token[], targets: DocTargets): DocNode[] {
  return tokens.flatMap((token) => block(token, targets));
}

function block(token: Token, targets: DocTargets): DocNode[] {
  switch (token.type) {
    case "heading": {
      const heading = token as Tokens.Heading;
      const tag = (["h1", "h2", "h3", "h4"] as const)[Math.min(heading.depth, 4) - 1] ?? "h4";
      // A heading's icon stays an icon: a chip would compete with its text.
      return [element(tag, inline(heading.tokens, targets, false))];
    }
    case "paragraph": {
      const paragraph = token as Tokens.Paragraph;
      return [figure(paragraph.tokens, targets) ?? element("p", inline(paragraph.tokens, targets))];
    }
    case "list": {
      const list = token as Tokens.List;
      const items = list.items.map((item) => element("li", blocks(item.tokens, targets)));
      return [element(list.ordered ? "ol" : "ul", items)];
    }
    case "table": {
      const table = token as Tokens.Table;
      const row = (cells: readonly Tokens.TableCell[], tag: "th" | "td"): DocNode =>
        element(
          "tr",
          cells.map((cell) => element(tag, inline(cell.tokens, targets))),
        );
      // A table too wide for a narrow pane scrolls in its own box, and the
      // page stays put (#3733).
      return [
        element(
          "div",
          [
            element("table", [
              element("thead", [row(table.header, "th")]),
              element(
                "tbody",
                table.rows.map((cells) => row(cells, "td")),
              ),
            ]),
          ],
          {},
          "doc-table",
        ),
      ];
    }
    case "code":
      return [element("pre", [element("code", [text((token as Tokens.Code).text)])])];
    case "blockquote":
      return [element("blockquote", blocks((token as Tokens.Blockquote).tokens, targets))];
    case "hr":
      return [element("hr", [])];
    case "text": {
      // A tight list item's text, which carries its own inline tokens.
      const run = token as Tokens.Text;
      return run.tokens === undefined ? [prose(run.text)] : inline(run.tokens, targets);
    }
    default:
      // Raw HTML, link definitions, blank lines and anything new.
      return [];
  }
}

/**
 * Inline tokens as nodes. With `chips`, an icon with bold text right after
 * it, a space between at most, is one `doc-chip`.
 */
function inline(tokens: readonly Token[], targets: DocTargets, chips = true): DocNode[] {
  const nodes: DocNode[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === undefined) {
      continue;
    }
    const icon = token.type === "image" ? image(token as Tokens.Image, targets) : [];
    const gap = tokens[i + 1];
    const spaced = gap?.type === "text" && /^[ \t]+$/.test(gap.raw);
    const label = tokens[spaced ? i + 2 : i + 1];
    if (chips && isIcon(icon) && label?.type === "strong") {
      nodes.push(element("span", [...icon, ...inlineToken(label, targets, chips)], {}, "doc-chip"));
      i += spaced ? 2 : 1;
    } else {
      nodes.push(...inlineToken(token, targets, chips));
    }
  }
  return nodes;
}

function inlineToken(token: Token, targets: DocTargets, chips: boolean): DocNode[] {
  switch (token.type) {
    case "text": {
      const run = token as Tokens.Text;
      return run.tokens === undefined ? [prose(run.text)] : inline(run.tokens, targets, chips);
    }
    case "escape":
      return [text((token as Tokens.Escape).text)];
    case "strong":
      return [element("strong", inline((token as Tokens.Strong).tokens, targets, chips))];
    case "em":
      return [element("em", inline((token as Tokens.Em).tokens, targets, chips))];
    case "del":
      return [element("del", inline((token as Tokens.Del).tokens, targets, chips))];
    case "codespan":
      return [element("code", [text((token as Tokens.Codespan).text)])];
    case "br":
      return [element("br", [])];
    case "link":
      return link(token as Tokens.Link, targets);
    case "image":
      return image(token as Tokens.Image, targets);
    default:
      // Raw HTML: `<script>`, `<b onclick>` and the rest never get in.
      return [];
  }
}

/** Another page, the web in a new tab, or, for anything else, just its text. */
function link(token: Tokens.Link, targets: DocTargets): DocNode[] {
  const children = inline(token.tokens, targets);
  const href = token.href.trim();
  const page = /^([a-z0-9-]+)\.md(#.*)?$/.exec(href)?.[1];
  if (page !== undefined && targets.pages.has(page)) {
    return [element("a", children, { href: `#${page}`, "data-page": page })];
  }
  if (/^https?:\/\//i.test(href)) {
    return [element("a", children, { href, target: "_blank", rel: "noopener noreferrer" })];
  }
  return children;
}

/**
 * A game icon's path from a page, `../../apps/web/public/icons/<path>.svg`
 * or, from a language folder, `../../../...`: its `<path>` under `icons/`.
 */
const ICON_PATH = /^(?:\.\.\/){2,3}apps\/web\/public\/icons\/([a-z0-9/._-]+\.svg)$/;

/** A diagram's path from a page, `img/<file>` or, from a language folder, `../img/<file>`. */
const DIAGRAM_PATH = /^(?:\.\.\/)?(img\/[^/]+)$/;

/** Whether `nodes` is one game icon. */
function isIcon(nodes: readonly DocNode[]): boolean {
  const [node] = nodes;
  return nodes.length === 1 && node?.kind === "element" && node.attrs.class === "doc-icon";
}

/**
 * A game icon, chip-sized, or a diagram from `docs/player/img/`; nothing
 * else, and nothing without alt text.
 */
function image(token: Tokens.Image, targets: DocTargets): DocNode[] {
  const href = token.href.trim();
  const alt = token.text.trim();
  const icon = ICON_PATH.exec(href)?.[1];
  const diagram = DIAGRAM_PATH.exec(href)?.[1];
  const bundled = diagram === undefined ? undefined : targets.images.get(diagram);
  if (alt === "") {
    return [];
  }
  if (icon !== undefined && !icon.split("/").some((part) => part === "." || part === "..")) {
    return [
      element("img", [], { src: `${targets.base}icons/${icon}`, alt, title: alt }, "doc-icon"),
    ];
  }
  return bundled === undefined ? [] : [element("img", [], { src: bundled, alt })];
}

/** A paragraph of only a diagram, as a figure its alt text captions. */
function figure(tokens: readonly Token[], targets: DocTargets): DocNode | undefined {
  const [only, ...rest] = tokens.filter(
    (token) => !(token.type === "text" && token.raw.trim() === ""),
  );
  if (only?.type !== "image" || rest.length > 0) {
    return undefined;
  }
  const img = image(only as Tokens.Image, targets);
  if (img.length === 0 || isIcon(img)) {
    return undefined;
  }
  return element(
    "figure",
    [...img, element("figcaption", [prose((only as Tokens.Image).text.trim())])],
    {},
    "doc-figure",
  );
}
