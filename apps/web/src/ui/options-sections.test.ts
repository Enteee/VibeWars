import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { t } from "../i18n/index.js";
import { availableLanguages } from "../i18n/languages.js";
import { STORAGE_NAMESPACE } from "../storage/namespace.js";
import { FakeElement } from "./fake-dom.test-support.js";
import { languageSection, setLanguageBusy } from "./language-section.js";
import { optionsSections } from "./options-sections.js";

/** This build's sections, as Options lists them. */
const SECTIONS = optionsSections(availableLanguages(), 0);

describe("optionsSections (#423)", () => {
  it("opens on Player (#1513), and no two sections share an id", () => {
    const ids = SECTIONS.map((section) => section.id);
    expect(ids[0]).toBe("player");
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has no licences: they live in Help (#2559)", () => {
    expect(SECTIONS.map((section) => section.id)).not.toContain("licences");
  });
});

describe("Options > Language (#2648)", () => {
  const stored = new Map<string, string>();
  beforeEach(() => {
    stored.clear();
    vi.stubGlobal("document", { createElement: () => new FakeElement() });
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
    });
  });
  afterEach(() => {
    setLanguageBusy(() => false);
    vi.unstubAllGlobals();
  });

  const mount = (reload: () => void): FakeElement => {
    const container = new FakeElement();
    languageSection(["en", "de", "ja"], reload).mount(container as unknown as HTMLElement);
    const [select] = container.all("language-select");
    if (select === undefined) {
      throw new Error("no language select");
    }
    return select;
  };

  it("is hidden with English alone, and after Player with a second language", () => {
    expect(optionsSections(["en"], 0).map((section) => section.id)).not.toContain("language");
    const sections = optionsSections(["en", "de"], 0);
    expect(sections[1]?.id).toBe("language");
    expect(sections[1]?.title).toBe(t("options.language"));
  });

  it("lists this build's languages (#2656)", () => {
    expect(SECTIONS.map((section) => section.id)).toContain("language");
    expect(availableLanguages()).toEqual([
      "en",
      "es",
      "de",
      "ja",
      "fr",
      "pt",
      "ru",
      "it",
      "nl",
      "pl",
      "tr",
      "id",
      "zh",
      "fa",
      "cs",
      "vi",
      "ko",
      "ar",
      "uk",
      "hu",
      "sv",
      "ro",
      "el",
      "da",
      "fi",
      "he",
      "sk",
      "th",
      "bg",
      "hr",
    ]);
  });

  it("offers each language in its own name, and a pick is stored and reloads", () => {
    const reload = vi.fn();
    const select = mount(reload);
    expect(select.children.map((option) => [option.value, option.textContent])).toEqual([
      ["en", "English"],
      ["de", "Deutsch"],
      ["ja", "日本語"],
    ]);
    expect(select.value).toBe("en");
    expect(select.disabled).toBe(false);
    select.value = "de";
    select.fire("change");
    expect(stored.get(`${STORAGE_NAMESPACE}.language`)).toBe("de");
    expect(reload).toHaveBeenCalledOnce();
  });

  it("is locked, and says why, while a reload would drop a lobby or a match", () => {
    setLanguageBusy(() => true);
    const reload = vi.fn();
    const select = mount(reload);
    expect(select.disabled).toBe(true);
    expect(select.title).toBe(t("options.languageBusy"));
    select.value = "de";
    select.fire("change");
    expect(reload).not.toHaveBeenCalled();
  });
});
