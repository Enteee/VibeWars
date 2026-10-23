# @vibewars/game-data

The GW1 reference skill corpus pipeline (ADR-0004, project brief §7-§9).

```text
raw/         Unmodified cached HTML snapshots per skill, one per id, each
             with a `<id>.meta.json` provenance file (source URL, fetch
             date). Committed — this is the audit trail for where every
             normalized fact came from.
normalized/  Our own schema (schema.ts), one JSON file per skill,
             hand-auditable in diffs. Committed.
generated/   `skills.json` — the single bundle the runtime will consume.
             Rebuilt from normalized/ by the generate step; never
             hand-edited, never committed (see .gitignore).
src/
  sources/gw-memorial.ts   Parser for gw-memorial.net's skill pages.
  importer.ts              Fetch-or-reuse-cache -> parse -> validate -> write.
  generate.ts              normalized/*.json -> generated/skills.json.
  run-import.ts            The curated skill list + CLI entrypoint.
```

## Running the importer

```sh
pnpm --filter @vibewars/game-data build
node packages/game-data/dist/run-import.js
```

This re-fetches only skills that are not already cached under `raw/` (a
skill already cached is reused, never re-fetched), re-parses and
re-validates every skill in the curated list (`run-import.ts`), writes
`normalized/*.json`, and regenerates `generated/skills.json`. It prints a
coverage summary: imported / normalized / unsupported / rejected counts,
with the reason for every unsupported or rejected skill — nothing is ever
silently dropped.

## Adding a skill

1. Find its URL on <https://www.gw-memorial.net/skills/>.
2. Add `{ id, profession, url }` to `SKILL_SPECS` in `run-import.ts`. Use
   `profession.skill-slug` for `id`.
3. Run the importer. If it reports the skill as `unsupported`, the page's
   HTML didn't match what `sources/gw-memorial.ts` expects — check the
   reason, and if the site's markup genuinely changed, add a fixture under
   `src/__fixtures__/` and fix the parser against it (never guess at a
   field the parser can't confidently extract).

## Adding a second source

Only `gw-memorial.net` is wired up (ADR-0004 explains why: the Guild Wars
Wiki, the brief's first-named source, was unreachable — "undergoing
maintenance" — as of this pipeline's construction). Adding a second source
once reachable means a new `src/sources/<name>.ts` with its own parser
returning the same `NormalizedSkill` shape, plumbed into `importer.ts` the
same way `gw-memorial.ts` is — there is deliberately no abstract
multi-source plugin interface yet, since one real source doesn't justify
designing around a second hypothetical one.
