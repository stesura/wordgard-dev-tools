// The panel without the dock, for hosts that render it themselves (the extension).
// Its styles are `wordgard-devtools-panel/styles.css`.
export {Panel, type PanelProps} from "./Panel.tsx"
export {createPanelStore, type PanelState, type PanelStore} from "./store.ts"
export {
  createThemeStore,
  isThemeChoice,
  localThemeStorage,
  prefersDark,
  type Theme,
  type ThemeChoice,
  type ThemeSource,
  type ThemeStorage,
  type ThemeStore,
} from "./theme.ts"
export {AgentError, type Transport} from "./transport.ts"
