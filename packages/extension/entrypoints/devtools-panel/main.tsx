import "./style.css"
import {StrictMode} from "react"
import {createRoot} from "react-dom/client"

// Plan phase 2b replaces this with the panel on the chrome.runtime transport.
const Placeholder = () => (
  <main className="p-3 font-sans text-xs">
    <h1 className="font-semibold">Wordgard DevTools</h1>
    <p className="text-neutral-500">The extension's transport comes in phase 2b. Use the demo's in-page panel meanwhile.</p>
  </main>
)

const root = document.getElementById("root")
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Placeholder />
    </StrictMode>,
  )
}
