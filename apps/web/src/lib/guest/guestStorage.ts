/** The slice of `Storage` the guest store needs. */
export type StorageBackend = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * Wraps localStorage so nothing throws: after the first failure (private mode, quota, blocked)
 * everything lives in memory for the rest of the page's life.
 */
export function createGuestStorage(getBackend: () => StorageBackend | null) {
  const memory = new Map<string, string>();
  let usesMemory = false;

  function useBackend(run: (backend: StorageBackend) => void) {
    if (usesMemory) return;
    try {
      const backend = getBackend();
      if (!backend) throw new Error('No localStorage');
      run(backend);
    } catch {
      usesMemory = true;
    }
  }

  return {
    getItem(key: string) {
      let stored: string | null = null;
      useBackend((backend) => {
        stored = backend.getItem(key);
      });
      return usesMemory ? (memory.get(key) ?? null) : stored;
    },
    setItem(key: string, value: string) {
      memory.set(key, value);
      useBackend((backend) => backend.setItem(key, value));
    },
    removeItem(key: string) {
      memory.delete(key);
      useBackend((backend) => backend.removeItem(key));
    },
    /** True once saves can no longer survive a reload. */
    isMemoryOnly: () => usesMemory,
  };
}

/** `window.localStorage` itself throws in some browsers when storage is blocked. */
export function browserLocalStorage() {
  return typeof window === 'undefined' ? null : window.localStorage;
}
