import { atom, type WritableAtom } from "nanostores";

/** How a value is stored: `decode` throws, or falls back, on what it doesn't recognise. */
export type Codec<T> = { decode: (text: string) => T; encode: (value: T) => string };

/** As JSON: `read` turns what's stored back into a value; `write` turns a value into JSON. */
export const asJSON = <T>(
  read: (json: unknown) => T,
  write: (value: T) => unknown = (value) => value
): Codec<T> => ({
  decode: (text) => read(JSON.parse(text)),
  encode: (value) => JSON.stringify(write(value)),
});

/**
 * A value saved in localStorage. Read once, when created: create it with what owns it (a panel,
 * a tab, the dock), never at module level, so each mount reads what's saved now. Blocked or full
 * storage keeps the value in memory until reload; nothing throws.
 */
export const persistent = <T>(key: string, fallback: T, codec: Codec<T>): WritableAtom<T> => {
  let initial = fallback;
  try {
    const text = localStorage.getItem(key);
    if (text != null) initial = codec.decode(text);
  } catch {
    // Blocked, or not ours to read: the fallback.
  }
  const value = atom(initial);
  value.listen((next) => {
    try {
      localStorage.setItem(key, codec.encode(next));
    } catch {
      // Blocked or full: the value lasts until reload.
    }
  });
  return value;
};
