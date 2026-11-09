import { describe, expect, it } from "vitest";

import { SKILLS_BY_ID } from "./catalog.js";
import { describeSkill } from "./describe.js";
import { EN_NAMES, EN_WORDS, type DescribeNames, type DescribeWords } from "./describe-words.js";

const wrap = (text: string): string => `«${text}»`;
const unwrapped = (text: string): string => text.replaceAll(/[«»]/g, "");

/** `table`, each thing it says marked: its functions' results, and its strings. */
function marked(value: unknown): unknown {
  if (typeof value === "string") {
    return wrap(value);
  }
  if (typeof value === "function") {
    return (...args: unknown[]): unknown => {
      const result: unknown = (value as (...all: unknown[]) => unknown)(...args);
      return typeof result === "string" ? wrap(result) : result;
    };
  }
  if (value instanceof Map) {
    return new Map([...value].map(([key, inner]) => [key, marked(inner)]));
  }
  if (Array.isArray(value)) {
    return value.map(marked);
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, marked(inner)]));
  }
  return value;
}

// `secondPerson` reads the English verb it is given, so its input stays plain.
const FAKE_WORDS = {
  ...(marked(EN_WORDS) as DescribeWords),
  secondPerson: (phrase: string) => wrap(EN_WORDS.secondPerson(unwrapped(phrase))),
};
const FAKE_NAMES = marked(EN_NAMES) as DescribeNames;

/** `text` with everything inside the marks gone, nesting included. */
function outsideMarks(text: string): string {
  let depth = 0;
  let outside = "";
  for (const character of text) {
    if (character === "«") {
      depth += 1;
    } else if (character === "»") {
      depth -= 1;
    } else if (depth === 0) {
      outside += character;
    }
  }
  return outside;
}

const all = [...SKILLS_BY_ID.values()];
const sample = Array.from({ length: 50 }, (_, index) => {
  const skill = all[Math.floor((index * all.length) / 50)];
  if (skill === undefined) {
    throw new Error("the catalog has fewer than 50 skills");
  }
  return skill;
});

describe("describe-words (#2664)", () => {
  it.each(sample.map((skill) => [skill.id, skill] as const))(
    "%s says nothing that is not from the table",
    (_id, skill) => {
      const description = describeSkill(skill, undefined, FAKE_WORDS, FAKE_NAMES);
      const said = [
        description.name,
        description.typeText,
        description.weaponText,
        description.attributeName,
        description.cost,
        description.castTime,
        description.recharge,
        description.rangeText,
        description.targetText,
        description.headline,
        ...description.effects.map(({ text }) => text),
      ].filter((text) => text !== undefined);
      for (const text of said) {
        expect(outsideMarks(text), text).not.toMatch(/[A-Za-z]/);
      }
    },
  );
});
