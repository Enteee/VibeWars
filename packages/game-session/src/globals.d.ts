/**
 * The globals a session needs that every place it runs has, a page, a
 * worker and Node alike, but that no ES lib declares. Declared here rather
 * than by pulling in `DOM` or Node's types, which would let `window` or
 * `node:*` compile in this package.
 */
declare function queueMicrotask(callback: () => void): void;
declare function structuredClone<T>(value: T): T;
/** A match client gives up on a host that never answers, or that dropped and stayed away (#515). */
declare function setTimeout(callback: () => void, ms: number): unknown;
declare function clearTimeout(handle: unknown): void;
/** A hello is said again until the host answers it (#1805). */
declare function setInterval(callback: () => void, ms: number): unknown;
declare function clearInterval(handle: unknown): void;
/** A message's size on the wire is its UTF-8 length (#403). */
declare class TextEncoder {
  encode(input: string): Uint8Array;
}
/** A host that would send an oversized message says so (#403). */
declare const console: { error(...data: unknown[]): void };
/** A rejoin is proven with an HMAC of the token, not the token itself (#593). */
interface SubtleHmacKey {
  readonly type: string;
}
/** A lobby key's seed is HKDF of its bytes (#2100). */
interface SubtleHkdfKey {
  readonly type: string;
}
declare const crypto: {
  readonly subtle: {
    importKey(
      format: "raw",
      keyData: Uint8Array,
      algorithm: { readonly name: "HMAC"; readonly hash: "SHA-256" },
      extractable: false,
      keyUsages: readonly ("sign" | "verify")[],
    ): Promise<SubtleHmacKey>;
    importKey(
      format: "raw",
      keyData: Uint8Array,
      algorithm: "HKDF",
      extractable: false,
      keyUsages: readonly "deriveBits"[],
    ): Promise<SubtleHkdfKey>;
    deriveBits(
      algorithm: {
        readonly name: "HKDF";
        readonly hash: "SHA-256";
        readonly salt: Uint8Array;
        readonly info: Uint8Array;
      },
      baseKey: SubtleHkdfKey,
      length: number,
    ): Promise<ArrayBuffer>;
    sign(algorithm: "HMAC", key: SubtleHmacKey, data: Uint8Array): Promise<ArrayBuffer>;
    /** A key proof is checked in constant time (#1681), never by comparing strings. */
    verify(
      algorithm: "HMAC",
      key: SubtleHmacKey,
      signature: Uint8Array,
      data: Uint8Array,
    ): Promise<boolean>;
    /** A queue group's id is a sha256 every member computes alike (#869). */
    digest(algorithm: "SHA-256", data: Uint8Array): Promise<ArrayBuffer>;
  };
  /** A key challenge's nonce is fresh random bits (#1681). */
  getRandomValues<T extends Uint8Array>(array: T): T;
};
