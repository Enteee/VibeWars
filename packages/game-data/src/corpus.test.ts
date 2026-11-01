import { IMPLEMENTED_SKILLS, PROFESSIONS } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { ATTRIBUTES_BY_GW_ID, corpusSkills, TYPES_BY_GW_ID } from "./corpus.js";
import { gwSkillDataDir, readGwSkillData } from "./sources/gw-skilldata.js";

describe("corpusSkills (#1220)", () => {
  const corpus = corpusSkills();
  const byId = new Map(corpus.map((skill) => [skill.gwId, skill]));
  const records = readGwSkillData(gwSkillDataDir());

  it("lists every GW1 PvP skill of a profession, once: 1,235 of the pinned data", () => {
    expect(corpus).toHaveLength(1235);
    expect(new Set(corpus.map((skill) => skill.gwId)).size).toBe(corpus.length);
    expect(byId.has(0)).toBe(false);
  });

  it("lists no PvE-only skill and no PvP variant: its base stands for it", () => {
    for (const skill of corpus) {
      const record = records.get(skill.gwId);
      expect(record?.pvp).toBe(false);
      expect(record?.pveOnly).toBe(false);
    }
    // Call of Haste (PvP) is 2657; Call of Haste is listed.
    expect(byId.has(2657)).toBe(false);
    expect(byId.get(415)?.name).toBe("Call of Haste");
  });

  it("takes numbers and text from the PvP variant where there is one", () => {
    // Crippling Anguish: 5 energy, 12 s in PvE; 10 and 20 in PvP.
    expect(byId.get(54)).toMatchObject({
      name: "Crippling Anguish",
      energy: 10,
      recharge: 20,
      description: records.get(records.get(54)?.splitId ?? -1)?.description,
    });
  });

  it("reads GW1's codes as ours", () => {
    expect(byId.get(415)).toMatchObject({
      profession: "ranger",
      attributeId: "ranger.beast-mastery",
      typeText: "Shout",
      skillType: "shout",
      elite: false,
    });
    expect(byId.get(2)).toMatchObject({
      name: "Resurrection Signet",
      profession: "common",
      attributeId: undefined,
    });
    // An item spell is ours (#1434).
    expect(byId.get(788)).toMatchObject({ typeText: "Item Spell", skillType: "item-spell" });
    // A Paragon echo is ours (#1423).
    expect(byId.get(1774)).toMatchObject({ typeText: "Echo", skillType: "echo" });
    // A flash enchantment is an enchantment, GW1's name kept (#1421).
    expect(TYPES_BY_GW_ID.get(33)).toEqual({
      text: "Flash Enchantment Spell",
      skillType: "enchantment",
    });
    // A form is a form (#1437): the Dervish Avatars.
    expect(TYPES_BY_GW_ID.get(15)).toEqual({ text: "Form", skillType: "form" });
    expect(byId.get(1522)).toMatchObject({ typeText: "Form", skillType: "form" });
  });

  it("has the catalog mark exactly its flash enchantments as flash (#1421)", () => {
    const flash = new Set(
      corpus.filter((skill) => skill.typeText === "Flash Enchantment Spell").map((s) => s.gwId),
    );
    for (const skill of IMPLEMENTED_SKILLS) {
      if (skill.gwId !== undefined && byId.has(skill.gwId)) {
        expect(skill.flash, skill.id).toBe(flash.has(skill.gwId));
      }
    }
  });

  it("has the catalog put every skill on the corpus's attribute (#1958)", () => {
    for (const skill of IMPLEMENTED_SKILLS) {
      const listed = skill.gwId === undefined ? undefined : byId.get(skill.gwId);
      if (listed !== undefined) {
        expect(skill.attributeId, skill.id).toBe(listed.attributeId);
      }
    }
  });

  it("gives every entry an attribute of ours, or none", () => {
    const ours = new Set(
      Object.values(PROFESSIONS).flatMap((profession) => profession.attributes.map((a) => a.id)),
    );
    for (const skill of corpus) {
      if (skill.attributeId !== undefined) {
        expect(ours.has(skill.attributeId)).toBe(true);
      }
    }
  });

  it("maps exactly the 42 attributes PROFESSIONS has", () => {
    const ours = Object.values(PROFESSIONS).flatMap((profession) =>
      profession.attributes.map((a) => a.id),
    );
    expect(ours).toHaveLength(42);
    expect([...ATTRIBUTES_BY_GW_ID.values()].sort()).toEqual([...ours].sort());
  });

  it("knows the type of every record it could list", () => {
    for (const record of records.values()) {
      if (record.gwId !== 0) {
        expect(TYPES_BY_GW_ID.has(record.typeGwId)).toBe(true);
      }
    }
  });
});
