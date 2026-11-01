import { IMPLEMENTED_SKILLS, PROFESSIONS, defaultEquipmentFor } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { exportBuild } from "./build-transfer.js";
import {
  ATTRIBUTE_IDS,
  decodeTemplate,
  encodeTemplate,
  looksLikeTemplate,
} from "./gw1-template.js";
import { CHARACTER_SCHEMA_VERSION, type StoredCharacter } from "./schema.js";

/**
 * A template code is untrusted text, like a JSON build: these tests hold
 * the codec to "never throw", and every refusal to its message.
 */

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * Bits written as the stream holds them, each field lowest bit first,
 * packed six to a character: the format by hand, not by the encoder.
 */
function pack(bits: string): string {
  let stream = bits.replace(/\s/g, "");
  while (stream.length % 6 !== 0) {
    stream += "0";
  }
  let code = "";
  for (let start = 0; start < stream.length; start += 6) {
    let sextet = 0;
    for (let bit = 0; bit < 6; bit += 1) {
      sextet |= Number(stream[start + bit]) << bit;
    }
    code += BASE64.charAt(sextet);
  }
  return code;
}

/** Type 14, version 0: every code's first byte. */
const HEADER = "0111 0000";
/** Eight empty 8-bit skill slots, after a width code of 0. */
const EMPTY_BAR = `0000 ${"0".repeat(64)}`;

const WARRIOR_MONK: StoredCharacter = {
  schemaVersion: CHARACTER_SCHEMA_VERSION,
  id: "local-1",
  name: "Hammer",
  primaryProfession: "warrior",
  secondaryProfession: "monk",
  attributes: [
    { attributeId: "warrior.strength", rank: 12 },
    { attributeId: "warrior.hammer-mastery", rank: 10 },
    { attributeId: "monk.healing-prayers", rank: 0 },
  ],
  skillBar: [
    "warrior.hammer-bash",
    "warrior.backbreaker",
    null,
    "monk.orison-of-healing",
    null,
    null,
    null,
    null,
  ],
  equipment: defaultEquipmentFor("warrior"),
  updatedAt: 1,
};

function decoded(code: string): StoredCharacter {
  const result = decodeTemplate(code, "local-2", 42);
  if (!result.ok) {
    throw new Error(result.problems.join("; "));
  }
  return result.character;
}

function problemsOf(code: string): readonly string[] {
  const result = decodeTemplate(code, "local-2", 42);
  return result.ok ? [] : result.problems;
}

describe("GW1 template codes (#494)", () => {
  it("round-trips professions, bought ranks and the bar, leaving rank 0 out", () => {
    const encoded = encodeTemplate(WARRIOR_MONK);
    if (!encoded.ok) {
      throw new Error(encoded.problem);
    }
    expect(encoded.code.startsWith("O")).toBe(true);
    const character = decoded(encoded.code);
    expect(character).toMatchObject({
      id: "local-2",
      updatedAt: 42,
      name: "Warrior/Monk build",
      primaryProfession: "warrior",
      secondaryProfession: "monk",
      skillBar: WARRIOR_MONK.skillBar,
      equipment: defaultEquipmentFor("warrior"),
    });
    expect(character.attributes).toEqual(
      expect.arrayContaining(WARRIOR_MONK.attributes.filter(({ rank }) => rank > 0)),
    );
    expect(character.attributes).toHaveLength(2);
  });

  it("reads a hand-built Warrior/Monk code with no ranks and an empty bar", () => {
    // 0111 type 14 | 0000 version | 00 width 4 | 1000 Warrior | 1100 Monk
    // | 0000 no attributes | 0000 width 4 | 0000 width 8 | 8 × 00000000.
    const code = pack(`${HEADER} 00 1000 1100 0000 0000 ${EMPTY_BAR}`);
    expect(code).toBe("OQMAAAAAAAAAAAAA");
    const character = decoded(code);
    expect(character).toMatchObject({
      name: "Warrior/Monk build",
      primaryProfession: "warrior",
      secondaryProfession: "monk",
      attributes: [],
      skillBar: [null, null, null, null, null, null, null, null],
    });
    expect(encodeTemplate(character)).toEqual({ ok: true, code });
  });

  it("reads wider fields than it writes", () => {
    // 10 width 6 | 100000 Warrior | 110000 Monk | 1000 one attribute
    // | 1000 width 5 | 10001 Strength (17) | 0011 rank 12 | 1000 width 9
    // | 101010101 Swift Chop (341) | 100110001 Orison of Healing (281) | 6 × 0.
    const code = pack(
      `${HEADER} 10 100000 110000 1000 1000 10001 0011 1000 101010101 100110001 ${"0".repeat(54)}`,
    );
    expect(code).toBe("OUwQEROqaGBAAAAAAAAA");
    expect(decoded(code)).toMatchObject({
      attributes: [{ attributeId: "warrior.strength", rank: 12 }],
      skillBar: [
        "warrior.swift-chop",
        "monk.orison-of-healing",
        null,
        null,
        null,
        null,
        null,
        null,
      ],
    });
  });

  it("reads a code GW1 players share as GW1 Memorial's decoder does", () => {
    // gw-memorial.net/templateDecoder: W/E, Air Magic 3, Strength 12, Axe
    // Mastery 12; the bar starts Eviscerate, and ends Resurrection Signet.
    const character = decoded("OQYTgmIL5QqQlqM9ca9nCAA");
    expect(character).toMatchObject({
      primaryProfession: "warrior",
      secondaryProfession: "elementalist",
      attributes: [
        { attributeId: "elementalist.air-magic", rank: 3 },
        { attributeId: "warrior.strength", rank: 12 },
        { attributeId: "warrior.axe-mastery", rank: 12 },
      ],
    });
    expect(character.skillBar[0]).toBe("warrior.eviscerate");
    expect(character.skillBar[2]).toBe("warrior.disrupting-chop");
    expect(character.skillBar[4]).toBe("elementalist.shock");
    expect(character.skillBar[5]).toBe("warrior.frenzy");
    expect(character.skillBar[7]).toBe("common.resurrection-signet");
  });

  it("names a build with no secondary for its primary alone, and writes none as 0", () => {
    const code = pack(`${HEADER} 00 1000 0000 0000 0000 ${EMPTY_BAR}`);
    const character = decoded(code);
    expect(character.name).toBe("Warrior build");
    expect(character.secondaryProfession).toBeUndefined();
    expect(encodeTemplate(character)).toEqual({ ok: true, code });
  });

  it("imports skills it does not have as empty slots, and says which", () => {
    const missing = [3000, 567, 104];
    const known = new Set(IMPLEMENTED_SKILLS.map((skill) => skill.gwId));
    expect(missing.filter((id) => known.has(id))).toEqual([]);
    const bits = (value: number, width: number): string =>
      Array.from({ length: width }, (_, bit) => String((value >> bit) & 1)).join("");
    // Width code 4: 12-bit skill ids.
    const bar = [341, ...missing, 0, 0, 0, 0].map((id) => bits(id, 12)).join(" ");
    const result = decodeTemplate(
      pack(`${HEADER} 00 1000 0000 0000 0000 0010 ${bar}`),
      "local-2",
      42,
    );
    expect(result).toMatchObject({
      ok: true,
      missingSkills: missing,
      character: { skillBar: ["warrior.swift-chop", null, null, null, null, null, null, null] },
    });
  });

  it("imports a code whose every skill is missing with an empty bar", () => {
    const bits = Array.from({ length: 12 }, (_, bit) => String((3000 >> bit) & 1)).join("");
    const result = decodeTemplate(
      pack(`${HEADER} 00 1000 0000 0000 0000 0010 ${bits.repeat(8)}`),
      "local-2",
      42,
    );
    expect(result).toMatchObject({ ok: true, missingSkills: Array(8).fill(3000) });
  });

  it("refuses a bar with a skill GW1 does not have", () => {
    const vital: StoredCharacter = {
      ...WARRIOR_MONK,
      primaryProfession: "necromancer",
      secondaryProfession: undefined,
      attributes: [],
      skillBar: ["necromancer.blood-renewal-lite", null, null, null, null, null, null, null],
    };
    expect(encodeTemplate(vital)).toEqual({
      ok: false,
      problem: "Vital Transfer is not a GW1 skill, so this build has no GW1 code.",
    });
  });

  it.each([
    ["a wrong type", pack(`1011 0000 00 1000 0000 0000 0000 ${EMPTY_BAR}`)],
    ["a wrong version", pack(`0111 1000 00 1000 0000 0000 0000 ${EMPTY_BAR}`)],
    ["a character outside base64", "OQMAAAAA-AAAAAAA"],
  ])("refuses %s as not a template", (_, code) => {
    expect(problemsOf(code)).toEqual(["This is not a GW1 skill template."]);
  });

  it("refuses a code cut short", () => {
    const code = pack(`${HEADER} 00 1000 1100 0000 0000 ${EMPTY_BAR}`);
    expect(problemsOf(code.slice(0, 10))).toEqual(["This GW1 code is cut short."]);
  });

  it("refuses no primary, a profession past the ten and an attribute it lacks, naming each", () => {
    expect(problemsOf(pack(`${HEADER} 00 0000 1100 0000 0000 ${EMPTY_BAR}`))).toEqual([
      "This GW1 code has no primary profession.",
    ]);
    // 1101: 11.
    expect(problemsOf(pack(`${HEADER} 00 1101 0000 0000 0000 ${EMPTY_BAR}`))).toEqual([
      "This GW1 code's primary profession 11 is not one of the ten.",
    ]);
    expect(problemsOf(pack(`${HEADER} 00 1000 1101 0000 0000 ${EMPTY_BAR}`))).toEqual([
      "This GW1 code's secondary profession 11 is not one of the ten.",
    ]);
    // One attribute, width 5: 01011 is 26, a PvE title track; rank 4.
    expect(problemsOf(pack(`${HEADER} 00 1000 0000 1000 1000 01011 0010 ${EMPTY_BAR}`))).toEqual([
      "GW1 attribute 26 is not in VibeWars.",
    ]);
  });

  it.each([
    // Strength (17) at rank 13: past the 12 a player can buy.
    ["rank 13", `${HEADER} 00 1000 1100 1000 1000 10001 1011 ${EMPTY_BAR}`, "rank 13"],
    // Fire Magic (10, 01010 at width 5) on a Warrior/Monk.
    [
      "an attribute neither profession has",
      `${HEADER} 00 1000 1100 1000 1000 01010 1010 ${EMPTY_BAR}`,
      "not accessible",
    ],
    // Swift Chop (341) twice, at width 9.
    [
      "the same skill twice",
      `${HEADER} 00 1000 1100 0000 0000 1000 ${"101010101".repeat(2)} ${"0".repeat(54)}`,
      "more than once",
    ],
  ])("refuses %s as a JSON build is refused", (_, bits, problem) => {
    expect(problemsOf(pack(bits))).toEqual([expect.stringContaining(problem)]);
  });

  it("maps exactly the attributes the professions have", () => {
    const ours = Object.values(PROFESSIONS).flatMap((profession) =>
      profession.attributes.map((attribute) => attribute.id),
    );
    expect(ours).toHaveLength(42);
    expect(Object.keys(ATTRIBUTE_IDS).sort()).toEqual([...ours].sort());
    expect(new Set(Object.values(ATTRIBUTE_IDS)).size).toBe(42);
  });

  it("tells a code from other pasted text", () => {
    expect(looksLikeTemplate("  OQMAAAAAAAAAAAAA==\n")).toBe(true);
    expect(looksLikeTemplate(exportBuild(WARRIOR_MONK))).toBe(false);
    expect(looksLikeTemplate('{"format":"vibewars.team","members":[]}')).toBe(false);
    expect(looksLikeTemplate("Okay")).toBe(false);
    expect(looksLikeTemplate("try OQMAAAAAAAAAAAAA")).toBe(false);
  });
});
