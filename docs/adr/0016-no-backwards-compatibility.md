# ADR-0016: No backwards compatibility before 1.0

## Status

Accepted (2026-10-24). Supersedes
[ADR-0013](0013-schema-migration-registry.md) in full, the migration
clause of [ADR-0005](0005-persistence.md), and the "a missing
`equipment` key is not an error" clause of
[ADR-0012](0012-equipment.md). Revisit at the first tagged release (see
below).

## Context

vibewars has no tagged release and no deployed version. Nobody outside
the people building it has ever saved a character. Yet the repository
carried a frozen `schema-v1.ts`, a stepwise migration registry with a
per-entity step map, `MIN_SUPPORTED_BUILD_FORMAT_VERSION` as a "bounded
backward window" for shared builds, a `fallbackProfession` parameter
threaded through `game-core` to fill in gear old data lacked, and about
twenty-five tests asserting all of it. The oldest data any of it
protected, a character saved before equipment existed, was introduced
and superseded on the same day and never left a developer's browser.

ADR-0013 deserves a straight answer rather than a dismissal: given its
premise, it is right. If saved data must survive, a stepwise registry
beats a pile of direct conversions, migrate-before-validate is the only
correct order, and per-entity versions avoid a recurring tax. Its own
Consequences section names the price: "every migration step is
permanent… `characterV1ToV2` will still be here in five years." That
price is paid on every future schema change, by whoever makes it, and
any agent that reads ADR-0013 will keep paying it.

**ADR-0013 solved the problem correctly. The problem should not exist
yet.** The premise is what this ADR rejects.

## Decision

**The current shape is the only shape.** Before 1.0, nothing in this
repository tolerates data produced by an older build of the project.
Concretely:

- **Stored records** carry `schemaVersion`, and the structural guards
  require it to equal the current constant. A record that fails, at any
  other version or of any other shape, is deleted from IndexedDB, and
  the menu says so once in plain English through the existing
  `problems` channel. It is not migrated, not silently dropped, and not
  a hard failure.
- **Shared build strings** are read only at exactly
  `BUILD_FORMAT_VERSION`. Any other version, older or newer, is refused
  with a message asking for a fresh copy. A build without `equipment`
  is malformed.
- **Gear is required.** `parseBuildEquipment` and `parsePlayerBuild`
  treat absent gear like any other missing field. On the server that
  sends such a join down the existing invalid-build path to the house
  loadout.
- **`PROTOCOL_VERSION` is enforced.** Clients send it on every create
  and join; both rooms refuse an absent or different value as the first
  thing `onJoin` does, telling the player to reload.

**The line to hold: a version may reject, never adapt.** A version
field whose only job is to refuse a mismatch is wanted. All three above
are of that kind. A version that selects between code paths is what is
banned.

What this does **not** change, because it handles _wrong_ data rather
than _old_ data:

- IndexedDB over `localStorage`, the repository layer, and validating
  both before writing and after reading (ADR-0005) all stand.
- `DB_VERSION` stays `1`, and `onupgradeneeded` keeps its
  `objectStoreNames.contains` guards. That creates stores; it is not an
  upgrade path. ADR-0013 was right about this.
- The server's house-loadout fallback for an invalid build, the
  unknown-map fallback, and Quick Match (joining `ROOM_MATCH` directly)
  all stay.
- `defaultEquipmentFor` and friends stay: the build editor uses them for
  new characters and on profession change.

The rule and its "instead" are written for agents in `CLAUDE.md` at the
repository root.

## Consequences

- A schema change is now a change to a type, its guard and its tests,
  and nothing else. No step function, no frozen mirror, no permanent
  fixture.
- **The real downside:** a developer mid-sprint loses their test
  characters, and any build string they pasted somewhere, every time a
  stored shape changes. Accepted as far cheaper than a migration ritual
  that grows with every change and never shrinks.
- Breaking saved data is the expected outcome of a schema change, noted
  in the commit message, not something to ask permission for.
- A stale browser tab can no longer join a match and desynchronise; it
  is refused at the door and told to reload.
- The suite lost the tests that encoded the old policy. In their place
  are tests that a stale record is discarded, reported and gone on the
  next read, and that the handshake refuses wrong and missing versions.

**Revisit condition.** This is scoped to pre-1.0. The day there is a
tagged release with real players, persistence compatibility is decided
again in a new ADR, on its merits. It is not to be eroded quietly in the
meantime, one `?? default` at a time.

## Alternatives Considered

**Keep ADR-0013's registry and simply never add a second step.** The
registry, the frozen v1 types and their tests would stay as live
instructions to the next contributor, and the next schema change would
add `characterV2ToV3` because the pattern says to. Removing the code
without removing the reason for it guarantees it comes back.

**Silently drop unreadable records.** Rejected: a roster that is quietly
one character short looks like a bug. One plain sentence costs nothing
and tells the player exactly what happened.

**Refuse to start with unreadable data present (hard failure).**
Rejected: it punishes the player for a decision we made, and the only
way out would be clearing site data by hand, which deletes the good
records too.

**Keep a version window for shared builds only, since they live in chat
history.** Rejected for now. The chat history in question belongs to
the people writing the code. When there are real players with real
shared builds, the revisit condition above applies.
