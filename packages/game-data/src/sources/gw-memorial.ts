import * as cheerio from "cheerio";

import type { NormalizedSkill } from "../schema.js";

/**
 * Parser for gw-memorial.net's skill detail pages (brief §7 names this
 * source explicitly). Reverse-engineered from real saved pages — see
 * `src/__fixtures__/*.html` — not from any published API, since the site
 * does not expose one.
 *
 * The page renders the *current* balance revision first, followed by a
 * history table of older revisions using the same CSS classes. Every
 * selector below takes the *first* match for exactly that reason; this is
 * brittle to a page-layout change, which is why the fixture tests exist —
 * a layout change should fail a test, not silently misparse live data.
 */

export type GwMemorialParseResult =
  | { readonly kind: "ok"; readonly skill: NormalizedSkill }
  | { readonly kind: "unsupported"; readonly reason: string };

const FRACTION_GLYPHS: Readonly<Record<string, number>> = {
  "¼": 0.25,
  "½": 0.5,
  "¾": 0.75,
};

function parseDotValue(text: string): number | undefined {
  const trimmed = text.trim();
  const fraction = FRACTION_GLYPHS[trimmed];
  if (fraction !== undefined) {
    return fraction;
  }
  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export interface ParseGwMemorialSkillInput {
  readonly html: string;
  readonly id: string;
  readonly profession: string;
  readonly url: string;
  readonly fetchedAt: string;
}

export function parseGwMemorialSkill(input: ParseGwMemorialSkillInput): GwMemorialParseResult {
  const $ = cheerio.load(input.html);

  const nameEl = $(
    ".skill_prim_info.skill_infoCurrent .typo_li_b, .skill_prim_info.skill_infoCurrent .typo_li_elite_b",
  ).first();
  const name = nameEl.text().trim();
  if (name === "") {
    return { kind: "unsupported", reason: "could not find a skill name" };
  }

  const dotsRow = $(".skill_info.skill_infoCurrent").eq(0);
  const unmapped: Record<string, unknown> = {};
  let cost: NormalizedSkill["cost"];
  let overcast = 0;
  let activationSeconds = 0;
  let rechargeSeconds = 0;

  dotsRow.find("span.skillsDotsRevision").each((_index, el) => {
    const span = $(el);
    const classes = (span.attr("class") ?? "").split(/\s+/);
    const kind = classes.find((c) => c !== "skillsDotsRevision");
    const valueText = span.prev("b").text();
    const value = parseDotValue(valueText);

    if (kind === undefined || value === undefined) {
      unmapped[`dots[${String(Object.keys(unmapped).length)}]`] = {
        classes,
        valueText,
      };
      return;
    }

    switch (kind) {
      case "energy":
      case "adrenaline":
        cost = { kind, amount: value };
        break;
      case "exhaustion":
        // GW1 renamed exhaustion to overcast in 2012 (#461).
        overcast = value;
        break;
      case "cast":
        activationSeconds = value;
        break;
      case "recharge":
        rechargeSeconds = value;
        break;
      default:
        // An unrecognized resource-dot kind: preserved, not guessed at.
        unmapped[`cost.${kind}`] = value;
    }
  });

  const attributeLine = $(".skill_info.skill_infoCurrent").eq(1).text();
  const attributeMatch = /Attribute:\s*([^·]+?)\s*(?:·|$)/.exec(attributeLine);
  const campaignMatch = /Campaign:\s*([^.]+)\./.exec(attributeLine);
  const attribute = attributeMatch?.[1]?.trim();
  const campaign = campaignMatch?.[1]?.trim();
  if (attribute === undefined || attribute === "") {
    return { kind: "unsupported", reason: "could not find an Attribute: line" };
  }
  if (campaign === undefined || campaign === "") {
    return { kind: "unsupported", reason: "could not find a Campaign: line" };
  }

  const descriptionBlock = $(".historyDescription_prim").eq(0);
  const skillType = descriptionBlock.find(".skill-type").first().text().trim();
  if (skillType === "") {
    return { kind: "unsupported", reason: "could not find a skill-type sentence" };
  }
  const fullText = descriptionBlock.text().trim();
  const description = fullText.startsWith(skillType)
    ? fullText.slice(skillType.length).trim()
    : fullText;
  if (description === "") {
    return {
      kind: "unsupported",
      reason: "description was empty after removing the type sentence",
    };
  }

  const elite = skillType.startsWith("Elite ");
  const type = elite ? skillType.replace(/^Elite\s+/, "") : skillType;

  return {
    kind: "ok",
    skill: {
      id: input.id,
      name,
      profession: input.profession,
      attribute,
      type,
      elite,
      campaign,
      cost,
      overcast,
      activationSeconds,
      rechargeSeconds,
      description,
      variant: "pvp",
      ruleset: "gw1-reference",
      source: {
        name: "gw-memorial.net",
        url: input.url,
        fetchedAt: input.fetchedAt,
      },
      unmapped,
    },
  };
}
