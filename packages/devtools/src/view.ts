import type {Wordgard} from "wordgard/editor"
import type {Path, ViewInfo, ViewNode} from "./protocol.ts"
import {locate, pathFrom, truncate} from "./serialise.ts"

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

export const viewInfo = (wg: Wordgard): ViewInfo => ({
  status: {
    connected: wg.connected,
    editable: wg.editable,
    focusable: wg.focusable,
    focused: wg.hasFocus,
    composing: wg.composing,
    compositionStarted: wg.compositionStarted,
    root: wg.root instanceof ShadowRoot ? "shadow root" : "document",
  },
  dom: describe(wg, wg.contentDOM),
})

/**
 * The element drawing the node at `path`, else its nearest ancestor's (a text node draws none of
 * its own); the content element for the document. `own`: the node's own.
 */
export const nodeElement = (wg: Wordgard, path: Path): {element: Element; name: string; own: boolean} => {
  for (let at = path; at.length; at = at.slice(0, -1)) {
    const found = locate(wg.state.doc, at)
    const element = found && wg.nodeDOM(found.from)
    if (found && element && wg.nodeFromDOM(element)?.pos == found.from) {
      return {element, name: found.node.name, own: at.length == path.length}
    }
  }
  return {element: wg.contentDOM, name: wg.state.doc.name, own: !path.length}
}

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

/** An element's outer HTML, a text node's text. */
export const outerHTML = (node: Node) => (node instanceof Element ? node.outerHTML : (node.textContent ?? ""))

export const viewLabel = (node: Node) => (node instanceof Element ? node.tagName.toLowerCase() : "text")
