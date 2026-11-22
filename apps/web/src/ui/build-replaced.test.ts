import { describe, expect, it } from "vitest";

import { t } from "../i18n/index.js";
import type { StoredCharacter } from "../storage/schema.js";
import { newCharacter } from "./build-editor.js";
import { buildReplacedNotice } from "./build-replaced.js";
import { blockingProblems } from "./editor-problems.js";

/** Superior Vigor on the head and the chest: a duplicate, so illegal. */
function twoVigor(): StoredCharacter {
  const character = newCharacter("c1");
  const vigor = { kind: "universal", runeId: "vigor", tier: "superior" } as const;
  const { armor } = character.equipment;
  return {
    ...character,
    equipment: {
      ...character.equipment,
      armor: { ...armor, head: { ...armor.head, rune: vigor }, chest: { ...armor.chest, rune: vigor } },
    },
  };
}

describe("buildReplacedNotice (#3822)", () => {
  it("names the first problem of an illegal build", () => {
    const illegal = twoVigor();
    const problem = blockingProblems(illegal)[0]?.text;
    expect(problem).toBeDefined();
    expect(buildReplacedNotice(illegal, false)).toBe(t("match.buildReplaced", { problem }));
  });

  it("says nothing of a legal build", () => {
    expect(buildReplacedNotice(newCharacter("c1"), false)).toBeUndefined();
  });

  it("says nothing of a planned seat, which plays its lobby's build", () => {
    expect(buildReplacedNotice(twoVigor(), true)).toBeUndefined();
  });

  it("says nothing when no character is selected", () => {
    expect(buildReplacedNotice(undefined, false)).toBeUndefined();
  });
});
