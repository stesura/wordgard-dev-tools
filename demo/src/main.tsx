import "./style.css"
import {StrictMode} from "react"
import {createRoot} from "react-dom/client"
import {Wordgard} from "wordgard/editor"
import {history} from "wordgard/history"
import {basicSchema} from "wordgard/schema"
import type {GardState} from "wordgard/state"
import {wordgardDevtools} from "wordgard-devtools"
import {mountDevtools} from "wordgard-devtools-panel"
import {ReactEditor} from "./ReactEditor.tsx"

const plain = (id: string, doc: string, extra: GardState.Extension) => {
  const parent = document.getElementById(id)
  if (!parent) throw new Error(`No #${id}`)
  return Wordgard.create({parent, doc, config: [basicSchema(), history(), extra]})
}

plain(
  "plain",
  "<h2>Plain Wordgard</h2><p>Created with <code>Wordgard.create</code>, named <strong>plain</strong>.</p>",
  wordgardDevtools({name: "plain"}),
)
// Two plugins on one editor: still one entry, named by the one with a name.
plain("left", "<p>Left editor.</p>", [wordgardDevtools(), wordgardDevtools({name: "left"})])
plain("right", "<p>Right editor.</p>", wordgardDevtools({name: "right"}))

const root = document.getElementById("react")
if (root) {
  createRoot(root).render(
    <StrictMode>
      <ReactEditor />
    </StrictMode>,
  )
}

mountDevtools()
