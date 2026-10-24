# ADR-0013: The schema migration registry

## Status

Accepted (2026-10-24). Supersedes the migration half of
[ADR-0005](0005-persistence.md); the rest of ADR-0005 (IndexedDB, the
repository layer, validate-twice) stands unchanged.

## Context

ADR-0005 promised "a versioned migration registry (`v1 -> v2`,
`v2 -> v3`, ...) [that] runs on load". It was never built. What shipped
was a boundary check:

```ts
export function migrate<T extends { readonly schemaVersion: number }>(record: T): T {
  if (record.schemaVersion === CURRENT_SCHEMA_VERSION) return record;
  if (record.schemaVersion > CURRENT_SCHEMA_VERSION) throw new PersistenceError(/* newer game */);
  throw new PersistenceError(`Unknown schema version ...`);
}
```

The code comment claimed "the registry exists now rather than later". It
did not. The moment `CURRENT_SCHEMA_VERSION` moved, every legitimate v1
record would fall through to that last `throw` — reported to the player
as "Unknown schema version 1", which is silent data loss wearing a
polite error message.

Three further traps were waiting:

1. **Order.** Both repositories ran `isStoredCharacter(raw)` _before_
   `migrate(raw)`. Tightening the guard to require the new field would
   make every v1 record fail it and never reach the migration at all.
2. **One constant, two entities.** `migrate<T>` was generic over both
   characters and teams, and both repositories refused to `save` a
   record whose version did not equal the single shared constant.
   Bumping it for a character change would break team saves until teams
   got a no-op re-version — a tax payable again at every future
   character change.
3. **A third, independent version.** `BUILD_FORMAT_VERSION` in
   `build-transfer.ts` refused anything not exactly equal to itself.
   Bumping it would invalidate every build string anyone had ever
   pasted into a chat window.

ADR-0012 changes the character shape, so all three had to be addressed
before any gear could land.

## Decision

**Build the registry for real, stepwise.** A shared driver walks a
record forward one version at a time, consulting a per-entity map keyed
by the version it upgrades _from_. A v1 record and a future v4 record
reach the present by the same route; the alternative is a combinatorial
pile of direct old-shape-to-new-shape conversions, every one of which
has to be maintained. The driver also asserts that each step actually
advances the version, because a step that does not would spin forever —
a hung tab is a worse failure than a visible error.

**Migrate first, validate second.** `migrateCharacter` and
`migrateTeam` replace the generic `migrate<T>`. The current structural
guard describes the _current_ shape and nothing else; asking it whether
a v1 record is valid has only one honest answer, and it is not the one
the caller wants. Each migration step carries its own narrow input
guard, so "malformed v1" and "no migration path" stay distinguishable in
the message a player reads.

**Freeze the old shapes.** `storage/schema-v1.ts` holds verbatim copies
of the pre-equipment interfaces, with a header saying never to edit
them. Steps are typed `(v1) => v2` and checked by the compiler rather
than shuffling `Record<string, unknown>` around. The temptation when a
later version renames a field is to "fix" the old interface to match;
doing that silently breaks every migration that reads it, because a v1
record on a real player's disk does not change when we change our minds.

**Version per entity.** `CHARACTER_SCHEMA_VERSION = 2` and
`TEAM_SCHEMA_VERSION = 1` move independently. Teams have not changed
shape and are not re-versioned.

**A bounded backward window for shared builds.**
`BUILD_FORMAT_VERSION = 2` is what we write;
`MIN_SUPPORTED_BUILD_FORMAT_VERSION = 1` is the oldest we read. The
_forward_ direction stays strict — importing and then saving a v3 build
on a v2 client would drop fields it does not know about, which is data
loss dressed as success. Backward, an older payload is routed through
**the same migration steps** the storage path uses. One set of upgrade
rules, two entry points; otherwise the profession-to-default-weapon
table gets written twice and the two copies disagree within a month.

**`DB_VERSION` stays at 1.** It governs object stores and indexes, not
record shape. No store was added. Bumping it would fire
`onupgradeneeded` to do nothing while conflating two independent
concepts. Stated here explicitly as a non-decision, because the next
contributor will otherwise "fix" it.

## Consequences

Saved characters survive the upgrade and arrive armed with their
profession's default kit. Shared build strings from before this change
still import. Future schema changes have a real place to go.

Costs:

- `migrate` is gone, and four call sites changed with it.
- Three version constants now exist where there were two, and the two
  storage ones can drift apart — which is the point, but it is more to
  hold in your head.
- Every migration step is permanent. The v1 types are frozen forever,
  and `characterV1ToV2` will still be here in five years.
- Fixtures must be **frozen JSON literals**, not objects built from
  current types. A fixture built from `StoredCharacter` silently tracks
  every refactor and stops being a v1 record — which is exactly when it
  stops testing anything. `schema.test.ts` and `repository.test.ts` both
  carry such literals with a comment saying so.

## Alternatives Considered

**Keep one shared constant and write an identity migration for teams.**
Three lines today; a recurring tax at every future character change, and
a growing list of no-op steps that exist only to keep two unrelated
entities in lockstep.

**Tighten `isStoredCharacter` to accept both v1 and v2 shapes.**
Rejected: the guard would stop describing anything in particular, and
every future version would loosen it further until it validated nothing.

**Keep `migrate<T>` generic and dispatch on a discriminator field.**
Rejected: records have no entity tag, and adding one to every stored
record to avoid two small functions is the wrong trade.

**Let `BUILD_FORMAT_VERSION` stay strict and accept the breakage.**
Rejected outright. The sharing feature's whole value is that a string
pasted into chat keeps working; a version bump that silently retires
every previously shared build has broken it for exactly the people who
used it most.
