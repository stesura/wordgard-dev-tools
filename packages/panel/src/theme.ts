export type ThemeChoice = "system" | "light" | "dark"
export type Theme = {choice: ThemeChoice; dark: boolean}

export type ThemeStore = {
  get: () => Theme
  subscribe: (listener: () => void) => () => void
  set: (choice: ThemeChoice) => void
}

export const nextTheme: Record<ThemeChoice, ThemeChoice> = {system: "light", light: "dark", dark: "system"}

const isChoice = (value: unknown): value is ThemeChoice => value == "system" || value == "light" || value == "dark"

/** Follows `prefers-color-scheme` unless the user picked a theme, kept in localStorage. */
export const createThemeStore = (key = "wordgard-devtools:theme"): ThemeStore => {
  const media = matchMedia("(prefers-color-scheme: dark)")
  const listeners = new Set<() => void>()
  const compute = (choice: ThemeChoice): Theme => ({choice, dark: choice == "dark" || (choice == "system" && media.matches)})
  const read = () => {
    try {
      const stored = localStorage.getItem(key)
      return isChoice(stored) ? stored : "system"
    } catch {
      return "system"
    }
  }
  let theme = compute(read())
  const update = (choice: ThemeChoice) => {
    const next = compute(choice)
    if (next.choice == theme.choice && next.dark == theme.dark) return
    theme = next
    for (const listener of listeners) listener()
  }
  const onMedia = () => update(theme.choice)
  return {
    get: () => theme,
    subscribe: listener => {
      if (!listeners.size) media.addEventListener("change", onMedia)
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
        if (!listeners.size) media.removeEventListener("change", onMedia)
      }
    },
    set: choice => {
      try {
        localStorage.setItem(key, choice)
      } catch {
        // Storage blocked: the choice lasts until reload.
      }
      update(choice)
    },
  }
}
