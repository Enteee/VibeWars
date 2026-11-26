import { EN_WORDS, type DescribeNames, type DescribeWords } from "@vibewars/game-core";

import { attributeName, professionName, skillName, statusName } from "./game-names.js";

let words: DescribeWords = EN_WORDS;

/** Say descriptions with `table` from now on: the picked language's `describe.ts`. */
export function setDescribeWords(table: DescribeWords): void {
  words = table;
}

/** The sentences of a skill or status description, in the player's language (#2664). */
export function describeWords(): DescribeWords {
  return words;
}

/** The game-data names a description says, in the player's language (#2664). */
export function describeNames(): DescribeNames {
  return {
    skill: skillName,
    status: statusName,
    profession: professionName,
    attribute: attributeName,
  };
}
