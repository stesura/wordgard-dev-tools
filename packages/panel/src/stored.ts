/**
 * A value saved in localStorage as JSON: an external store, shared by every view (and editor)
 * reading it. `read` turns what's stored back into a value, falling back on anything it doesn't
 * recognise; `write` turns a value into JSON.
 */
export type Stored<T> = {
  get: () => T;
  subscribe: (listener: () => void) => () => void;
  update: (change: (value: T) => T) => void;
};

export const stored = <T>(
  key: string,
  fallback: T,
  read: (json: unknown) => T,
  write: (value: T) => unknown
): Stored<T> => {
  const listeners = new Set<() => void>();
  // The stored text last parsed, and its value: a stable snapshot until the text changes.
  let text: string | null = null;
  let value = fallback;
  const get = () => {
    let now: string | null;
    try {
      now = localStorage.getItem(key);
    } catch {
      // Storage blocked: the value lasts until reload.
      return value;
    }
    if (now !== text) {
      text = now;
      try {
        value = now == null ? fallback : read(JSON.parse(now));
      } catch {
        value = fallback;
      }
    }
    return value;
  };
  return {
    get,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    update: (change) => {
      value = change(get());
      try {
        const next = JSON.stringify(write(value));
        localStorage.setItem(key, next);
        text = next;
      } catch {
        // Storage blocked or full: kept in memory (`text` unchanged, so `get` keeps `value`).
      }
      for (const listener of listeners) listener();
    },
  };
};

/** A stored list of strings, as a set; anything else, empty. */
export const stringSet = (json: unknown): ReadonlySet<string> =>
  new Set(Array.isArray(json) ? json.filter((item) => typeof item == "string") : []);

export const isRecord = (json: unknown): json is Record<string, unknown> =>
  typeof json == "object" && json != null && !Array.isArray(json);
