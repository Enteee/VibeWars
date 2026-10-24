# ADR-0005: Browser Persistence

## Status

Accepted (2026-10-23); implementation begins Sprint 17 (characters/builds) and
Sprint 18 (teams). The migration-registry half is superseded by
[ADR-0013](0013-schema-migration-registry.md), which builds the registry this
ADR promised but that was never implemented. That migration clause is in
turn overturned by [ADR-0016](0016-no-backwards-compatibility.md): the
"versioned migration registry runs on load" bullet under Decision, and the
"dead code until the first schema change" bullet under Consequences, no
longer apply, and a stale record is discarded and reported instead.
**Everything else here still stands:** IndexedDB over `localStorage`, the
typed repository layer, `schemaVersion` on every record, validating twice,
and ruleset-driven limits.

## Context

Characters, builds, and teams are **client-local only** — the server is
intentionally volatile (brief §2, §22–§24, §26). Saved data must survive
browser/app updates via explicit schema versioning and migration functions,
and the brief flags that skill/build volume may eventually justify
IndexedDB over `localStorage`.

## Decision

- Use **IndexedDB** from the start, not `localStorage`, accessed through a
  small typed repository layer in a future `apps/web/src/storage` module —
  not a generic ORM, just typed `get`/`put`/`list` functions per entity
  (character, build, team), per brief §30 ("do not over-engineer simple
  things"). `localStorage` is rejected up front rather than started with and
  migrated later, because the brief's own reasoning ("thousands of
  skills/builds may exist") is already true the day the build editor ships
  real skill data from Sprint 9 — migrating a live user's saved builds
  between storage backends is exactly the kind of one-way data risk worth
  avoiding by choosing correctly up front.
- Every persisted record carries an explicit `schemaVersion: number` field.
  A versioned migration registry (`v1 -> v2`, `v2 -> v3`, ...) runs on load;
  a record whose version has no migration path forward fails loudly (a
  visible error to the player) rather than silently discarding or
  corrupting saved data (brief §22: "Never make stored browser data silently
  incompatible").
- Validation happens **twice**: once before writing (reject an invalid build
  before it is saved) and once after reading (reject/upgrade a record that
  somehow became invalid), per brief §23.
- The skill-bar slot count and other ruleset-dependent limits (brief §23: "The
  exact number of skill slots must be configurable in the ruleset, even if
  v1 uses 8") are read from the active ruleset (ADR-0003's simulation
  config family), not hardcoded in the storage layer.

## Consequences

- IndexedDB's asynchronous API means every storage read/write in the UI layer
  is a Promise; the build/team editors (Sprint 17/18) are written against
  that from the start rather than retrofitted.
- A versioned migration registry is dead code until the first schema change
  actually happens — accepted as the minimum viable version of "never break
  saved data," rather than the alternative of adding versioning reactively
  after a real user's data has already been silently corrupted once.

## Alternatives Considered

- **`localStorage` now, migrate to IndexedDB later "if needed."** Rejected:
  the brief already names the condition ("thousands of skills/builds") that
  triggers the migration, and that condition is met by Sprint 9's skill
  corpus — "later" is foreseeably almost immediately, so the migration cost
  would be paid regardless, with the added risk of a live-data migration.
- **A generic client-side ORM/IndexedDB wrapper library.** Rejected per
  brief §30/§44: a handful of typed repository functions is simpler, fully
  typed without external `.d.ts` guesswork, and sized to the four entity
  types (character, build, team, plus future settings) this project actually
  has.
