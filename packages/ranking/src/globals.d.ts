/**
 * The one global ranking needs that a page and Node both have but no ES
 * lib declares. Declared here rather than by pulling in `DOM` or Node's
 * types, which would let `window` or `node:*` compile in this package.
 */
/** A name is hashed as its UTF-8 bytes. */
declare class TextEncoder {
  encode(input: string): Uint8Array;
}
