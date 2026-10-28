# ADR-0038: gw-skilldata is the skill corpus, vendored at a pinned commit

## Status

Accepted (2026-10-28). Issue #1207, the first child of #458. It amends
[ADR-0004](0004-skill-data.md).

## Context

Issue #458 wants the whole GW1 skill corpus as data: 1,330 skills, their PvP
splits, and GW1's own ids, which template codes (#494) carry. ADR-0004
named two sources. The Guild Wars Wiki's API has answered "undergoing
maintenance" since 2026-10-23. gw-memorial.net is scraped one page per
skill, which in practice imported 189 skills, and the scraper breaks
whenever the page layout changes.

[build-wars/gw-skilldata](https://github.com/build-wars/gw-skilldata)
(MIT, maintained) publishes the full table as JSON. It has every skill
and its PvP variant, linked by `split_id`. Each record carries the GW1
id, the numbers and the elite flag, and the English name and description
sit in a second file.

## Decision

**gw-skilldata is the corpus.** `packages/game-data/raw/gw-skilldata/`
holds `skilldata.json` and `skilldesc-en.json` unmodified, with upstream's
licence and a `meta.json` naming the repository and commit. Nothing is
fetched at build or run time. It is not an npm dependency: the npm
package's `es6/` build imports JSON it does not ship, and we need none of
its code.

**A re-pin is a pull request** that replaces the files and the commit
in `meta.json`. Its diff is the upstream change, and the tests that read
the corpus judge it.

`parseGwSkillData` validates every record and joins the two files;
`readGwSkillData` reads them from disk for it. A record that does not
fit fails, naming its id. Ids and campaign codes stay GW1's numbers;
`corpus.ts` reads profession, attribute and type as ours for the skill
library (#1220).

**Every catalog skill names its GW1 id** (`Skill.gwId`): the base
record's, never the PvP variant's, matched by exact name. A skill this
game made up has none. The coverage gate holds both rules.

**GW1's description text is kept.** Operator decision D-1 (#458) makes
it the in-game description, so ADR-0004's rule against reproducing prose
does not apply to `skilldesc-en.json`.

gw-memorial stays until a later #458 child moves its cross-checks
(elite, upkeep, numbers) onto this source and deletes it.

## Consequences

- The full table is 1.1 MB of JSON in the repository. The browser
  fetches it, as a chunk of its own, only once a player turns on the
  library's "Show skills not in the game yet" (#1220).
- Upstream fixes reach us only through a re-pin. That is deliberate: no
  number changes without a diff.
- Two sources overlap until gw-memorial is retired.

## Alternatives Considered

- **Guild Wars Wiki API**: down for maintenance since 2026-10-23.
- **More gw-memorial scraping**: one page per skill, 189 so far, and
  fragile to layout changes.
- **The npm package**: its ES module build does not resolve.
