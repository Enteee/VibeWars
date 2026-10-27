import schema from "./wire-schema.json" with { type: "json" };

/**
 * The version of the wire, computed when this module loads from
 * `wire-schema.json`, the committed description of everything that
 * crosses between peers (`pnpm run wire:snapshot` writes it). Nothing
 * else is committed, so two PRs that change the wire do not conflict on
 * a hash. Every peer sends it as `protocolVersion` in its hello and
 * lobby join, and a host refuses one whose value is absent or different
 * (`PROTOCOL_MISMATCH_MESSAGE`), so a stale tab fails loudly at join
 * time instead of desynchronising mid-match. It only ever rejects;
 * there is no code path per version (ADR-0016).
 */
export const PROTOCOL_VERSION = fingerprint(JSON.stringify(schema));

/**
 * The first 12 hex digits of FNV-1a 64-bit over the UTF-16 code units of
 * `text`. Pure and synchronous, with no dependency: this package keeps
 * none, and the version is read at the first hello.
 */
export function fingerprint(text: string): string {
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash ^ BigInt(text.charCodeAt(index))) * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0").slice(0, 12);
}
