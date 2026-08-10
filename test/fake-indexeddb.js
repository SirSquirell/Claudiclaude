/**
 * Just enough IndexedDB to run `store.js` under `node --test`.
 *
 * `store.js` sat at 30 % of its functions and `session.js` at zero, and the
 * reason given was always "it needs a browser". It needs a *key-value store
 * with transactions*, which is sixty lines. Everything above it — the session
 * resolution, the export allowlist, the meta cache — is ordinary logic that was
 * going untested because of a missing global.
 *
 * Deliberately minimal and deliberately not a spec implementation: it supports
 * exactly the calls `store.js` makes, and anything else throws rather than
 * quietly returning undefined. A fake that silently does nothing is worse than
 * no fake, because the test passes.
 */

class FakeRequest {
  constructor(run) {
    this.result = undefined;
    this.error = null;
    this.onsuccess = null;
    this.onerror = null;
    this.onupgradeneeded = null;
    this.transaction = null;
    // Deferred so the caller can attach handlers first, exactly as the real one.
    queueMicrotask(() => {
      try {
        run(this);
      } catch (err) {
        this.error = err;
        this.onerror?.();
      }
    });
  }
}

class FakeObjectStore {
  constructor(name, rows, keyPath) {
    this.name = name;
    this.rows = rows;
    this.keyPath = keyPath;
  }

  get(key) {
    return new FakeRequest((r) => {
      r.result = this.rows.get(String(key));
      r.onsuccess?.();
    });
  }

  getAll() {
    return new FakeRequest((r) => {
      r.result = [...this.rows.values()];
      r.onsuccess?.();
    });
  }

  put(record) {
    const key = record?.[this.keyPath];
    if (key === undefined) throw new Error(`put into "${this.name}" without a ${this.keyPath}`);
    this.rows.set(String(key), record);
    return new FakeRequest((r) => {
      r.result = key;
      r.onsuccess?.();
    });
  }

  delete(key) {
    this.rows.delete(String(key));
    return new FakeRequest((r) => r.onsuccess?.());
  }

  clear() {
    this.rows.clear();
    return new FakeRequest((r) => r.onsuccess?.());
  }
}

class FakeTransaction {
  constructor(db, names) {
    this.db = db;
    this.names = names;
    this.oncomplete = null;
    this.onerror = null;
    this.onabort = null;
    queueMicrotask(() => this.oncomplete?.());
  }

  objectStore(name) {
    if (!this.names.includes(name)) throw new Error(`"${name}" is not in this transaction`);
    return this.db._store(name);
  }
}

class FakeDatabase {
  constructor(data, keyPaths) {
    this.data = data;
    this.keyPaths = keyPaths;
    this.objectStoreNames = {
      _names: new Set(data.keys()),
      contains: (n) => this.data.has(n),
    };
  }

  _store(name) {
    if (!this.data.has(name)) throw new Error(`no object store "${name}"`);
    return new FakeObjectStore(name, this.data.get(name), this.keyPaths[name] ?? 'id');
  }

  createObjectStore(name, { keyPath } = {}) {
    this.data.set(name, new Map());
    this.keyPaths[name] = keyPath ?? 'id';
    return this._store(name);
  }

  transaction(names, _mode) {
    return new FakeTransaction(this, Array.isArray(names) ? names : [names]);
  }

  close() {}
}

/**
 * Install a fresh, empty database as `globalThis.indexedDB`.
 * @returns {() => void} put the previous global back
 */
export function installFakeIndexedDb() {
  const previous = globalThis.indexedDB;
  const data = new Map();
  const keyPaths = {};

  globalThis.indexedDB = {
    open(_name, _version) {
      const db = new FakeDatabase(data, keyPaths);
      return new FakeRequest((r) => {
        r.result = db;
        if (data.size === 0) {
          r.transaction = { objectStore: (n) => db._store(n) };
          r.onupgradeneeded?.({ oldVersion: 0 });
        }
        r.onsuccess?.();
      });
    },
  };

  return () => {
    globalThis.indexedDB = previous;
  };
}
