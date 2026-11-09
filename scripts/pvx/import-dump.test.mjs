import { describe, expect, it } from "vitest";

import {
  blockToBuild,
  buildBlocks,
  buildPages,
  importEntries,
  pvpRating,
  soloTitle,
  teamMembers,
} from "./import-dump.mjs";

/**
 * @param {string} title
 * @param {string} text
 */
const page = (title, text, ns = 100) =>
  `<page><title>${title}</title><ns>${String(ns)}</ns><revision><text bytes="1">${text}</text></revision></page>`;
const bar = "[Gust][Shock][Optional][Dash][Heal][Rez][Bash][Hit@14]";
const block = (prof = "A/E") =>
  `[build prof=${prof} air=10+1+2 dag=12][/build]`.replace("[/build]", `${bar}[/build]`);

describe("the PvX dump import (#2876)", () => {
  it("reads only the non-redirect pages of the Build namespace, unescaped", () => {
    const xml = [
      page("Build:A/E RA Gust", "a &amp;lt;b"),
      page("Talk:A/E RA Gust", "no", 1),
      `<page><title>Build:Old</title><ns>100</ns><redirect title="x" /><text>no</text></page>`,
    ].join("");
    expect(buildPages(xml)).toEqual([{ title: "A/E RA Gust", text: "a &lt;b" }]);
  });

  it("rates Good and Great PvP pages, with their status", () => {
    expect(pvpRating("{{Real-Vetting|rating=good|RA|AB}}")).toBe("Good");
    expect(pvpRating("{{Real-Vetting|status=meta|rating=great|GvG}}")).toBe("Meta-Great");
    expect(pvpRating("{{Real-Vetting|status=provisional|rating=good|HA}}")).toBe(
      "Provisional-Good",
    );
  });

  it("leaves out PvE, Testing and Trash pages and pages with no vetting", () => {
    expect(pvpRating("{{Real-Vetting|rating=great|farming}}")).toBeUndefined();
    expect(pvpRating("{{Real-Vetting|rating=testing|RA}}")).toBeUndefined();
    expect(pvpRating("{{Real-Vetting|rating=trash|RA}}")).toBeUndefined();
    expect(pvpRating("{{Stub}}")).toBeUndefined();
  });

  it("reads a block's professions, bought ranks and slots, under its heading", () => {
    const [read] = buildBlocks(`== Main ==\n${block()}`);
    expect(read).toMatchObject({ section: "Main", primary: "A", secondary: "E" });
    expect(read.attributes).toEqual([
      { name: "air", rank: 10 },
      { name: "dag", rank: 12 },
    ]);
    expect(read.skills).toHaveLength(8);
  });

  it("splits a title into professions, mode and name", () => {
    expect(soloTitle("A/E RA Gust Two")).toEqual({
      professions: "A_E",
      mode: "RA",
      name: "Gust Two",
    });
    expect(soloTitle("A/E Gust").mode).toBe("PvP");
    expect(soloTitle("Team - HA Spike")).toBeUndefined();
  });

  it("does not count a team's variants among its members", () => {
    const blocks = buildBlocks(`== One ==\n${block()}\n== Variants ==\n${block()}`);
    expect(teamMembers(blocks)).toHaveLength(1);
  });

  const catalog = {
    skills: new Map([["Gust", { id: "gust" }]]),
    professions: {
      assassin: { id: "assassin", name: "Assassin", attributes: [] },
      elementalist: { id: "elementalist", name: "Elementalist", attributes: ["Air Magic"] },
    },
    attributeIdOf: (/** @type {string} */ _id, /** @type {string} */ name) => name,
  };
  /** @param {string} first */
  const eight = (first) => [first, ...new Array(7).fill("Optional").map(String)];
  /** @param {string[]} skills */
  const read = (skills) => ({
    primary: "E",
    secondary: "any",
    attributes: [{ name: "air", rank: 10 }],
    skills,
  });

  it("builds a block by exact skill name, Optional slots empty, any secondary none", () => {
    expect(blockToBuild(read(eight("Gust (PvP)")), catalog)).toEqual({
      ok: true,
      build: {
        primaryProfession: "elementalist",
        secondaryProfession: undefined,
        attributes: [{ attributeId: "Air Magic", rank: 10 }],
        skillBar: ["gust", null, null, null, null, null, null, null],
      },
    });
  });

  it("leaves out a build whose skill name does not resolve exactly", () => {
    expect(blockToBuild(read(eight("gust")), catalog).ok).toBe(false);
  });

  /**
   * @param {(block: import("./import-dump.mjs").Block) => import("./import-dump.mjs").Encoded} encode
   * @param {Set<string>} [soloKeys]
   * @param {Set<string>} [teamNames]
   */
  const options = (encode, soloKeys = new Set(), teamNames = new Set()) => ({
    encode,
    soloKeys,
    teamNames,
  });
  /** @param {string} rating */
  const vetted = (rating) => `{{Real-Vetting|rating=${rating}|RA}}\n${block()}`;

  it("keeps the higher rated of one code under two names, and sorts by name", () => {
    const { solo } = importEntries(
      [
        { title: "A/E RA Zed", text: vetted("good") },
        { title: "A/E RA Bee", text: vetted("great") },
        { title: "A/E RA Cod", text: `{{Real-Vetting|rating=good|RA}}\n${block()}` },
      ],
      options((b) => ({ ok: true, code: b.primary })),
    );
    expect(solo.map((entry) => entry.name)).toEqual(["Bee"]);
  });

  it("skips a present name, an illegal build, and a team of a size there is not", () => {
    const pages = [
      { title: "A/E RA Have", text: vetted("good") },
      { title: "A/E RA Bad", text: vetted("good") },
      {
        title: "Team - RA Trio",
        text: `{{Real-Vetting|rating=good|RA}}\n${block()}${block()}${block()}`,
      },
      { title: "Team - RA Pair", text: `{{Real-Vetting|rating=good|RA}}\n${block()}${block()}` },
    ];
    const { solo, teams, dropped } = importEntries(
      pages,
      options(() => ({ ok: true, code: "c" }), new Set(["A_E RA Have"])),
    );
    expect(solo.map((entry) => entry.name)).toEqual(["Bad"]);
    expect(teams.map((team) => team.name)).toEqual(["RA Pair"]);
    expect(dropped).toEqual({ "team size": 1 });
    expect(
      importEntries(
        pages.slice(1, 2),
        options(() => ({ ok: false, reason: "no" })),
      ).solo,
    ).toEqual([]);
  });
});
