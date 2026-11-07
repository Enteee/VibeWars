# ADR-0050: Player-facing text goes through t() and TypeScript tables

## Status

Accepted (2026-11-07). Issue #2648, epic #2644, operator request: the 30 most written languages.

## Context

Every player-facing string in `apps/web` is an English literal at the point it is drawn. The operator wants the game in the 30 languages most written on the web (W3Techs, 2026-11-07), game data and Help included. That needs one place where text lives, a way to pick the language, and a check that keeps new raw text out while about forty files are moved over, card by card, by agents working in parallel.

## Decision

**English is a TypeScript table, the source of truth.** `apps/web/src/i18n/en.ts` is an `as const` object of `"<screen>.<camelCase>"` keys to messages. A message is text with `{name}` placeholders, or a plural `{ zero?, one?, two?, few?, many?, other }` that `Intl.PluralRules` picks by the `count` parameter. Each language is a folder, `i18n/locales/<code>/`, whose `ui.ts` is `satisfies Catalog`: the same keys as English, no other. `tsc` therefore catches a missing key, an extra one and a typo in `t("…")`, with no loader and no JSON schema. `catalogs.test.ts` checks every locale has English's placeholders and its language's plural categories.

**No i18n library.** `t()`, `formatNumber()` and `formatList()` are a few lines over `Intl` (`PluralRules`, `NumberFormat`, `ListFormat`), which covers everything the game says.

**The language is read once, at startup.** The stored pick, else the first of `navigator.languages` the build has (by primary subtag, so `de-CH` gets `de` and `zh-TW` gets the only Chinese), else English. A non-English table is its own lazy chunk; `main.ts` awaits it before the first screen. Options → Language stores a pick and reloads the page, so no screen needs to re-render when the language changes, and none carries observer plumbing. A reload is refused while it would drop the player out of a lobby with others, a queue or a match. `<html lang>` and `dir` follow the language.

**`t()` runs at render, never on data.** Nothing stored, sent or signed is translated: default build and character names, match records, chat and system lines, and wire reasons stay codes or English data, and the UI words a code when it shows it. A German host never writes German into anyone else's record. Strings built in `game-core` or `game-session` that the UI shows become codes worded in the UI (the wire refusals card); anything else found stays English and is listed here.

**Keys stay sorted and grouped by screen** in `en.ts` and every locale. A new key is inserted in its place, never appended, so parallel PRs touch different hunks.

**A lint rule ratchets it in.** `eslint/no-raw-ui-text.mjs` reports a literal with a letter in it passed to `h()` as text, to `button()` as its label, assigned to `textContent`, `innerText`, `title`, `placeholder` or `alt`, set as `aria-label`, `title` or `placeholder`, or exported from `ui/` as a `*_LINE`/`*_HINT`/`*_MESSAGE`/`*_LABEL`/`*_NOTE`/`*_TEXT`/`*_GOAL` constant. It looks through `?:`, `||`, `??` and template literals. `eslint.config.mjs` lists the files not yet moved over; each extraction card deletes its files from that list, and the last deletes the list.

**Tests and e2e run in English.** Unit tests compare with `t("key")`, never a copy of the English text; e2e selectors stay English (Chromium runs `en-US`).

## Consequences

- Every player-facing string costs a key in `en.ts` and a translation in each locale in the same PR (`CLAUDE.md`). `pnpm lint` fails otherwise.
- Game data names, skill descriptions and the `docs/player` Help pages are translated by their own cards of #2644, not through `en.ts`. Player names and licence texts stay as written.
- A missing `t()` parameter throws in development and tests, and shows as `{name}` in a production build.

## Alternatives Considered

- **JSON catalogs** with a key-extraction tool: a typo in a key is found at runtime, and the build needs a loader. Rejected.
- **A library** (i18next, FormatJS): more than `Intl` already gives, plus a dependency to keep current. Rejected.
- **Live re-render on a language change**: every screen would subscribe to the language. A reload is simpler, and changing language is rare.
