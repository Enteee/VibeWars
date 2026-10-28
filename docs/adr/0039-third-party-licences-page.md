# ADR-0039: Third-party credits and licences live on one Options page

## Status

Accepted (2026-10-28). Issue #1235, an operator rule.

## Context

The vendored gw-skilldata corpus (MIT, [ADR-0038](0038-skill-corpus.md))
ships to the browser since #1220. MIT asks for its notice in every copy,
and the client showed none. The first fix put a credit line beside the
skill library's corpus toggle, linking to a licence file the build
emitted. The operator rejected it: credits scattered over the UI, one
per feature that happens to use a third-party work, are not where anyone
looks for them and do not scale.

## Decision

**Every third-party credit and licence notice lives in Options →
Third-party licences, and nowhere else in the UI.** The section lists
`THIRD_PARTY_LICENCES` (`apps/web/src/ui/licences-section.ts`): each work's
name, what VibeWars uses it for, its source, its SPDX licence and its full
text, verbatim.

**The text has one source, the file vendored with the work.** It is
imported as a string (`?raw`), through the owning package's `exports`
where it lives in a package. It is never retyped into TypeScript or
copied under `public/`.

**Adding a vendored or bundled third-party work that requires a notice
adds its entry in the same pull request.**

## Consequences

- One place to check, for players and for reviewers: a PR that vendors a
  work and adds no entry is visibly incomplete.
- The texts are in the main bundle, a few kilobytes each. Cheap now; if
  the list grows large, the section can load them lazily.
- Our own licence (the root `LICENSE`, AGPL) is not on the page and is
  untouched: this page is for third-party notices only.
- npm dependencies the bundle includes (Phaser, Strudel...) are listed
  by the build, not by hand (#1242): `apps/web/plugins/licences.ts` writes
  `licences.json` from the bundle's modules, and fails on a licence
  outside its allowlist.

## Alternatives Considered

- **A credit beside each feature** (the corpus toggle): rejected by the
  operator, see Context.
- **A licence file served next to the build** (`licenses/*.txt`), linked
  from the UI: a second artefact to keep in step, and still needs a place
  in the UI to link from.
- **Minifier legal comments** (`/*!`): preserved or not depending on
  bundler settings, and no player reads the bundle.
