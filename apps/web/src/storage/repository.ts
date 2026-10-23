import {
  CURRENT_SCHEMA_VERSION,
  PersistenceError,
  isStoredCharacter,
  isStoredTeam,
  migrate,
  type StoredCharacter,
  type StoredTeam,
} from "./schema.js";

/**
 * Typed repositories over IndexedDB (ADR-0005).
 *
 * Deliberately a handful of get/put/list/delete functions rather than a
 * generic ORM: there are exactly two entity types, and a thin typed layer
 * is easier to reason about than a framework's abstractions (brief §30,
 * "do not over-engineer simple things").
 */

const DB_NAME = "vibewars";
const DB_VERSION = 1;
const CHARACTER_STORE = "characters";
const TEAM_STORE = "teams";

/**
 * The subset of IndexedDB this module uses, as an interface, so tests can
 * substitute an in-memory implementation without a browser. The real
 * browser objects satisfy this structurally.
 */
export interface KeyValueStore {
  get<T>(store: string, key: string): Promise<T | undefined>;
  put(store: string, key: string, value: unknown): Promise<void>;
  delete(store: string, key: string): Promise<void>;
  list<T>(store: string): Promise<T[]>;
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

export function openIndexedDbStore(): Promise<KeyValueStore> {
  return new Promise<KeyValueStore>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CHARACTER_STORE)) {
        db.createObjectStore(CHARACTER_STORE);
      }
      if (!db.objectStoreNames.contains(TEAM_STORE)) {
        db.createObjectStore(TEAM_STORE);
      }
    };

    request.onerror = () => {
      reject(request.error ?? new PersistenceError("could not open IndexedDB"));
    };

    request.onsuccess = () => {
      const db = request.result;
      resolve({
        async get<T>(store: string, key: string): Promise<T | undefined> {
          const tx = db.transaction(store, "readonly");
          return (await promisify(tx.objectStore(store).get(key))) as T | undefined;
        },
        async put(store: string, key: string, value: unknown): Promise<void> {
          const tx = db.transaction(store, "readwrite");
          await promisify(tx.objectStore(store).put(value, key));
        },
        async delete(store: string, key: string): Promise<void> {
          const tx = db.transaction(store, "readwrite");
          await promisify(tx.objectStore(store).delete(key));
        },
        async list<T>(store: string): Promise<T[]> {
          const tx = db.transaction(store, "readonly");
          return (await promisify(tx.objectStore(store).getAll())) as T[];
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
    list<T>(store: string): Promise<T[]> {
      return Promise.resolve([...of(store).values()] as T[]);
    },
  };
}

export class CharacterRepository {
  readonly #store: KeyValueStore;

  public constructor(store: KeyValueStore) {
    this.#store = store;
  }

  public async save(character: StoredCharacter): Promise<void> {
    if (character.schemaVersion !== CURRENT_SCHEMA_VERSION) {
      throw new PersistenceError(
        `refusing to save a record with schema ${String(character.schemaVersion)}`,
      );
    }
    await this.#store.put(CHARACTER_STORE, character.id, character);
  }

  public async load(id: string): Promise<StoredCharacter | undefined> {
    const raw = await this.#store.get<unknown>(CHARACTER_STORE, id);
    if (raw === undefined) {
      return undefined;
    }
    if (!isStoredCharacter(raw)) {
      throw new PersistenceError(`stored character ${id} is malformed`);
    }
    return migrate(raw);
  }

  /**
   * Every saved character. A single malformed or future-versioned record
   * is reported rather than silently dropped, so a user is told their
   * data needs attention instead of quietly losing a build.
   */
  public async list(): Promise<{ characters: StoredCharacter[]; problems: string[] }> {
    const raw = await this.#store.list<unknown>(CHARACTER_STORE);
    const characters: StoredCharacter[] = [];
    const problems: string[] = [];
    for (const record of raw) {
      if (!isStoredCharacter(record)) {
        problems.push("a stored character is malformed and was not loaded");
        continue;
      }
      try {
        characters.push(migrate(record));
      } catch (error) {
        problems.push(error instanceof Error ? error.message : String(error));
      }
    }
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
    if (team.schemaVersion !== CURRENT_SCHEMA_VERSION) {
      throw new PersistenceError(
        `refusing to save a record with schema ${String(team.schemaVersion)}`,
      );
    }
    await this.#store.put(TEAM_STORE, team.id, team);
  }

  public async load(id: string): Promise<StoredTeam | undefined> {
    const raw = await this.#store.get<unknown>(TEAM_STORE, id);
    if (raw === undefined) {
      return undefined;
    }
    if (!isStoredTeam(raw)) {
      throw new PersistenceError(`stored team ${id} is malformed`);
    }
    return migrate(raw);
  }

  public async list(): Promise<{ teams: StoredTeam[]; problems: string[] }> {
    const raw = await this.#store.list<unknown>(TEAM_STORE);
    const teams: StoredTeam[] = [];
    const problems: string[] = [];
    for (const record of raw) {
      if (!isStoredTeam(record)) {
        problems.push("a stored team is malformed and was not loaded");
        continue;
      }
      try {
        teams.push(migrate(record));
      } catch (error) {
        problems.push(error instanceof Error ? error.message : String(error));
      }
    }
    teams.sort((a, b) => b.updatedAt - a.updatedAt);
    return { teams, problems };
  }

  public async delete(id: string): Promise<void> {
    await this.#store.delete(TEAM_STORE, id);
  }
}
