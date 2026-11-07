import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { afterAll, describe, it } from "vitest";

import { noRawUiText } from "./no-raw-ui-text.mjs";

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({ languageOptions: { parser: tseslint.parser } });
const raw = [{ messageId: "raw" }];
const UI = "apps/web/src/ui/screen.ts";

tester.run("no-raw-ui-text (#2648)", noRawUiText, {
  valid: [
    `h("span", "x", t("matches.won"));`,
    `h("span", "x", "×");`,
    `h("span", "x-class");`,
    `button("·", "x", () => {});`,
    `button(t("matches.clone"), "x", () => {});`,
    `el.textContent = "3";`,
    `el.textContent = name;`,
    `el.textContent = \`\${count}/\${max}\`;`,
    `el.className = "match-row";`,
    `el.setAttribute("role", "tab");`,
    `el.setAttribute("aria-label", t("matches.clone"));`,
    `h("span", "x", won ? t("matches.won") : "—");`,
    { code: `export const NO_MATCHES_LINE = t("matches.noMatches");`, filename: UI },
    { code: `export const MATCHES_KEPT = 100;`, filename: UI },
    // Outside ui/, a constant's name says nothing.
    { code: `export const SOME_LABEL = "Thing";`, filename: "apps/web/src/net/thing.ts" },
  ],
  invalid: [
    { code: `h("span", "x", "Won");`, errors: raw },
    { code: `h("span", "x", \`\${n} min ago\`);`, errors: raw },
    { code: `button("Clone", "x", () => {});`, errors: raw },
    { code: `el.textContent = "No matches yet.";`, errors: raw },
    { code: `el.innerText = "Hi";`, errors: raw },
    { code: `el.title = "Published by the host";`, errors: raw },
    { code: `input.placeholder = "Search";`, errors: raw },
    { code: `img.alt = "Warrior";`, errors: raw },
    { code: `el.setAttribute("aria-label", "Options");`, errors: raw },
    { code: `el.setAttribute("title", "Options");`, errors: raw },
    { code: `el.setAttribute("placeholder", "Name");`, errors: raw },
    { code: `h("span", "x", won ? "Won" : "Lost");`, errors: [...raw, ...raw] },
    { code: `el.textContent = name || "Nobody";`, errors: raw },
    { code: `el.textContent = name ?? "Nobody";`, errors: raw },
    { code: `el.textContent = \`\${won ? "Won" : "Lost"}\`;`, errors: [...raw, ...raw] },
    { code: `export const PARTY_ALONE_LINE = "Just you.";`, filename: UI, errors: raw },
    { code: `export const VOTE_HINT = "Click a card";`, filename: UI, errors: raw },
    { code: `export const BUSY_MESSAGE = "Busy";`, filename: UI, errors: raw },
    { code: `export const NAME_LABEL = "Name";`, filename: UI, errors: raw },
    { code: `export const NO_BUNDLE_NOTE = "Later";`, filename: UI, errors: raw },
    { code: `export const HELP_TEXT = "Help";`, filename: UI, errors: raw },
    { code: `export const SCREEN_GOAL = "Win";`, filename: UI, errors: raw },
  ],
});
