const DB_NAME = 'mosaic-debug';
const STORE = 'dumps';
const PREFS_KEY = 'mosaic-debug:prefs';

export const DEFAULT_PREFS = {
  mode: 'dark',
  contrast: 0,
  view: 'overview',
  dismissedHelp: false
};

function openDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
  });
}

async function withStore(mode, run) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const store = transaction.objectStore(STORE);
    let result;
    try {
      result = run(store);
    } catch (error) {
      reject(error);
      return;
    }
    transaction.oncomplete = () => {
      db.close();
      resolve(result && typeof result === 'object' && 'result' in result ? result.result : result);
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error || new Error('Storage transaction failed'));
    };
    transaction.onabort = () => {
      db.close();
      reject(transaction.error || new Error('Storage transaction aborted'));
    };
  });
}

export async function saveDump(key, payload) {
  try {
    await withStore('readwrite', (store) => store.put(payload, key));
    return true;
  } catch {
    return false;
  }
}

export async function loadDump(key) {
  try {
    const value = await withStore('readonly', (store) => store.get(key));
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

export async function clearDump(key) {
  try {
    await withStore('readwrite', (store) => store.delete(key));
    return true;
  } catch {
    return false;
  }
}

export function readPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function writePrefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    return true;
  } catch {
    return false;
  }
}
