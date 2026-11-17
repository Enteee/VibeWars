/**
 * A map that keeps at most `limit` entries, dropping the least recently
 * used one when a new key would go over (#3467). Built on `Map`'s
 * insertion order: a hit is deleted and set again, so the oldest key is
 * always the first. A value is an object, so `undefined` from `get` is
 * always a miss.
 */
export class LruCache<K, V extends object> {
  readonly #entries = new Map<K, V>();
  readonly #limit: number;

  public constructor(limit: number) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error(`LruCache limit must be a positive integer, got ${String(limit)}`);
    }
    this.#limit = limit;
  }

  public get size(): number {
    return this.#entries.size;
  }

  /** The value for `key`, which becomes the most recently used. */
  public get(key: K): V | undefined {
    const value = this.#entries.get(key);
    if (value === undefined) {
      return undefined;
    }
    this.#entries.delete(key);
    this.#entries.set(key, value);
    return value;
  }

  /** Stores `value` as the most recently used, evicting the least recently used once over the limit. */
  public set(key: K, value: V): void {
    this.#entries.delete(key);
    this.#entries.set(key, value);
    if (this.#entries.size > this.#limit) {
      const oldest = this.#entries.keys().next();
      if (oldest.done !== true) {
        this.#entries.delete(oldest.value);
      }
    }
  }
}
