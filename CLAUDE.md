# Working on vibewars

Everything about how to build, test and contribute is in
[`CONTRIBUTING.md`](CONTRIBUTING.md). This file holds the one rule that
keeps being broken, and it applies to every change you make.

## No backwards compatibility

vibewars has no released version. Never write code whose purpose is to
tolerate data produced by an older build of this project. There is
nobody to be compatible with, and every compatibility shim you add is a
permanent ritual the next schema change has to perform. The full
reasoning, including what was tried, is in
[ADR-0016](docs/adr/0016-no-backwards-compatibility.md).

Specifically, never write:

- migration functions or migration registries;
- frozen `v1` copies of types;
- `MIN_SUPPORTED_*` constants or any other version window;
- code that treats an absent field as "old rather than malformed";
- `fallback` parameters whose only job is to fill in what old data lacks;
- deprecated aliases kept "just in case";
- two read paths for two shapes of the same thing.

Instead: change the type, discard the stale data, move on. A record that
does not match the current shape is deleted, and the player is told
once, plainly. That is what `apps/web/src/storage/repository.ts` does.

**A version field may reject, never adapt.** A version whose only job is
to refuse a mismatch, like `PROTOCOL_VERSION`, `schemaVersion` or
`BUILD_FORMAT_VERSION`, is wanted. A version that selects between code
paths is the thing being banned. This is the line to hold.

**Breaking saved data is the expected outcome** of changing a stored
shape, not a problem to solve. Do not ask permission and do not soften
it with an upgrade path. Say so in the commit message, so whoever loses
their test characters knows why.

Not every fallback is compatibility. Handling _wrong_ data, such as an
illegal build getting the house loadout or an unknown map getting the
default one, is fine and stays. The question is whether the code exists
because the data is _old_.

This holds until 1.0. The day there is a tagged release with real
players, it is reconsidered in a new ADR. Until then, do not erode it
quietly, one `?? default` at a time.
