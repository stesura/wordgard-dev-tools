export type ThemeChoice = "system" | "light" | "dark";
export type Theme = { choice: ThemeChoice; dark: boolean };

export type ThemeStore = {
  get: () => Theme;
  subscribe: (listener: () => void) => () => void;
  set: (choice: ThemeChoice) => void;
};

/** What "system" follows: `prefers-color-scheme` in-page, the DevTools theme in the extension. */
export type ThemeSource = {
  dark: () => boolean;
  subscribe: (listener: () => void) => () => void;
};

/** Where the user's choice is kept. */
export type ThemeStorage = {
  load: () => ThemeChoice | null | Promise<ThemeChoice | null>;
  save: (choice: ThemeChoice) => void;
};

export const nextTheme: Record<ThemeChoice, ThemeChoice> = {
  system: "light",
  light: "dark",
  dark: "system",
};

export const isThemeChoice = (value: unknown): value is ThemeChoice =>
  value == "system" || value == "light" || value == "dark";

export const prefersDark = (): ThemeSource => {
  const media = matchMedia("(prefers-color-scheme: dark)");
  return {
    dark: () => media.matches,
    subscribe: (listener) => {
      media.addEventListener("change", listener);
      return () => media.removeEventListener("change", listener);
    },
  };
};

export const localThemeStorage = (key = "wordgard-devtools:theme"): ThemeStorage => ({
  load: () => {
    try {
      const stored = localStorage.getItem(key);
      return isThemeChoice(stored) ? stored : null;
    } catch {
      return null;
    }
  },
  save: (choice) => {
    try {
      localStorage.setItem(key, choice);
    } catch {
      // Storage blocked: the choice lasts until reload.
    }
  },
});

export const createThemeStore = ({
  source = prefersDark(),
  storage = localThemeStorage(),
}: { source?: ThemeSource; storage?: ThemeStorage } = {}): ThemeStore => {
  const listeners = new Set<() => void>();
  const compute = (choice: ThemeChoice): Theme => ({
    choice,
    dark: choice == "dark" || (choice == "system" && source.dark()),
  });
  let theme = compute("system");
  const update = (choice: ThemeChoice) => {
    const next = compute(choice);
    if (next.choice == theme.choice && next.dark == theme.dark) return;
    theme = next;
    for (const listener of listeners) listener();
  };
  // Loaded synchronously when the storage allows it, so the first paint has the right theme.
  const loaded = storage.load();
  if (loaded instanceof Promise) loaded.then((choice) => choice && update(choice)).catch(() => {});
  else if (loaded) theme = compute(loaded);

  let stopSource: (() => void) | null = null;
  return {
    get: () => theme,
    subscribe: (listener) => {
      stopSource ??= source.subscribe(() => update(theme.choice));
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (!listeners.size && stopSource) {
          stopSource();
          stopSource = null;
        }
      };
    },
    set: (choice) => {
      storage.save(choice);
      update(choice);
    },
  };
};
