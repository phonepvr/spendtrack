export interface WipeResult {
  localStorageCleared: boolean;
  indexedDbCleared: string[];
  serviceWorkerUnregistered: boolean;
  caches: number;
}

async function listIndexedDbNames(): Promise<string[]> {
  const dbs = (indexedDB as unknown as { databases?: () => Promise<Array<{ name?: string }>> })
    .databases;
  if (!dbs) return [];
  try {
    const list = await dbs.call(indexedDB);
    return list.map((d) => d.name).filter((n): n is string => !!n);
  } catch {
    return [];
  }
}

function deleteIndexedDb(name: string): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

export async function wipeEverything(): Promise<WipeResult> {
  const result: WipeResult = {
    localStorageCleared: false,
    indexedDbCleared: [],
    serviceWorkerUnregistered: false,
    caches: 0,
  };

  try {
    localStorage.clear();
    result.localStorageCleared = true;
  } catch {
    /* ignore */
  }

  try {
    sessionStorage.clear();
  } catch {
    /* ignore */
  }

  const dbs = await listIndexedDbNames();
  const candidates = new Set<string>(dbs);
  candidates.add('spendtrack-local');
  for (const name of candidates) {
    await deleteIndexedDb(name);
    result.indexedDbCleared.push(name);
  }

  if ('caches' in window) {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      result.caches = keys.length;
    } catch {
      /* ignore */
    }
  }

  if ('serviceWorker' in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
      result.serviceWorkerUnregistered = regs.length > 0;
    } catch {
      /* ignore */
    }
  }

  return result;
}
