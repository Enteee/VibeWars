import {
  CHARACTER_SCHEMA_VERSION,
  TEAM_SCHEMA_VERSION,
  PersistenceError,
  isStoredCharacter,
  isStoredTeam,
  type StoredCharacter,
  type StoredTeam,
} from "./schema.js";
import { STORAGE_NAMESPACE } from "./namespace.js";

/**
 * Typed repositories over IndexedDB (ADR-0005).
 *
 * Deliberately a handful of get/put/list/delete functions rather than a
 * generic ORM: there are exactly two entity types, and a thin typed layer
 * is easier to reason about than a framework's abstractions (brief §30,
 * "do not over-engineer simple things").
 */

const DB_NAME = STORAGE_NAMESPACE;
const DB_VERSION = 3;
const CHARACTER_STORE = "characters";
const TEAM_STORE = "teams";
/** Match records lived here until #2019: a store left from then is deleted on open. */
const MATCH_STORE = "matches";

/** The notice shown when `count` stale characters were discarded. */
export function discardedCharactersNotice(count: number): string {
  return count === 1
    ? "A saved character from an older build of the game could not be read and was discarded."
    : `${String(count)} saved characters from an older build of the game could not be read and were discarded.`;
}

/** The notice shown when `count` stale teams were discarded. */
export function discardedTeamsNotice(count: number): string {
  return count === 1
    ? "A saved team from an older build of the game could not be read and was discarded."
    : `${String(count)} saved teams from an older build of the game could not be read and were discarded.`;
}

/**
 * The subset of IndexedDB this module uses, as an interface, so tests can
 * substitute an in-memory implementation without a browser. The real
 * browser objects satisfy this structurally.
 */
export interface KeyValueStore {
  get<T>(store: string, key: string): Promise<T | undefined>;
  put(store: string, key: string, value: unknown): Promise<void>;
  delete(store: string, key: string): Promise<void>;
  /** Every record in a store, with the key it is stored under. */
  list(store: string): Promise<{ key: string; value: unknown }[]>;
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new PersistenceError("IndexedDB request failed"));
    };
  });
}

/**
 * Resolves once a write transaction has committed. A request's success
 * fires before the commit, and a page unloaded in between aborts the
 * write, so "saved" has to mean this, not the request.
 */
function committed(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => {
      resolve();
    };
    tx.onerror = () => {
      reject(tx.error ?? new PersistenceError("IndexedDB transaction failed"));
    };
    tx.onabort = () => {
      reject(tx.error ?? new PersistenceError("IndexedDB transaction aborted"));
    };
  });
}

/** What the bar says while another tab's older build holds the store open (#1404). */
export const BLOCKED_NOTICE = "Close your other VibeWars tabs to continue.";

/**
 * Open the store. `onBlocked` runs if another tab holds an older version
 * open: the open waits for that tab to close, and the player has to be
 * told, or the page just sits blank.
 */
export function openIndexedDbStore(onBlocked: () => void): Promise<KeyValueStore> {
  return new Promise<KeyValueStore>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onblocked = onBlocked;

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CHARACTER_STORE)) {
        db.createObjectStore(CHARACTER_STORE);
      }
      if (!db.objectStoreNames.contains(TEAM_STORE)) {
        db.createObjectStore(TEAM_STORE);
      }
      if (db.objectStoreNames.contains(MATCH_STORE)) {
        db.deleteObjectStore(MATCH_STORE);
      }
    };

    request.onerror = () => {
      reject(request.error ?? new PersistenceError("could not open IndexedDB"));
    };

    request.onsuccess = () => {
      const db = request.result;
      // A newer build's tab never waits on this one. Its store calls fail
      // after, and are caught like any other failed write.
      db.onversionchange = () => {
        db.close();
      };
      resolve({
        async get<T>(store: string, key: string): Promise<T | undefined> {
          const tx = db.transaction(store, "readonly");
          return (await promisify(tx.objectStore(store).get(key))) as T | undefined;
        },
        async put(store: string, key: string, value: unknown): Promise<void> {
          const tx = db.transaction(store, "readwrite");
          tx.objectStore(store).put(value, key);
          await committed(tx);
        },
        async delete(store: string, key: string): Promise<void> {
          const tx = db.transaction(store, "readwrite");
          tx.objectStore(store).delete(key);
          await committed(tx);
        },
        async list(store: string): Promise<{ key: string; value: unknown }[]> {
          // One transaction, so the two arrays describe the same snapshot
          // and line up index for index (both are in key order). Every key
          // this module writes is a string.
          const tx = db.transaction(store, "readonly");
          const [keys, values] = await Promise.all([
            promisify(tx.objectStore(store).getAllKeys()),
            promisify(tx.objectStore(store).getAll() as IDBRequest<unknown[]>),
          ]);
          return keys.flatMap((key, i) =>
            typeof key === "string" ? [{ key, value: values[i] }] : [],
          );
        },
      });
    };
  });
}

/** An in-memory `KeyValueStore`, for tests and for a private-mode fallback. */
export function createMemoryStore(): KeyValueStore {
  const stores = new Map<string, Map<string, unknown>>();
  const of = (name: string): Map<string, unknown> => {
    const existing = stores.get(name);
    if (existing !== undefined) {
      return existing;
    }
    const created = new Map<string, unknown>();
    stores.set(name, created);
    return created;
  };

  return {
    get<T>(store: string, key: string): Promise<T | undefined> {
      return Promise.resolve(of(store).get(key) as T | undefined);
    },
    put(store: string, key: string, value: unknown): Promise<void> {
      // Structured-clone semantics: callers must not be able to mutate a
      // stored record by keeping a reference to what they passed in.
      of(store).set(key, JSON.parse(JSON.stringify(value)) as unknown);
      return Promise.resolve();
    },
    delete(store: string, key: string): Promise<void> {
      of(store).delete(key);
      return Promise.resolve();
    },
    list(store: string): Promise<{ key: string; value: unknown }[]> {
      return Promise.resolve([...of(store)].map(([key, value]) => ({ key, value })));
    },
  };
}

/**
 * Read one record, discarding it if it is not in the current shape.
 *
 * A record from another schema version is not upgraded (ADR-0016): it is
 * deleted, so it cannot come back on the next read, and the caller
 * treats it as absent.
 */
async function loadCurrent<T>(
  store: KeyValueStore,
  name: string,
  key: string,
  isCurrent: (value: unknown) => value is T,
): Promise<T | undefined> {
  const raw = await store.get<unknown>(name, key);
  if (raw === undefined) {
    return undefined;
  }
  if (isCurrent(raw)) {
    return raw;
  }
  await store.delete(name, key);
  return undefined;
}

/**
 * Every record in the current shape. Any that are not are deleted and
 * reported in a single plain-English line in `problems`, so the roster is
 * never silently short and the player is told once, not once per record.
 */
async function listCurrent<T>(
  store: KeyValueStore,
  name: string,
  isCurrent: (value: unknown) => value is T,
  discardedNotice: (count: number) => string,
): Promise<{ records: T[]; problems: string[] }> {
  const records: T[] = [];
  let discarded = 0;
  for (const { key, value } of await store.list(name)) {
    if (isCurrent(value)) {
      records.push(value);
    } else {
      await store.delete(name, key);
      discarded += 1;
    }
  }
  return { records, problems: discarded === 0 ? [] : [discardedNotice(discarded)] };
}

export class CharacterRepository {
  readonly #store: KeyValueStore;

  public constructor(store: KeyValueStore) {
    this.#store = store;
  }

  public async save(character: StoredCharacter): Promise<void> {
    if (character.schemaVersion !== CHARACTER_SCHEMA_VERSION) {
      throw new PersistenceError(
        `refusing to save a record with schema ${String(character.schemaVersion)}`,
      );
    }
    await this.#store.put(CHARACTER_STORE, character.id, character);
  }

  public async load(id: string): Promise<StoredCharacter | undefined> {
    return loadCurrent(this.#store, CHARACTER_STORE, id, isStoredCharacter);
  }

  /** Every saved character, newest first. Stale records are discarded and reported. */
  public async list(): Promise<{ characters: StoredCharacter[]; problems: string[] }> {
    const { records: characters, problems } = await listCurrent(
      this.#store,
      CHARACTER_STORE,
      isStoredCharacter,
      discardedCharactersNotice,
    );
    characters.sort((a, b) => b.updatedAt - a.updatedAt);
    return { characters, problems };
  }

  public async delete(id: string): Promise<void> {
    await this.#store.delete(CHARACTER_STORE, id);
  }
}

export class TeamRepository {
  readonly #store: KeyValueStore;

  public constructor(store: KeyValueStore) {
    this.#store = store;
  }

  public async save(team: StoredTeam): Promise<void> {
    if (team.schemaVersion !== TEAM_SCHEMA_VERSION) {
      throw new PersistenceError(
        `refusing to save a record with schema ${String(team.schemaVersion)}`,
      );
    }
    await this.#store.put(TEAM_STORE, team.id, team);
  }

  public async load(id: string): Promise<StoredTeam | undefined> {
    return loadCurrent(this.#store, TEAM_STORE, id, isStoredTeam);
  }

  /** Every saved team, newest first. Stale records are discarded and reported. */
  public async list(): Promise<{ teams: StoredTeam[]; problems: string[] }> {
    const { records: teams, problems } = await listCurrent(
      this.#store,
      TEAM_STORE,
      isStoredTeam,
      discardedTeamsNotice,
    );
    teams.sort((a, b) => b.updatedAt - a.updatedAt);
    return { teams, problems };
  }

  public async delete(id: string): Promise<void> {
    await this.#store.delete(TEAM_STORE, id);
  }
}
