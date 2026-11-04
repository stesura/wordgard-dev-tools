import {BookTypeIcon, ClipboardCopyIcon, CrosshairIcon, ListTreeIcon, ScanIcon, TerminalIcon} from "lucide-react"
import {useSyncExternalStore, type KeyboardEvent, type MouseEvent} from "react"
import type {Path} from "wordgard-devtools"
import {ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger} from "#components/ui/context-menu"
import type {PanelStore} from "./store.ts"

type Target = {path: Path; name: string | null; row: HTMLElement}

/**
 * One context menu per view, opened through a hidden trigger (as Stesura's editor does): no
 * menu root or trigger wraps the rows, so opening it re-renders only the menu, and Base UI keeps
 * its own anchoring and dismissal.
 */
export type NodeMenuAnchor = {
  get: () => Target | null
  subscribe: (listener: () => void) => () => void
  setTrigger: (element: HTMLElement | null) => void
  /** For the rows' container: a right-click, or Shift+F10 / the ContextMenu key on the focused row. */
  onContextMenu: (event: MouseEvent) => void
  onKeyDown: (event: KeyboardEvent) => void
}

const rowOf = (target: EventTarget | null) => (target instanceof Element ? target.closest<HTMLElement>("[data-path]") : null)
const pathOf = (row: HTMLElement): Path => {
  const path = row.getAttribute("data-path") ?? ""
  return path ? path.split(".").map(Number) : []
}

/** `focus`: the view focuses the row the menu opens on. */
export const createNodeMenuAnchor = (focus: (row: HTMLElement, path: Path) => void): NodeMenuAnchor => {
  let target: Target | null = null
  let trigger: HTMLElement | null = null
  const listeners = new Set<() => void>()
  const open = (row: HTMLElement, clientX: number, clientY: number) => {
    target = {path: pathOf(row), name: row.getAttribute("data-name"), row}
    focus(row, target.path)
    for (const listener of listeners) listener()
    trigger?.dispatchEvent(new globalThis.MouseEvent("contextmenu", {bubbles: true, cancelable: true, clientX, clientY}))
  }
  return {
    get: () => target,
    subscribe: listener => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    setTrigger: element => {
      trigger = element
    },
    onContextMenu: event => {
      const row = rowOf(event.target)
      if (!row) return
      event.preventDefault()
      open(row, event.clientX, event.clientY)
    },
    onKeyDown: event => {
      if (event.key != "ContextMenu" && !(event.key == "F10" && event.shiftKey)) return
      const root = event.currentTarget.getRootNode()
      const focused = root instanceof Document || root instanceof ShadowRoot ? root.activeElement : null
      const row = rowOf(focused)
      if (!row) return
      event.preventDefault()
      const rect = row.getBoundingClientRect()
      open(row, rect.left + 16, rect.bottom)
    },
  }
}

// Through a textarea when the Clipboard API is refused (a DevTools panel isn't always allowed it).
const copy = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const area = document.createElement("textarea")
    area.value = text
    document.body.append(area)
    area.select()
    document.execCommand("copy")
    area.remove()
  }
}

const views = {tree: "Tree", structure: "Structure"}

export const NodeMenu = ({
  store,
  editorId,
  anchor,
  view,
}: {
  store: PanelStore
  editorId: number
  anchor: NodeMenuAnchor
  view: "tree" | "structure"
}) => {
  const target = useSyncExternalStore(anchor.subscribe, anchor.get)
  const path = target?.path ?? []
  const other = view == "tree" ? "structure" : "tree"
  const copyJSON = async () => {
    const node = await store.transport.send({type: "node", id: editorId, path})
    await copy(JSON.stringify(node.json, null, 2))
  }
  return (
    <ContextMenu>
      <ContextMenuTrigger className="hidden">
        <span ref={anchor.setTrigger} />
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52" finalFocus={() => anchor.get()?.row ?? true}>
        <ContextMenuItem
          className="text-xs"
          onClick={() => store.transport.send({type: "scrollIntoView", id: editorId, path}).catch(() => {})}
        >
          <ScanIcon /> Scroll into view in the page
        </ContextMenuItem>
        <ContextMenuItem className="text-xs" onClick={() => store.showNode(editorId, path, other)}>
          <ListTreeIcon /> Show in {views[other]}
        </ContextMenuItem>
        <ContextMenuItem
          className="text-xs"
          disabled={target?.name == null}
          onClick={() => target?.name != null && store.showType(editorId, target.name)}
        >
          <BookTypeIcon /> Show {target?.name ?? "its"} type in Schema
        </ContextMenuItem>
        <ContextMenuItem
          className="text-xs"
          onClick={() => store.transport.send({type: "logNode", id: editorId, path}).catch(() => {})}
        >
          <TerminalIcon /> Log to the page's console
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem className="text-xs" disabled={!path.length} onClick={() => void copyJSON().catch(() => {})}>
          <ClipboardCopyIcon /> Copy JSON
        </ContextMenuItem>
        <ContextMenuItem className="text-xs" onClick={() => void copy(`[${path.join(", ")}]`)}>
          <CrosshairIcon /> Copy path
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
