import { Lexer, type Token, type Tokens } from "marked";

/**
 * The player docs (#1257): `docs/player/*.md`, bundled at build time, and
 * turned into a tree of a few safe elements for the Help screen.
 *
 * Markdown never becomes HTML here. `marked` only tokenises it; each token
 * the Help screen can show becomes a node with a tag from `DocTag` and the
 * attributes that tag may carry, and everything else, raw HTML first, is
 * dropped. A link goes to another page, out to the web in a new tab, or
 * nowhere: its text stays, as text.
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
  | "img";

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
  /** Where `/icons/...` lives in this build. */
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

/** The default targets: this build's pages and images. */
export function playerDocTargets(): DocTargets {
  return {
    pages: new Set(PLAYER_DOC_PAGES.map((page) => page.id)),
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
): DocNode {
  return { kind: "element", tag, attrs, children };
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
      return [element(tag, inline(heading.tokens, targets))];
    }
    case "paragraph":
      return [element("p", inline((token as Tokens.Paragraph).tokens, targets))];
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
      return [
        element("table", [
          element("thead", [row(table.header, "th")]),
          element(
            "tbody",
            table.rows.map((cells) => row(cells, "td")),
          ),
        ]),
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

function inline(tokens: readonly Token[], targets: DocTargets): DocNode[] {
  return tokens.flatMap((token): DocNode[] => {
    switch (token.type) {
      case "text": {
        const run = token as Tokens.Text;
        return run.tokens === undefined ? [prose(run.text)] : inline(run.tokens, targets);
      }
      case "escape":
        return [text((token as Tokens.Escape).text)];
      case "strong":
        return [element("strong", inline((token as Tokens.Strong).tokens, targets))];
      case "em":
        return [element("em", inline((token as Tokens.Em).tokens, targets))];
      case "del":
        return [element("del", inline((token as Tokens.Del).tokens, targets))];
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
  });
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

/** An image from `docs/player/img/` or the game's own icons; nothing else. */
function image(token: Tokens.Image, targets: DocTargets): DocNode[] {
  const href = token.href.trim();
  const bundled = targets.images.get(href);
  const src =
    bundled ??
    (/^\/icons\/[a-z0-9/._-]+\.svg$/.test(href) && !href.includes("..")
      ? `${targets.base}${href.slice(1)}`
      : undefined);
  if (src === undefined) {
    return [];
  }
  return [element("img", [], { src, alt: token.text })];
}
