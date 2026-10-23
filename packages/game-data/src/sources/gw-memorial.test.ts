import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseGwMemorialSkill } from "./gw-memorial.js";

const FIXTURES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../__fixtures__");

function fixture(name: string): string {
  return readFileSync(resolve(FIXTURES_DIR, name), "utf8");
}

const BASE_INPUT = {
  id: "test.fixture",
  profession: "warrior",
  url: "https://www.gw-memorial.net/skills/Warrior/10-Swift_Chop",
  fetchedAt: "2026-10-23T00:00:00.000Z",
};

describe("parseGwMemorialSkill", () => {
  it("parses an adrenaline attack skill (Swift Chop)", () => {
    const result = parseGwMemorialSkill({
      ...BASE_INPUT,
      html: fixture("warrior-swift-chop.html"),
    });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;

    expect(result.skill.name).toBe("Swift Chop");
    expect(result.skill.attribute).toBe("Axe Mastery");
    expect(result.skill.campaign).toBe("Core");
    expect(result.skill.type).toBe("Axe attack.");
    expect(result.skill.elite).toBe(false);
    expect(result.skill.cost).toEqual({ kind: "energy", amount: 5 });
    expect(result.skill.rechargeSeconds).toBe(4);
    expect(result.skill.activationSeconds).toBe(0);
    expect(result.skill.description).toContain("Deep Wound");
    expect(Object.keys(result.skill.unmapped)).toHaveLength(0);
  });

  it("parses an adrenaline-cost skill and distinguishes it from energy (Whirlwind Attack)", () => {
    const result = parseGwMemorialSkill({
      ...BASE_INPUT,
      html: fixture("warrior-whirlwind-attack.html"),
    });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;

    expect(result.skill.name).toBe("Whirlwind Attack");
    expect(result.skill.cost).toEqual({ kind: "adrenaline", amount: 6 });
    expect(result.skill.rechargeSeconds).toBe(1);
    // A real, GW1-correct quirk this fixture captures: Whirlwind Attack's
    // in-source attribute is the Nightfall title track "Sunspear rank",
    // not a combat attribute — captured verbatim, not guessed at.
    expect(result.skill.attribute).toBe("Sunspear rank");
    expect(result.skill.campaign).toBe("Nightfall");
  });

  it("parses a fractional cast time (quarter-second) (Contemplation of Purity)", () => {
    const result = parseGwMemorialSkill({
      ...BASE_INPUT,
      html: fixture("monk-contemplation-of-purity.html"),
    });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;

    expect(result.skill.name).toBe("Contemplation of Purity");
    expect(result.skill.cost).toEqual({ kind: "energy", amount: 5 });
    expect(result.skill.activationSeconds).toBe(0.25);
    expect(result.skill.rechargeSeconds).toBe(10);
    expect(result.skill.type).toBe("Skill.");
  });

  it("detects an elite skill and strips the 'Elite ' prefix from type (Backbreaker)", () => {
    const result = parseGwMemorialSkill({
      ...BASE_INPUT,
      html: fixture("warrior-backbreaker.html"),
    });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;

    expect(result.skill.name).toBe("Backbreaker");
    expect(result.skill.elite).toBe(true);
    expect(result.skill.type).toBe("Hammer attack.");
    expect(result.skill.cost).toEqual({ kind: "adrenaline", amount: 9 });
    // This skill's current revision shows no recharge dot at all; absence
    // means 0, not "unknown".
    expect(result.skill.rechargeSeconds).toBe(0);
  });

  it("carries the caller-supplied id, profession, url, and fetchedAt through verbatim", () => {
    const result = parseGwMemorialSkill({
      ...BASE_INPUT,
      id: "warrior.swift-chop",
      profession: "warrior",
      html: fixture("warrior-swift-chop.html"),
    });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;

    expect(result.skill.id).toBe("warrior.swift-chop");
    expect(result.skill.profession).toBe("warrior");
    expect(result.skill.source).toEqual({
      name: "gw-memorial.net",
      url: BASE_INPUT.url,
      fetchedAt: BASE_INPUT.fetchedAt,
    });
  });

  it("marks completely unrecognizable HTML as unsupported rather than guessing", () => {
    const result = parseGwMemorialSkill({
      ...BASE_INPUT,
      html: "<!doctype html><html><body><p>not a skill page</p></body></html>",
    });
    expect(result.kind).toBe("unsupported");
    if (result.kind !== "unsupported") return;
    expect(result.reason.length).toBeGreaterThan(0);
  });

  it("marks a page missing an Attribute/Campaign line as unsupported", () => {
    const html = `<!doctype html><html><body>
      <div class="skill_prim_info skill_infoCurrent">
        <span class="typo_li_b">Mystery Skill</span>
      </div>
      <div class="skill_info skill_infoCurrent"><b>5</b><span class="skillsDotsRevision energy"></span></div>
      <div class="historyDescription_prim"><span class="skill-type">Spell.</span> Does a thing.</div>
    </body></html>`;
    const result = parseGwMemorialSkill({ ...BASE_INPUT, html });
    expect(result.kind).toBe("unsupported");
  });
});
