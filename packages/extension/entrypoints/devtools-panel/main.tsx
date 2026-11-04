import "wordgard-devtools-panel/styles.css"
import {StrictMode} from "react"
import {createRoot} from "react-dom/client"
import {Panel, createPanelStore, createThemeStore} from "wordgard-devtools-panel/ui"
import {browser} from "wxt/browser"
import {connectPanel} from "../../src/panel-connection.ts"
import {devtoolsTheme, extensionThemeStorage} from "../../src/theme.ts"

// `?tabId=` serves end-to-end tests, which open this page outside DevTools.
const tabId = browser.devtools?.inspectedWindow.tabId ?? Number(new URLSearchParams(location.search).get("tabId"))

const store = createPanelStore(connectPanel(tabId))
store.start()
const theme = createThemeStore({source: devtoolsTheme(), storage: extensionThemeStorage()})

const root = document.getElementById("root")
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Panel store={store} theme={theme} className="h-screen" />
    </StrictMode>,
  )
}
