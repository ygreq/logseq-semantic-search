export interface IndexedBlock {
  uuid: string;
  pageName: string;
  originalName: string;
  content: string;
  hash: string;
  vector: number[];
}

const DB_NAME = 'logseq-semantic-search-db';
const DB_VERSION = 1;
const STORE_NAME = 'blocks';

let memoryCache: IndexedBlock[] | null = null;
let cachedDb: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (cachedDb) return cachedDb;
  cachedDb = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'uuid' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      cachedDb = null;
      reject(req.error);
    };
  });
  return cachedDb;
}

export async function getIndexedBlockCount(): Promise<number> {
  if (memoryCache) return memoryCache.length;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).count();
    req.onsuccess = () => resolve(req.result ?? 0);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllIndexedBlocks(): Promise<IndexedBlock[]> {
  if (memoryCache) return memoryCache;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => {
      memoryCache = (req.result as IndexedBlock[]) ?? [];
      resolve(memoryCache);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function putIndexedBlocks(items: IndexedBlock[]): Promise<void> {
  if (items.length === 0) return;
  memoryCache = null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const item of items) {
      store.put(item);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteIndexedBlocks(uuids: string[]): Promise<void> {
  if (uuids.length === 0) return;
  memoryCache = null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const id of uuids) {
      store.delete(id);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearAllIndexedBlocks(): Promise<void> {
  memoryCache = null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
