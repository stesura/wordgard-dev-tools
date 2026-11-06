/**
 * Promises by key, for `use()`, which needs the same promise on each render. The last `size` are
 * kept: a deferred render may still ask for an older one.
 */
export const createPromiseCache = <T>(size = 32) => {
  const promises = new Map<string, Promise<T>>();
  return {
    /** The promise for `key`, from `load` the first time. */
    get: (key: string, load: () => Promise<T>) => {
      let found = promises.get(key);
      if (!found) {
        found = load();
        promises.set(key, found);
        for (const old of promises.keys()) {
          if (promises.size <= size) break;
          promises.delete(old);
        }
      }
      return found;
    },
    delete: (key: string) => promises.delete(key),
    clear: () => promises.clear(),
  };
};
