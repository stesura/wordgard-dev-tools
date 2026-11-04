import {cn} from "cn"
import {ChevronDownIcon, ChevronRightIcon, ChevronUpIcon} from "lucide-react"
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from "react"
import type {Path, SelectionInfo, StructureNode} from "wordgard-devtools"
import {Tag} from "#components/ui/badge"
import {Button} from "#components/ui/button"
import {ROOT, itemId, pathOf} from "./detail-cache.ts"
import {NodeMenu, createNodeMenuAnchor} from "./node-menu.tsx"
import {NodePane, SelectionStrip, isPrefix, json} from "./node-pane.tsx"
import {SplitPane} from "./split-pane.tsx"
import type {PanelStore} from "./store.ts"
import {createStructureSource} from "./structure-source.ts"

declare module "react" {
  interface CSSProperties {
    /** A node type's hue, for its colours. */
    "--hue"?: number
  }
}

// A colour per node type, so the same types read alike across the document.
export const hue = (name: string): CSSProperties => ({
  "--hue": [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7),
})
// Readable on both themes.
export const typeColour = "text-[hsl(var(--hue)_60%_38%)] dark:text-[hsl(var(--hue)_70%_72%)]"

type Marks = {
  selection: SelectionInfo | null
  focused: string
  matches: ReadonlySet<string>
  current: string | null
  /** Boxes whose content is hidden. */
  collapsed: ReadonlySet<string>
  toggle: (id: string) => void
}

/** The ids of the nodes matching a search, in document order: text leaves by their text, others by name or param. */
const search = (doc: StructureNode, query: string) => {
  const needle = query.toLowerCase()
  const found: string[] = []
  const walk = (node: StructureNode) => {
    const haystack = node.text ?? `${node.name} ${node.paramPreview ?? ""}`
    if (node.path.length && haystack.toLowerCase().includes(needle)) found.push(itemId(node.path))
    node.children.forEach(walk)
  }
  walk(doc)
  return found
}

const matchClass = (id: string, marks: Marks) =>
  marks.current == id ? "bg-yellow-500/40" : marks.matches.has(id) ? "bg-yellow-500/20" : ""

const selectionMark = (path: Path, selection: SelectionInfo | null) => {
  if (!selection || !path.length) return undefined
  const exact = (other: Path) => other.join() == path.join()
  if (exact(selection.headPath) || exact(selection.anchorPath)) return "innermost"
  return isPrefix(path, selection.headPath) || isPrefix(path, selection.anchorPath) ? "holds" : undefined
}

const MarkTags = ({node}: {node: StructureNode}) =>
  node.marks.map(mark => (
    <Tag key={mark.name}>
      {mark.name}
      {mark.preview != null && `=${mark.preview}`}
    </Tag>
  ))

const itemProps = (node: StructureNode, marks: Marks) => {
  const id = itemId(node.path)
  return {
    "data-path": node.path.join("."),
    "data-name": node.path.length ? node.name : undefined,
    "data-selection": selectionMark(node.path, marks.selection),
    role: "treeitem",
    "aria-level": node.path.length + 1,
    "aria-selected": marks.focused == id,
    // Roving focus: the focused item is the one Tab reaches.
    tabIndex: marks.focused == id ? 0 : -1,
  }
}

/** A text leaf or an inline node, in a row with its siblings (an inline plot holds its own row). */
const Chip = ({node, marks}: {node: StructureNode; marks: Marks}) => {
  const props = itemProps(node, marks)
  return (
    <span
      {...props}
      className={cn(
        "mr-1 mb-1 inline-flex cursor-default flex-wrap items-center gap-1 rounded border px-1 align-top outline-none",
        props["data-selection"] == "innermost" && "border-primary",
        props["aria-selected"] && "ring-2 ring-ring",
        matchClass(itemId(node.path), marks),
      )}
    >
      {node.name == "Text" && node.textPreview != null ? (
        <span className="whitespace-pre">{json(node.textPreview)}</span>
      ) : (
        <>
          <span className={typeColour} style={hue(node.name)}>
            {node.name}
          </span>
          {node.paramPreview != null && <span className="text-muted-foreground">{node.paramPreview}</span>}
        </>
      )}
      <MarkTags node={node} />
      <span className="text-muted-foreground">
        {node.from}–{node.to}
      </span>
      {node.children.length > 0 && (
        <span role="group" className="inline-flex flex-wrap">
          {node.children.map(child => (
            <Chip key={child.path.join(".")} node={child} marks={marks} />
          ))}
        </span>
      )}
    </span>
  )
}

/** A block: its header (name, param, marks, from and to), then its content, nested. */
const Box = ({node, marks}: {node: StructureNode; marks: Marks}) => {
  const props = itemProps(node, marks)
  // A textblock's children are inline: a row of chips.
  const inline = node.textPreview != null
  const id = itemId(node.path)
  const folder = node.children.length > 0
  const open = folder && !marks.collapsed.has(id)
  return (
    <div
      {...props}
      aria-expanded={folder ? open : undefined}
      className={cn(
        "mb-1 cursor-default rounded border border-l-4 border-l-[hsl(var(--hue)_60%_50%)] px-1.5 py-0.5 outline-none",
        props["data-selection"] && "bg-primary/5",
        props["aria-selected"] && "ring-2 ring-ring",
      )}
      style={hue(node.name)}
    >
      <div className={cn("flex items-center gap-2", matchClass(id, marks))}>
        {folder && (
          <button
            type="button"
            tabIndex={-1}
            aria-label={open ? "Collapse" : "Expand"}
            className="-mr-1 flex size-3.5 cursor-pointer items-center justify-center text-muted-foreground [&_svg]:size-3"
            onClick={event => {
              // Toggles only: not a click on the box.
              event.stopPropagation()
              marks.toggle(id)
            }}
          >
            {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
          </button>
        )}
        <span>{node.name}</span>
        {node.paramPreview != null && <span className="text-muted-foreground">{node.paramPreview}</span>}
        <MarkTags node={node} />
        <span className="ml-auto text-muted-foreground">
          {node.from}–{node.to}
        </span>
      </div>
      {open && (
        <div role="group" className={cn("pt-0.5 pl-2", inline && "flex flex-wrap")}>
          {node.children.map(child =>
            inline ? (
              <Chip key={child.path.join(".")} node={child} marks={marks} />
            ) : (
              <Box key={child.path.join(".")} node={child} marks={marks} />
            ),
          )}
        </div>
      )}
    </div>
  )
}

/** Scrolls an item into the structure's scroller, not the page around an in-page dock. */
export const scrollInto = (container: HTMLElement, element: Element) => {
  const top = element.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop
  if (top < container.scrollTop || top > container.scrollTop + container.clientHeight - 24) {
    container.scrollTop = top - 8
  }
}

const itemOf = (target: EventTarget) => (target instanceof Element ? target.closest("[data-path]") : null)

const pathOfItem = (element: Element | null) => {
  const path = element?.getAttribute("data-path")
  return path == null ? null : path ? path.split(".").map(Number) : []
}

/** The whole document as nested boxes, with positions. Mounted per editor. */
export const Structure = ({store, editorId}: {store: PanelStore; editorId: number}) => {
  const [source] = useState(() => createStructureSource(store.transport, editorId))
  const doc = useSyncExternalStore(source.subscribe, source.doc)
  const error = useSyncExternalStore(source.subscribe, source.error)
  const {selection} = useSyncExternalStore(store.subscribe, store.get)
  const info = selection?.id == editorId ? selection.info : null
  const [focused, setFocused] = useState<string>(ROOT)
  const scroller = useRef<HTMLDivElement | null>(null)
  // A clicked box's node is outlined in the page until another is clicked, or the tab or editor changes.
  const outlined = useRef(false)
  const highlight = useCallback(
    (path: Path | null) => {
      if (!path && !outlined.current) return
      outlined.current = path != null
      store.transport.send({type: "highlight", id: editorId, path}).catch(() => {})
    },
    [store, editorId],
  )

  // Focuses a node and scrolls to it, once the structure holding it has loaded and rendered.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  const reveal = useCallback(async (path: Path) => {
    setFocused(itemId(path))
    // Its ancestors open.
    setCollapsed(ids => {
      const ancestors = path.map((_, depth) => itemId(path.slice(0, depth)))
      if (!ancestors.some(id => ids.has(id))) return ids
      return new Set([...ids].filter(id => !ancestors.includes(id)))
    })
    await source.ready()
    for (let frame = 0; frame < 30; frame++) {
      await new Promise(requestAnimationFrame)
      const container = scroller.current
      const element = container?.querySelector(`[data-path='${path.join(".")}']`)
      if (!container || !element) continue
      scrollInto(container, element)
      return
    }
  }, [source])

  // Loads while its tab is shown: on showing (when the document changed meanwhile) and on each
  // document change. Takes a pick's reveal while shown.
  const container = useCallback(
    (element: HTMLDivElement | null) => {
      scroller.current = element
      if (!element) return
      const shown = () => store.get().view == "structure"
      let stale = true
      const load = () => {
        stale = false
        void source.load()
      }
      const takeReveal = () => {
        if (!shown()) return
        const path = store.takeReveal(editorId)
        if (path) void reveal(path)
      }
      const stopDoc = store.onDocChanged(id => {
        if (id != editorId) return
        if (shown()) load()
        else stale = true
      })
      const stopStore = store.subscribe(() => {
        if (!shown()) highlight(null)
        else if (stale) load()
      })
      const stopReveal = store.onReveal(takeReveal)
      if (shown()) load()
      takeReveal()
      return () => {
        highlight(null)
        stopDoc()
        stopStore()
        stopReveal()
        scroller.current = null
      }
    },
    [store, editorId, source, reveal, highlight],
  )

  const focusItem = (element: Element | null) => {
    const path = pathOfItem(element)
    if (!element || !path || !(element instanceof HTMLElement)) return
    setFocused(itemId(path))
    element.focus({preventScroll: true})
    if (scroller.current) scrollInto(scroller.current, element)
  }

  // Closing a box that holds the focused node moves focus to the box.
  const toggle = (id: string) => {
    const closing = !collapsed.has(id)
    setCollapsed(ids => {
      const next = new Set(ids)
      if (!next.delete(id)) next.add(id)
      return next
    })
    const path = pathOf(id)
    if (closing && focused != id && isPrefix(path, pathOf(focused))) setFocused(id)
  }

  // The box a context menu opens on takes focus.
  const [menu] = useState(() => createNodeMenuAnchor(row => focusItem(row)))

  // Arrows walk the items in document order; Home and End jump to the ends.
  const onKeyDown = (event: KeyboardEvent) => {
    menu.onKeyDown(event)
    if (event.defaultPrevented) return
    const items = [...(scroller.current?.querySelectorAll("[role='treeitem']") ?? [])]
    const index = items.findIndex(item => pathOfItem(item)?.join(".") == pathOf(focused).join("."))
    // As in a tree: Right opens a closed box, Left closes an open one; otherwise they walk.
    const item = items[index]
    if (item?.getAttribute("aria-expanded") == (event.key == "ArrowRight" ? "false" : "true")) {
      if (event.key == "ArrowRight" || event.key == "ArrowLeft") {
        event.preventDefault()
        toggle(focused)
        return
      }
    }
    const step: Record<string, number> = {ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1}
    const target =
      event.key == "Home"
        ? items[0]
        : event.key == "End"
          ? items.at(-1)
          : event.key in step
            ? items[Math.max(0, Math.min(items.length - 1, index + (step[event.key] ?? 0)))]
            : undefined
    if (!target) return
    event.preventDefault()
    focusItem(target)
  }

  const [query, setQuery] = useState("")
  const [current, setCurrent] = useState(0)
  const matches = useMemo(() => (doc && query ? search(doc, query) : []), [doc, query])
  const index = Math.min(current, matches.length - 1)
  const currentMatch = matches[index] ?? null

  const go = (next: number) => {
    const id = matches[(next + matches.length) % matches.length]
    if (id == null) return
    setCurrent(matches.indexOf(id))
    void reveal(pathOf(id))
  }

  const onSearch = (value: string) => {
    setQuery(value)
    setCurrent(0)
    const first = doc && value ? search(doc, value)[0] : undefined
    if (first) void reveal(pathOf(first))
  }

  const marks = {selection: info, focused, matches: new Set(matches), current: currentMatch, collapsed, toggle}

  return (
    <div className="@container flex min-h-0 flex-1 flex-col">
      <SelectionStrip selection={info} onReveal={() => info && void reveal(info.headPath)} />
      {error != null && (
        <p role="alert" className="flex items-center gap-2 border-b px-2 py-1 text-destructive">
          Couldn't load the structure: {error}
          <Button variant="outline" size="xs" onClick={() => void source.load()}>
            Retry
          </Button>
        </p>
      )}
      <div className="flex h-7 shrink-0 items-center gap-1 border-b px-2 text-xs">
        <input
          type="search"
          value={query}
          onChange={event => onSearch(event.target.value)}
          onKeyDown={event => {
            if (event.key == "Enter") {
              event.preventDefault()
              go(index + (event.shiftKey ? -1 : 1))
            } else if (event.key == "Escape") onSearch("")
          }}
          aria-label="Search the structure"
          placeholder="Search text, node names, params"
          className="h-6 min-w-0 flex-1 bg-transparent outline-none"
        />
        {query && (
          <span className="shrink-0 text-muted-foreground" aria-live="polite">
            {matches.length ? `${index + 1}/${matches.length}` : "No matches"}
          </span>
        )}
        <Button variant="ghost" size="icon-xs" aria-label="Previous match" disabled={!matches.length} onClick={() => go(index - 1)}>
          <ChevronUpIcon />
        </Button>
        <Button variant="ghost" size="icon-xs" aria-label="Next match" disabled={!matches.length} onClick={() => go(index + 1)}>
          <ChevronDownIcon />
        </Button>
      </div>
      <SplitPane pane={<NodePane source={source} focused={focused == ROOT ? null : focused} />}>
        <div
          ref={container}
          role="tree"
          aria-label="Document structure"
          className="min-w-0 flex-1 overflow-auto p-2 font-mono text-xs"
          onClick={(event: MouseEvent) => {
            const item = itemOf(event.target)
            focusItem(item)
            const path = pathOfItem(item)
            if (path) highlight(path)
          }}
          // Scrolls the node into view in the editor.
          onDoubleClick={(event: MouseEvent) => {
            const path = pathOfItem(itemOf(event.target))
            if (path) store.transport.send({type: "scrollIntoView", id: editorId, path}).catch(() => {})
          }}
          onKeyDown={onKeyDown}
          onContextMenu={menu.onContextMenu}
        >
          {doc && <Box node={doc} marks={marks} />}
        </div>
      </SplitPane>
      <NodeMenu store={store} editorId={editorId} anchor={menu} view="structure" />
    </div>
  )
}
