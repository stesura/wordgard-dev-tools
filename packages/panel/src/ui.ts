// The panel without the dock, for the extension. Internal: exported only under the `source`
// condition and not built, since a host's own React can't render a panel that bundles React.
// Its styles are `@stesura/wordgard-dev-tools-panel/styles.css`.
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
