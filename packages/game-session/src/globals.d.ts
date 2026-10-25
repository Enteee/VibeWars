/**
 * The globals a session needs that every place it runs has, a page, a
 * worker and Node alike, but that no ES lib declares. Declared here rather
 * than by pulling in `DOM` or Node's types, which would let `window` or
 * `node:*` compile in this package.
 */
declare function queueMicrotask(callback: () => void): void;
declare function structuredClone<T>(value: T): T;
/** A match client gives up on a host that never answers. */
declare function setTimeout(callback: () => void, ms: number): unknown;
declare function clearTimeout(handle: unknown): void;
