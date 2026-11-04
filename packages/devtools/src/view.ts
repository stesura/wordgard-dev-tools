import type {Wordgard} from "wordgard/editor"
import type {Path, ViewInfo, ViewNode} from "./protocol.ts"
import {pathFrom, truncate} from "./serialise.ts"

// Loaded with the serialisers, on the first panel request.

/** The children the View tab lists: elements, and text that isn't only whitespace. */
const listed = (node: Node) =>
  [...node.childNodes].filter(child => child instanceof Element || (child instanceof Text && child.data.trim() != ""))

const drawn = (wg: Wordgard, element: Element): ViewNode["node"] => {
  const found = wg.nodeFromDOM(element)
  if (!found || wg.nodeDOM(found.pos) != element) return null
  const path: Path = pathFrom(wg.state.doc, found.pos)
  return {name: found.node.name, path, from: found.pos, to: found.pos + found.node.length}
}

const position = (wg: Wordgard, text: Text) => {
  try {
    return wg.posAtDOM(text, 0)
  } catch {
    return null
  }
}

const describe = (wg: Wordgard, dom: Node): ViewNode => {
  if (dom instanceof Text) {
    return {kind: "text", tag: null, attrs: [], text: truncate(dom.data), node: null, pos: position(wg, dom), chrome: false, children: []}
  }
  const element = dom instanceof Element ? dom : null
  const node = element && element != wg.contentDOM ? drawn(wg, element) : null
  const uneditable = element?.closest("[contenteditable='false']")
  return {
    kind: "element",
    tag: element?.tagName.toLowerCase() ?? null,
    attrs: element ? [...element.attributes].map(a => [a.name, truncate(a.value)]) : [],
    text: null,
    node,
    pos: null,
    // Inside the content, uneditable and drawing no node (an atom's own element draws its node).
    // A read-only editor marks the content element itself uneditable: that isn't chrome.
    chrome: !node && uneditable != null && uneditable != wg.contentDOM && wg.contentDOM.contains(uneditable),
    children: listed(dom).map(child => describe(wg, child)),
  }
}

const head = (wg: Wordgard) => {
  try {
    const {left, top, bottom} = wg.coordsAtPos(wg.state.selection.head)
    return {left: Math.round(left), top: Math.round(top), bottom: Math.round(bottom)}
  } catch {
    return null
  }
}

export const viewInfo = (wg: Wordgard): ViewInfo => ({
  status: {
    connected: wg.connected,
    editable: wg.editable,
    focusable: wg.focusable,
    focused: wg.hasFocus,
    composing: wg.composing,
    compositionStarted: wg.compositionStarted,
    // Class names are often minified, and the page may have another copy of Wordgard: Wordgard's own
    // class extends nothing.
    kind: Object.getPrototypeOf(Object.getPrototypeOf(wg)) == Object.prototype ? "Wordgard" : "a Wordgard subclass (react-wordgard's, say)",
    root: wg.root instanceof ShadowRoot ? "shadow root" : "document",
    themeClasses: wg.themeClasses,
    head: head(wg),
  },
  dom: describe(wg, wg.contentDOM),
})

/** The DOM node at `path` (child indices as `viewInfo` lists them). */
export const viewNode = (wg: Wordgard, path: readonly number[]): Node => {
  let node: Node = wg.contentDOM
  for (const index of path) {
    const child = listed(node)[index]
    if (!child) throw new Error("That element is gone: the view changed")
    node = child
  }
  return node
}

export const viewLabel = (node: Node) => (node instanceof Element ? node.tagName.toLowerCase() : "text")
