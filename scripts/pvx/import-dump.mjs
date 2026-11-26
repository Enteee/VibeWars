#!/usr/bin/env node
/**
 * Prints the PvX wiki's PvP builds that `pvx-builds.ts` lacks (#2876), as
 * TS to append to it: `node scripts/pvx/import-dump.mjs <extracted.xml>`.
 * With `--fill-holes <extracted.xml>` it prints instead, sorted, the skill
 * each shipped build's own page offers for an empty slot (#2911).
 * Build `@vibewars/game-core` first; a candidate must decode legally there.
 *
 * The dump is untrusted: page text is only matched against vetting tags,
 * `[build]` blocks and skill links, never evaluated or followed, and only
 * a skill that resolved here and the heading it stood under are printed.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * @typedef {{ section: string, level: number, start: number, end: number, primary: string, secondary: string, attributes: { name: string, rank: number }[], skills: string[] }} Block
 * @typedef {{ id: string, name: string, attributes: string[] }} Profession
 * @typedef {{ skills: Map<string, { id: string }>, professions: Record<string, Profession>, attributeIdOf: (id: string, name: string) => string }} Catalog
 * @typedef {{ primaryProfession: string, secondaryProfession: string | undefined, attributes: { attributeId: string, rank: number }[], skillBar: (string | null)[] }} TemplateBuild
 * @typedef {{ IMPLEMENTED_SKILLS: readonly Skill[], decodeTemplateCode: (code: string) => { ok: true, build: TemplateBuild } | { ok: false }, PROFESSIONS: Record<string, { name: string, attributes: readonly { id: string, name: string }[] }>, encodeTemplateCode: (build: TemplateBuild) => { ok: true, code: string } | { ok: false, problem: string } }} GameCore
 * @typedef {{ ok: true, code: string } | { ok: false, reason: string }} Encoded
 * @typedef {{ id: string, name: string, elite: boolean, profession: string }} Skill
 * @typedef {{ name: string, source: string, holes?: number[] }} Candidate
 * @typedef {{ slot: number, skill: string, source: string }} Filling
 * @typedef {{ lookup: (name: string) => Skill | undefined, elites: Set<string>, decode: (code: string) => TemplateBuild | undefined, encode: (build: TemplateBuild) => Encoded, read: (block: Block) => (string | null)[] | undefined }} FillCatalog
 * @typedef {{ professions: string, mode: string, name: string, rating: string, code: string }} SoloEntry
 * @typedef {{ name: string, rating: string, members: string[] }} TeamEntry
 */

/** The vetting tags that make a page a PvP build. */
const PVP_TAGS = new Set(["RA", "AB", "FA", "GvG", "HA", "JQ", "CM", "PvP team"]);
/** The mode a title may name after its professions. */
const TITLE_MODES = new Set(["PvP", "RA", "AB", "FA", "GvG", "HA", "JQ", "CM"]);
const TEAM_SIZES = new Set([1, 2, 4, 8]);
const TEAM_PREFIX = "Team - ";
const ABBREVIATIONS = new Map([
  ["W", "warrior"],
  ["R", "ranger"],
  ["Mo", "monk"],
  ["N", "necromancer"],
  ["Me", "mesmer"],
  ["E", "elementalist"],
  ["A", "assassin"],
  ["Rt", "ritualist"],
  ["P", "paragon"],
  ["D", "dervish"],
]);
const SECTION_NOT_MEMBERS = /variant|optional|alternative|substitut/i;

/** @param {string} text */
function unescapeXml(text) {
  return text
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&");
}

/**
 * The current, non-redirect pages of the Build namespace, as `{ title, text }`.
 * @param {string} xml
 */
export function buildPages(xml) {
  /** @type {{ title: string, text: string }[]} */
  const pages = [];
  for (const [page] of xml.matchAll(/<page>[\s\S]*?<\/page>/g)) {
    if (!page.includes("<ns>100</ns>") || page.includes("<redirect")) {
      continue;
    }
    const title = /<title>Build:(.*?)<\/title>/.exec(page)?.[1];
    const text = /<text[^>]*>([\s\S]*?)<\/text>/.exec(page)?.[1];
    if (title !== undefined && text !== undefined) {
      pages.push({ title: unescapeXml(title), text: unescapeXml(text) });
    }
  }
  return pages;
}

/**
 * A page's rating as `pvx-builds.ts` writes it, if Good or Great and PvP; else `undefined`.
 * @param {string} text
 */
export function pvpRating(text) {
  const vetting = /\{\{\s*Real-Vetting\s*\|([^}]*)\}\}/i.exec(text)?.[1];
  if (vetting === undefined) {
    return undefined;
  }
  const fields = vetting.split("|").map((field) => field.trim());
  /** @param {string} key */
  const value = (key) =>
    fields
      .find((field) => field.startsWith(`${key}=`))
      ?.slice(key.length + 1)
      .trim()
      .toLowerCase();
  const rating = value("rating");
  if ((rating !== "good" && rating !== "great") || !fields.some((tag) => PVP_TAGS.has(tag))) {
    return undefined;
  }
  const word = rating === "good" ? "Good" : "Great";
  const status = value("status");
  if (status === "meta") {
    return `Meta-${word}`;
  }
  return status === "provisional" ? `Provisional-${word}` : word;
}

/**
 * The `[build]` blocks of `text` in page order, each with the section heading above it.
 * @param {string} text
 */
export function buildBlocks(text) {
  /** @type {Block[]} */
  const blocks = [];
  let section = "";
  let level = 0;
  const tokens =
    /^(=+)\s*(.*?)\s*\1\s*$|\[build\s+([^\]]*)\]((?:\s*\[[^\]/][^\]]*\])*)\s*\[\/build\]/gim;
  for (const match of text.matchAll(tokens)) {
    if (match[1] !== undefined) {
      section = match[2];
      level = match[1].length;
      continue;
    }
    const head = match[3];
    const prof = /(?:^|\s)prof=([A-Za-z]+)(?:\/([A-Za-z?]+))?/.exec(head);
    if (prof === null) {
      continue;
    }
    const attributes = [...head.replace(/"[^"]*"/g, "").matchAll(/([A-Za-z]+)=(\d+)/g)]
      .filter(([, name]) => name.toLowerCase() !== "prof")
      .map(([, name, rank]) => ({ name, rank: Number(rank) }));
    const skills = [...match[4].matchAll(/\[([^\]]*)\]/g)].map(([, name]) => name.trim());
    blocks.push({
      section,
      level,
      start: match.index,
      end: match.index + match[0].length,
      primary: prof[1],
      secondary: prof[2] === undefined || prof[2] === "?" ? "any" : prof[2],
      attributes,
      skills,
    });
  }
  return blocks;
}

/**
 * Splits a solo page's title into `professions`, `mode` and `name`; `undefined` if it has none.
 * @param {string} title
 */
export function soloTitle(title) {
  const match = /^([A-Za-z]+)\/([A-Za-z]+) (.+)$/.exec(title);
  if (match === null) {
    return undefined;
  }
  const primary = String(match[1]);
  const secondary = String(match[2]);
  const rest = String(match[3]);
  const [first = "", ...others] = rest.split(" ");
  const named = TITLE_MODES.has(first) && others.length > 0;
  return {
    professions: `${primary}_${secondary}`,
    mode: named ? first : "PvP",
    name: named ? others.join(" ") : rest,
  };
}

/**
 * `abbreviation` read as the profession it starts, as PvX's own tag reads it.
 * @param {string} abbreviation
 * @param {Record<string, Profession>} professions
 */
function professionOf(abbreviation, professions) {
  const exact = [...ABBREVIATIONS].find(
    ([short]) => short.toLowerCase() === abbreviation.toLowerCase(),
  )?.[1];
  if (exact !== undefined) {
    return exact;
  }
  const lower = abbreviation.toLowerCase();
  return Object.values(professions).find((each) => each.name.toLowerCase().startsWith(lower))?.id;
}

/** A page's skill as the catalog names it: without `(PvP)` or `@rank`; any other spelling does not resolve.
 * @param {string} name
 */
export function skillKey(name) {
  return name.replace(/@\d+$/, "").replace(/\s*\(PvP\)$/i, "");
}

/** @param {string} text */
function squash(text) {
  return text.toLowerCase().replace(/[^a-z]/g, "");
}

/**
 * A `[build]` block as a `TemplateBuild`, or why it is not one. Only the
 * bought rank counts: the `+1+2` is equipment, which a code does not hold.
 * @param {Block} block
 * @param {Catalog} catalog
 */
export function blockToBuild(block, { skills, professions, attributeIdOf }) {
  const primary = professionOf(block.primary, professions);
  if (primary === undefined) {
    return { ok: false, reason: `unknown profession ${block.primary}` };
  }
  const anySecondary = /^any$/i.test(block.secondary);
  const secondary = anySecondary ? undefined : professionOf(block.secondary, professions);
  if (!anySecondary && secondary === undefined) {
    return { ok: false, reason: `unknown profession ${block.secondary}` };
  }
  const owned = [primary, ...(secondary === undefined ? [] : [secondary])].flatMap((id) =>
    professions[id].attributes.map((name) => ({ id, name })),
  );
  /** @type {{ attributeId: string, rank: number }[]} */
  const attributes = [];
  for (const { name, rank } of block.attributes) {
    const found = owned.find((each) => squash(each.name).startsWith(squash(name)));
    if (found === undefined) {
      return { ok: false, reason: `unknown attribute ${name}` };
    }
    attributes.push({ attributeId: attributeIdOf(found.id, found.name), rank });
  }
  if (block.skills.length !== 8) {
    return { ok: false, reason: `${String(block.skills.length)} slots, not 8` };
  }
  /** @type {(string | null)[]} */
  const skillBar = [];
  for (const name of block.skills) {
    if (/^(optional|any)\b/i.test(name)) {
      skillBar.push(null);
      continue;
    }
    const skill = skills.get(skillKey(name));
    if (skill === undefined) {
      return { ok: false, reason: `skill not in the game: ${name}` };
    }
    skillBar.push(skill.id);
  }
  return {
    ok: true,
    build: { primaryProfession: primary, secondaryProfession: secondary, attributes, skillBar },
  };
}

/**
 * The blocks of a team page that are its members: not its variants.
 * @param {Block[]} blocks
 */
export function teamMembers(blocks) {
  return blocks.filter((block) => !SECTION_NOT_MEMBERS.test(block.section));
}

const RATING_ORDER = [
  "Good",
  "Provisional-Good",
  "Meta-Good",
  "Great",
  "Provisional-Great",
  "Meta-Great",
];

/**
 * The `PvxBuild`s and `PvxTeam`s of `pages` not yet present and legal
 * here, sorted by name; `encode` returns a block's legal code or a reason.
 * @param {{ title: string, text: string }[]} pages
 * @param {{ encode: (block: Block) => Encoded, soloKeys: Set<string>, teamNames: Set<string> }} options
 */
export function importEntries(pages, { encode, soloKeys, teamNames }) {
  /** @type {Map<string, SoloEntry>} */
  const solo = new Map();
  /** @type {TeamEntry[]} */
  const teams = [];
  /** @type {Record<string, number>} */
  const dropped = {};
  /** @param {string} reason */
  const drop = (reason) => {
    dropped[reason] = (dropped[reason] ?? 0) + 1;
  };
  for (const { title, text } of [...pages].sort((a, b) => (a.title < b.title ? -1 : 1))) {
    const rating = pvpRating(text);
    if (rating === undefined) {
      continue;
    }
    const blocks = buildBlocks(text);
    if (title.startsWith(TEAM_PREFIX)) {
      const name = title.slice(TEAM_PREFIX.length);
      const members = teamMembers(blocks);
      if (teamNames.has(name)) {
        continue;
      }
      if (!TEAM_SIZES.has(members.length)) {
        drop("team size");
        continue;
      }
      const codes = members.map(encode);
      const legal = codes.flatMap((code) => (code.ok ? [code.code] : []));
      if (legal.length === codes.length) {
        teams.push({ name, rating, members: legal });
      } else {
        drop("team member not legal here");
      }
      continue;
    }
    const parts = soloTitle(title);
    if (parts !== undefined && soloKeys.has(`${parts.professions} ${parts.mode} ${parts.name}`)) {
      continue;
    }
    if (parts === undefined || blocks.length === 0) {
      drop("no solo title or block");
      continue;
    }
    const code = encode(blocks[0]);
    if (!code.ok) {
      drop("build not legal here");
      continue;
    }
    const rival = solo.get(code.code);
    if (rival === undefined || RATING_ORDER.indexOf(rating) > RATING_ORDER.indexOf(rival.rating)) {
      solo.set(code.code, { ...parts, rating, code: code.code });
    }
  }
  /**
   * @param {{ name: string }} a
   * @param {{ name: string }} b
   */
  const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  return { solo: [...solo.values()].sort(byName), teams: teams.sort(byName), dropped };
}

/** The headings whose text may name a filling, the better source first. */
const FILLING_HEADINGS = [/^optionals?\b/i, /^variants?\b|\busage$/i];
const SKILL_MENTION =
  /\{\{skill(?: pvxicon)?\|([^|}]+)|\[\[(?:gww:\s*)?([^\]|]+)(?:\|[^\]]*)?\]\]?|\[build\b[^\]]*\]((?:\s*\[[^\]/][^\]]*\])*)/gi;

/**
 * The skills `text` names in markup, in page order: a skill icon, a link,
 * or a variant's `[build]`. Plain words are not read: "Dash" is also a word.
 * @param {string} text
 */
export function skillMentions(text) {
  return [...text.matchAll(SKILL_MENTION)]
    .flatMap(([, icon, link, bar]) =>
      bar === undefined
        ? [icon ?? link]
        : [...bar.matchAll(/\[([^\]]*)\]/g)].map(([, name]) => name),
    )
    .map((name) => skillKey(name.trim()));
}

/**
 * What the page offers `members[index]`, best source first: a section
 * nested under another member's block is that member's alone. A list
 * labelled by an ordinal offers only that empty slot; Usage text about
 * the other side names no filling.
 * @param {string} text
 * @param {Block[]} members
 * @param {number} index
 * @returns {Candidate[]}
 */
export function fillingCandidates(text, members, index) {
  const headings = [...text.matchAll(/^(=+)\s*(.*?)\s*\1\s*$/gm)];
  return FILLING_HEADINGS.flatMap((wanted) =>
    headings.flatMap((heading, at) => {
      const start = heading.index;
      const level = heading[1].length;
      const owner = members.findLastIndex((member) => member.end <= start);
      const owned = owner >= 0 && members[owner].level > 0 && level > members[owner].level;
      if (!wanted.test(heading[2]) || (owned && owner !== index)) {
        return [];
      }
      const next = headings.slice(at + 1).find((later) => later[1].length <= level);
      const body = text.slice(start + heading[0].length, next?.index ?? text.length);
      return lists(heading[2], body);
    }),
  );
}

const ORDINALS = ["first", "second", "third", "fourth"];
const FOES = /\b(?:enem|foes?\b|opponent|counter|against|avoid|don'?t|do not)/i;
const OPTIONAL_LABEL =
  /^(?:'''|;)?\s*((?:\w+(?:\/\w+)?\s+)?optionals?(?:\s+(?:slots?\s*)?[\d/]+)?)\b[^:\n]{0,20}:?'*\s*$/i;

/**
 * The empty slots `label` binds a list to, counted from 0; `undefined` for any.
 * @param {string} label
 */
function holesOf(label) {
  const words = label.toLowerCase().split(/[\s/]+/);
  const held = [
    ...words.flatMap((word) => (ORDINALS.includes(word) ? [ORDINALS.indexOf(word)] : [])),
    ...words.flatMap((word) => (/^\d$/.test(word) ? [Number(word) - 1] : [])),
  ];
  return held.length === 0 ? undefined : held;
}

/**
 * `body` as candidates under `heading`, a bold-labelled list as its own source.
 * @param {string} heading
 * @param {string} body
 * @returns {Candidate[]}
 */
function lists(heading, body) {
  const usage = /usage$/i.test(heading);
  /** @type {Candidate[]} */
  const found = [];
  let source = heading;
  for (const line of body.split("\n")) {
    const label = OPTIONAL_LABEL.exec(line.trim());
    if (label !== null) {
      source = label[1];
      continue;
    }
    if (usage && FOES.test(line)) {
      continue;
    }
    const holes = holesOf(source);
    found.push(
      ...skillMentions(line).map((name) => ({
        name,
        source,
        ...(holes === undefined ? {} : { holes }),
      })),
    );
  }
  return found;
}

/**
 * `code` with its empty slots filled from `candidates`, the first legal
 * one each, in slot order. `taken` holds every other build's sorted bar:
 * a filling that would repeat one is undone, and that build stops there.
 * @param {string} code
 * @param {Candidate[]} candidates
 * @param {FillCatalog} catalog
 * @param {Set<string>} [taken]
 * @returns {{ code: string, fillings: Filling[] }}
 */
export function fillCode(code, candidates, { lookup, elites, decode, encode }, taken) {
  const build = decode(code);
  if (build === undefined) {
    return { code, fillings: [] };
  }
  let bar = build.skillBar;
  let current = code;
  /** @type {Filling[]} */
  const fillings = [];
  let hole = -1;
  for (let slot = 0; slot < bar.length; slot += 1) {
    if (bar[slot] !== null) {
      continue;
    }
    hole += 1;
    for (const { name, source, holes } of candidates) {
      const skill = lookup(name);
      if (
        skill === undefined ||
        (holes !== undefined && !holes.includes(hole)) ||
        bar.includes(skill.id) ||
        (skill.elite && bar.some((id) => id !== null && elites.has(id))) ||
        ![build.primaryProfession, build.secondaryProfession, "common"].includes(skill.profession)
      ) {
        continue;
      }
      const filled = bar.with(slot, skill.id);
      const encoded = encode({ ...build, skillBar: filled });
      if (!encoded.ok) {
        continue;
      }
      if (taken?.has([...filled].sort().join())) {
        return { code: current, fillings };
      }
      bar = filled;
      current = encoded.code;
      fillings.push({ slot: slot + 1, skill: skill.name, source });
      break;
    }
  }
  return { code: current, fillings };
}

/**
 * Every shipped build's fillings from its own page, sorted, and why the
 * rest stay empty. A page's block must still match the bar in its filled
 * slots; a member's own build page, if the team page links one, comes last.
 * @param {{ title: string, text: string }[]} pages
 * @param {{ solo: readonly SoloEntry[], teams: readonly TeamEntry[] }} shipped
 * @param {FillCatalog} catalog
 */
export function fillHoles(pages, { solo, teams }, catalog) {
  const { decode, read } = catalog;
  const byTitle = new Map(pages.map((page) => [page.title, page]));
  const soloPages = new Map(
    pages.flatMap((page) => {
      const parts = soloTitle(page.title);
      return parts === undefined
        ? []
        : [[`${parts.professions} ${parts.mode} ${parts.name}`, page]];
    }),
  );
  const barOf = (/** @type {string} */ code) => decode(code)?.skillBar ?? [];
  const barKey = (/** @type {string} */ code) => [...barOf(code)].sort().join();
  const holes = (/** @type {string} */ code) => barOf(code).filter((id) => id === null).length;
  const fits = (/** @type {string} */ code, /** @type {Block} */ block) => {
    const wiki = read(block);
    return wiki !== undefined && barOf(code).every((id, at) => id === null || id === wiki[at]);
  };
  /** @type {{ name: string, from: string, to: string, fillings: Filling[] }[]} */
  const rows = [];
  const unfilled = { "no page": 0, "page no longer matches": 0, "no legal named skill": 0 };
  const report = (
    /** @type {string} */ name,
    /** @type {string} */ from,
    /** @type {{ code: string, fillings: Filling[] }} */ result,
  ) => {
    unfilled["no legal named skill"] += holes(result.code);
    if (result.fillings.length > 0) {
      rows.push({ name, from, to: result.code, fillings: result.fillings });
    }
  };
  const taken = new Set(solo.map((build) => barKey(build.code)));
  for (const build of solo) {
    if (holes(build.code) === 0) {
      continue;
    }
    const key = `${build.professions} ${build.mode} ${build.name}`;
    const page = soloPages.get(key);
    const block = page && buildBlocks(page.text).find((each) => fits(build.code, each));
    if (page === undefined || block === undefined) {
      unfilled[page === undefined ? "no page" : "page no longer matches"] += holes(build.code);
      continue;
    }
    taken.delete(barKey(build.code));
    const result = fillCode(build.code, fillingCandidates(page.text, [block], 0), catalog, taken);
    taken.add(barKey(result.code));
    report(key, build.code, result);
  }
  /** @type {Map<string, { code: string, fillings: Filling[] }>} */
  const sameBuild = new Map();
  for (const team of [...teams].sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const page = byTitle.get(`${TEAM_PREFIX}${team.name}`);
    const members = page === undefined ? [] : teamMembers(buildBlocks(page.text));
    const used = new Set();
    team.members.forEach((code, at) => {
      if (holes(code) === 0) {
        return;
      }
      if (page === undefined) {
        unfilled["no page"] += holes(code);
        return;
      }
      const free = (/** @type {Block} */ each, /** @type {number} */ i) =>
        !used.has(i) && fits(code, each);
      const index = at < members.length && free(members[at], at) ? at : members.findIndex(free);
      if (index < 0) {
        unfilled["page no longer matches"] += holes(code);
        return;
      }
      used.add(index);
      let result = sameBuild.get(code);
      if (result === undefined) {
        const zone = page.text.slice(members[index].end, members[index + 1]?.start);
        const own = byTitle.get(/\[\[Build:([^\]|#]+)/i.exec(zone)?.[1]?.trim() ?? "");
        const ownBlock =
          own && [buildBlocks(own.text)[0]].find((each) => each !== undefined && fits(code, each));
        const candidates = [
          ...fillingCandidates(page.text, members, index),
          ...(own !== undefined && ownBlock !== undefined
            ? fillingCandidates(own.text, [ownBlock], 0).map((each) => ({
                ...each,
                source: `${own.title}: ${each.source}`,
              }))
            : []),
        ];
        result = fillCode(code, candidates, catalog);
        sameBuild.set(code, result);
      }
      report(`Team - ${team.name} #${String(at + 1)}`, code, result);
    });
  }
  return { rows: rows.sort((a, b) => (a.name < b.name ? -1 : 1)), unfilled };
}

/**
 * A module of the built game-core; the caller says what it holds.
 * @param {string} file
 * @returns {Promise<unknown>}
 */
function fromCore(file) {
  return import(new URL(`../../packages/game-core/dist/${file}`, import.meta.url).href);
}

/** The built game-core as the block and bar catalogs need it. */
async function coreCatalog() {
  const core = /** @type {GameCore} */ (await fromCore("index.js"));
  const { decodePvxCode } =
    /** @type {{ decodePvxCode: (name: string, code: string) => { ok: true } | { ok: false, reason: string } }} */ (
      await fromCore("starter-builds.js")
    );
  const skills = new Map(core.IMPLEMENTED_SKILLS.map((skill) => [skillKey(skill.name), skill]));
  const professions = Object.fromEntries(
    Object.entries(core.PROFESSIONS).map(([id, each]) => [
      id,
      { id, name: each.name, attributes: each.attributes.map((attribute) => attribute.name) },
    ]),
  );
  const attributeIdOf = (/** @type {string} */ id, /** @type {string} */ name) =>
    core.PROFESSIONS[id].attributes.find((attribute) => attribute.name === name).id;
  /** @param {TemplateBuild} build @returns {Encoded} */
  const encode = (build) => {
    const encoded = core.encodeTemplateCode(build);
    if (!encoded.ok) {
      return { ok: false, reason: encoded.problem };
    }
    const decoded = decodePvxCode("check", encoded.code);
    return decoded.ok ? { ok: true, code: encoded.code } : { ok: false, reason: decoded.reason };
  };
  return { core, skills, professions, attributeIdOf, encode };
}

/**
 * A block encoder over the built game-core: a legal bar's code, or why not.
 * @returns {Promise<(block: Block) => Encoded>}
 */
export async function legalEncoder() {
  const { skills, professions, attributeIdOf, encode } = await coreCatalog();
  return (block) => {
    const built = blockToBuild(block, { skills, professions, attributeIdOf });
    return built.ok ? encode(built.build) : built;
  };
}

/**
 * The fill catalog over the built game-core; a name resolves whatever its case.
 * @returns {Promise<FillCatalog>}
 */
async function fillCatalog() {
  const { core, skills, professions, attributeIdOf, encode } = await coreCatalog();
  const lower = new Map([...skills].map(([name, skill]) => [name.toLowerCase(), skill]));
  return {
    lookup: (name) => lower.get(name.toLowerCase()),
    elites: new Set(
      core.IMPLEMENTED_SKILLS.filter((skill) => skill.elite).map((skill) => skill.id),
    ),
    decode: (code) => {
      const decoded = core.decodeTemplateCode(code);
      return decoded.ok ? decoded.build : undefined;
    },
    encode,
    read: (block) => {
      const named = { ...block, skills: block.skills.map((name) => name.toLowerCase()) };
      const built = blockToBuild(named, { skills: lower, professions, attributeIdOf });
      return built.ok ? built.build.skillBar : undefined;
    },
  };
}

/** @param {{ solo: SoloEntry[], teams: TeamEntry[] }} entries */
function printEntries({ solo, teams }) {
  const quote = JSON.stringify;
  for (const b of solo) {
    console.log(
      `  {\n    professions: ${quote(b.professions)},\n    mode: ${quote(b.mode)},\n    name: ${quote(b.name)},\n    rating: ${quote(b.rating)},\n    code: ${quote(b.code)},\n  },`,
    );
  }
  console.log("// teams");
  for (const t of teams) {
    const members = t.members.map((code) => `      ${quote(code)},\n`).join("");
    console.log(
      `  {\n    name: ${quote(t.name)},\n    rating: ${quote(t.rating)},\n    members: [\n${members}    ],\n  },`,
    );
  }
}

/** @param {string} path */
async function mainFillHoles(path) {
  const { PVX_SOLO, PVX_TEAMS } =
    /** @type {{ PVX_SOLO: readonly SoloEntry[], PVX_TEAMS: readonly TeamEntry[] }} */ (
      await fromCore("pvx-builds.js")
    );
  const { rows, unfilled } = fillHoles(
    buildPages(readFileSync(path, "utf8")),
    { solo: PVX_SOLO, teams: PVX_TEAMS },
    await fillCatalog(),
  );
  for (const { name, from, to, fillings } of rows) {
    for (const { slot, skill, source } of fillings) {
      console.log([name, from, to, String(slot), skill, source].join("\t"));
    }
  }
  console.error("slots left empty", unfilled);
}

/** @param {string} path */
async function main(path) {
  const { PVX_SOLO, PVX_TEAMS } =
    /** @type {{ PVX_SOLO: readonly SoloEntry[], PVX_TEAMS: readonly TeamEntry[] }} */ (
      await fromCore("pvx-builds.js")
    );
  const result = importEntries(buildPages(readFileSync(path, "utf8")), {
    encode: await legalEncoder(),
    soloKeys: new Set(PVX_SOLO.map((b) => `${b.professions} ${b.mode} ${b.name}`)),
    teamNames: new Set(PVX_TEAMS.map((team) => team.name)),
  });
  printEntries(result);
  console.error(
    `solo ${String(result.solo.length)}, teams ${String(result.teams.length)}, left out`,
    result.dropped,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === "--fill-holes") {
    await mainFillHoles(process.argv[3]);
  } else {
    await main(process.argv[2]);
  }
}
