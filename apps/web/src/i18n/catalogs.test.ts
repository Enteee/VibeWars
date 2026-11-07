import { describe, expect, it } from "vitest";

import { en, type Catalog, type MessageKey } from "./en.js";
import { LANGUAGES, LOCALES } from "./languages.js";
import type { Message } from "./message.js";

/** Every locale file present, by its folder's code, English included. */
const files = import.meta.glob<{ default: Catalog }>("./locales/*/ui.ts", { eager: true });
const catalogs: [string, Catalog][] = [
  ["en", en],
  ...Object.entries(files).map(([path, module]): [string, Catalog] => [
    path.split("/")[2] ?? path,
    module.default,
  ]),
];

const placeholders = (message: Message): string[] =>
  (typeof message === "string" ? [message] : Object.values(message))
    .flatMap((text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? ""))
    .filter((name, index, all) => all.indexOf(name) === index)
    .sort();

describe.each(catalogs)("the %s catalog (#2648)", (code, catalog) => {
  const keys = Object.keys(en) as MessageKey[];

  it("is a language of the list, loaded lazily unless English", () => {
    expect(LANGUAGES.some((language) => language.code === code)).toBe(true);
    expect(code === "en" || code in LOCALES).toBe(true);
  });

  it("has English's placeholders in every message, and no empty one", () => {
    for (const key of keys) {
      expect(placeholders(catalog[key]), key).toEqual(placeholders(en[key]));
      const texts = typeof catalog[key] === "string" ? [catalog[key]] : Object.values(catalog[key]);
      expect(
        texts.every((text) => text.trim() !== ""),
        key,
      ).toBe(true);
    }
  });

  it("covers every plural category the language has", () => {
    const categories = new Intl.PluralRules(code).resolvedOptions().pluralCategories;
    for (const key of keys) {
      const message = catalog[key];
      if (typeof message !== "string") {
        expect(Object.keys(message).sort(), key).toEqual([...categories].sort());
      }
    }
  });
});
