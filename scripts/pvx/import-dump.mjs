#!/usr/bin/env node
/**
 * Prints the PvX wiki's PvP builds that `pvx-builds.ts` lacks (#2876), as
 * TS to append to it: `node scripts/pvx/import-dump.mjs <extracted.xml>`.
 * Build `@vibewars/game-core` first; a candidate must decode legally there.
 *
 * The dump is untrusted: page text is only matched against vetting tags
 * and `[build]` blocks, never evaluated, followed or written out.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * @typedef {{ section: string, primary: string, secondary: string, attributes: { name: string, rank: number }[], skills: string[] }} Block
 * @typedef {{ id: string, name: string, attributes: string[] }} Profession
 * @typedef {{ skills: Map<string, { id: string }>, professions: Record<string, Profession>, attributeIdOf: (id: string, name: string) => string }} Catalog
 * @typedef {{ primaryProfession: string, secondaryProfession: string | undefined, attributes: { attributeId: string, rank: number }[], skillBar: (string | null)[] }} TemplateBuild
 * @typedef {{ IMPLEMENTED_SKILLS: readonly { id: string, name: string }[], PROFESSIONS: Record<string, { name: string, attributes: readonly { id: string, name: string }[] }>, encodeTemplateCode: (build: TemplateBuild) => { ok: true, code: string } | { ok: false, problem: string } }} GameCore
 * @typedef {{ ok: true, code: string } | { ok: false, reason: string }} Encoded
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
  const tokens =
    /^(=+)\s*(.*?)\s*\1\s*$|\[build\s+([^\]]*)\]((?:\s*\[[^\]/][^\]]*\])*)\s*\[\/build\]/gim;
  for (const match of text.matchAll(tokens)) {
    if (match[1] !== undefined) {
      section = match[2];
      continue;
    }
    const head = match[3];
    const prof = /(?:^|\s)prof=([A-Za-z]+)\/([A-Za-z]+)/.exec(head);
    if (prof === null) {
      continue;
    }
    const attributes = [...head.replace(/"[^"]*"/g, "").matchAll(/([A-Za-z]+)=(\d+)/g)]
      .filter(([, name]) => name.toLowerCase() !== "prof")
      .map(([, name, rank]) => ({ name, rank: Number(rank) }));
    const skills = [...match[4].matchAll(/\[([^\]]*)\]/g)].map(([, name]) => name.trim());
    blocks.push({ section, primary: prof[1], secondary: prof[2], attributes, skills });
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

/**
 * A module of the built game-core; the caller says what it holds.
 * @param {string} file
 * @returns {Promise<unknown>}
 */
function fromCore(file) {
  return import(new URL(`../../packages/game-core/dist/${file}`, import.meta.url).href);
}

/**
 * A block encoder over the built game-core: a legal bar's code, or why not.
 * @returns {Promise<(block: Block) => Encoded>}
 */
export async function legalEncoder() {
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
  return (block) => {
    const built = blockToBuild(block, { skills, professions, attributeIdOf });
    if (!built.ok) {
      return built;
    }
    const encoded = core.encodeTemplateCode(built.build);
    if (!encoded.ok) {
      return { ok: false, reason: encoded.problem };
    }
    const decoded = decodePvxCode("check", encoded.code);
    return decoded.ok ? { ok: true, code: encoded.code } : { ok: false, reason: decoded.reason };
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
  await main(process.argv[2]);
}
