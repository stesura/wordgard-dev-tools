import {isThemeChoice, prefersDark, type ThemeSource, type ThemeStorage} from "wordgard-devtools-panel/ui"
import {browser} from "wxt/browser"

/** Follows the DevTools theme; outside DevTools (the panel page opened directly), the system's. */
export const devtoolsTheme = (): ThemeSource => {
  const panels = browser.devtools?.panels
  if (!panels) return prefersDark()
  let dark = panels.themeName == "dark"
  return {
    dark: () => dark,
    subscribe: listener => {
      // Chrome 99+. Firefox reports the theme only at load.
      if (typeof panels.setThemeChangeHandler != "function") return () => {}
      panels.setThemeChangeHandler(theme => {
        dark = theme == "dark"
        listener()
      })
      return () => panels.setThemeChangeHandler()
    },
  }
}

const KEY = "theme"

export const extensionThemeStorage = (): ThemeStorage => ({
  load: async () => {
    const stored = await browser.storage.local.get(KEY)
    const choice = stored[KEY]
    return isThemeChoice(choice) ? choice : null
  },
  save: choice => {
    void browser.storage.local.set({[KEY]: choice})
  },
})
