import "./style.css"
import {StrictMode} from "react"
import {createRoot} from "react-dom/client"
import type {Plot} from "wordgard/doc"
import {Wordgard} from "wordgard/editor"
import {history} from "wordgard/history"
import {basicSchema} from "wordgard/schema"
import {GardState} from "wordgard/state"
import {wordgardDevtools} from "wordgard-devtools"
import {mountDevtools} from "wordgard-devtools-panel"
import {ReactEditor} from "./ReactEditor.tsx"

const plain = (id: string, doc: string, extra: GardState.Extension) => {
  const parent = document.getElementById(id)
  if (!parent) throw new Error(`No #${id}`)
  return Wordgard.create({parent, doc, config: [basicSchema(), history(), extra]})
}

// A state field, named for the Fields tab.
const words = (doc: Plot.Doc) => doc.textContent({blockSeparator: " "}).split(/\s+/).filter(Boolean).length
const wordCount = GardState.Field.define<number>({
  create: state => words(state.doc),
  update: (count, tr) => (tr.docChanged ? words(tr.newDoc) : count),
})

plain(
  "plain",
  "<h2>Plain Wordgard</h2><p>Created with <code>Wordgard.create</code>, named <strong>plain</strong>.</p>",
  [wordCount, wordgardDevtools({name: "plain", fields: {wordCount}})],
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
