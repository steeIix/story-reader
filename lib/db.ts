'use client';
import type { Story } from './types';

// Stories live in the browser's IndexedDB (room for lots of chapters and images, unlike localStorage).
const DB_NAME = 'story-reader';
const STORE = 'stories';

let dbPromise: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

export const listStories = () => run<Story[]>('readonly', (s) => s.getAll());
export const getStory = (id: string) => run<Story | undefined>('readonly', (s) => s.get(id));
export const putStory = (story: Story) => run<IDBValidKey>('readwrite', (s) => s.put(story));
export const deleteStory = (id: string) => run<undefined>('readwrite', (s) => s.delete(id));
