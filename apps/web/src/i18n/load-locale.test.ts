import { afterEach, describe, expect, it, vi } from "vitest";

import { en } from "./en.js";
import { locale, setLocale, t } from "./index.js";
import type { LocaleTables } from "./languages.js";
import { loadLocale } from "./load-locale.js";

describe("loadLocale (#2656)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    setLocale("en", en);
  });

  it("boots in English when the language's chunk does not load", async () => {
    vi.stubGlobal("navigator", { languages: ["de"] });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const load = (): Promise<LocaleTables> => Promise.reject(new Error("offline"));
    await loadLocale({ de: load });
    expect(locale()).toBe("en");
    expect(t("app.ownLobby")).toBe(en["app.ownLobby"]);
  });
});
