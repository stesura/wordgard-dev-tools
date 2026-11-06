import {useVirtualizer} from "@tanstack/react-virtual"
import {cn} from "cn"
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronDownUpIcon,
  ChevronUpDownIcon,
  ClipboardDocumentIcon,
  CodeBracketIcon,
  CommandLineIcon,
  InformationCircleIcon,
  NoSymbolIcon,
  RectangleGroupIcon,
} from "#icons"
import {useCallback, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent} from "react"
import type {Path, ViewInfo, ViewNode} from "@stesura/wordgard-dev-tools"
import {Tag} from "#components/ui/badge"
import {Button} from "#components/ui/button"
import {ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger} from "#components/ui/context-menu"
import {hue, typeColour} from "./colours.ts"
import {SearchBox, centreRow, includes, matchClass, useSearch} from "./search.tsx"
import {CopySelection, copy, createMenuAnchor, type MenuAnchor} from "./node-menu.tsx"
import type {PanelStore} from "./store.ts"
import {Tip} from "./tip.tsx"
import {createViewSource} from "./view-source.ts"

const ROW = 20
const INDENT = 14

/** One DOM node: its id is its child indices from the content element (`""` for it), dot-separated. */
type Line = {id: string; depth: number; node: ViewNode; collapsed: boolean}

const pathOf = (id: string) => (id ? id.split(".").map(Number) : [])

/** The document node a line's element draws, else its nearest ancestor's (a text node draws none). */
const drawnBy = (root: ViewNode, id: string) => {
  let node: ViewNode | undefined = root
  let found = root.node
  for (const index of pathOf(id)) {
    node = node?.children[index]
    found = node?.node ?? found
  }
  return found
}

type DomTarget = {id: string}

/** A DOM line's context menu. */
const DomMenu = ({
  store,
  editorId,
  dom,
  anchor,
  tree,
  onElement,
}: {
  store: PanelStore
  editorId: number
  dom: ViewNode | null
  anchor: MenuAnchor<DomTarget>
  tree: HTMLElement | null
  onElement: (id: string, action: "log" | "logHTML") => void
}) => {
  const {subscribe, get, setTrigger} = anchor
  const target = useSyncExternalStore(subscribe, get)
  const node = target && dom ? drawnBy(dom, target.id) : null
  const copyHTML = async (id: string) => copy(await store.transport.send({type: "viewHTML", id: editorId, path: pathOf(id)}))
  return (
    <ContextMenu>
      <ContextMenuTrigger className="hidden">
        <span ref={setTrigger} />
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52" finalFocus={() => tree ?? true}>
        <CopySelection text={target?.selection} />
        <ContextMenuItem className="text-xs" disabled={node == null} onClick={() => node && store.showNode(editorId, node.path)}>
          <RectangleGroupIcon /> Show {node?.name ?? "its node"} in Structure
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem className="text-xs" onClick={() => target && onElement(target.id, "log")}>
          <CommandLineIcon /> Log element
        </ContextMenuItem>
        <ContextMenuItem className="text-xs" onClick={() => target && onElement(target.id, "logHTML")}>
          <CodeBracketIcon /> Log outer HTML
        </ContextMenuItem>
        <ContextMenuItem className="text-xs" onClick={() => target && void copyHTML(target.id).catch(() => {})}>
          <ClipboardDocumentIcon /> Copy outer HTML
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

const flatten = (root: ViewNode, collapsed: ReadonlySet<string>) => {
  const lines: Line[] = []
  const walk = (node: ViewNode, id: string, depth: number) => {
    const shut = collapsed.has(id) && node.children.length > 0
    lines.push({id, depth, node, collapsed: shut})
    if (!shut) node.children.forEach((child, index) => walk(child, id ? `${id}.${index}` : String(index), depth + 1))
  }
  walk(root, "", 0)
  return lines
}

/** The line of the element drawing the node at `path`, else its nearest ancestor's; the content element's for the document. */
const lineOf = (root: ViewNode, path: Path) => {
  const find = (node: ViewNode, id: string, key: string): string | null => {
    if (node.node?.path.join(".") == key) return id
    for (const [index, child] of node.children.entries()) {
      const found = find(child, id ? `${id}.${index}` : String(index), key)
      if (found != null) return found
    }
    return null
  }
  for (let at = path; at.length; at = at.slice(0, -1)) {
    const found = find(root, "", at.join("."))
    if (found != null) return found
  }
  return ""
}

/** Ids of the nodes matching a query, in display order: text by its text, elements by tag, attribute or node name. */
const search = (root: ViewNode, query: string) => {
  const found: string[] = []
  const walk = (node: ViewNode, id: string) => {
    const hit =
      node.kind == "text"
        ? includes(node.text ?? "", query)
        : includes(node.tag ?? "", query) ||
          node.attrs.some(([name, value]) => includes(`${name}="${value}"`, query)) ||
          (node.node != null && includes(node.node.name, query))
    if (hit) found.push(id)
    node.children.forEach((child, index) => walk(child, id ? `${id}.${index}` : String(index)))
  }
  walk(root, "")
  return found
}

const folders = (node: ViewNode, id = "", out: string[] = []) => {
  if (!node.children.length) return out
  out.push(id)
  node.children.forEach((child, index) => folders(child, id ? `${id}.${index}` : String(index), out))
  return out
}

const Row = ({
  line,
  start,
  focused,
  match,
  onToggle,
}: {
  line: Line
  start: number
  focused: boolean
  /** A search match's tint, in place of the focus's. */
  match: string
  onToggle: (id: string) => void
}) => {
  const {node} = line
  const folder = node.children.length > 0
  return (
    <div
      id={`view-${line.id || "root"}`}
      role="treeitem"
      aria-level={line.depth + 1}
      aria-expanded={folder ? !line.collapsed : undefined}
      aria-selected={focused}
      data-dom={line.id}
      className={cn(
        "absolute inset-x-0 top-0 flex cursor-default items-center gap-1 pr-2 font-mono text-xs whitespace-nowrap ring-inset",
        match || (focused && "bg-accent"),
      )}
      style={{height: ROW, transform: `translateY(${start}px)`, paddingLeft: line.depth * INDENT + 4}}
    >
      <span className="flex w-3 shrink-0 justify-center text-muted-foreground [&_svg]:size-3">
        {folder && (
          <button
            type="button"
            tabIndex={-1}
            aria-label={line.collapsed ? "Expand" : "Collapse"}
            className="cursor-pointer"
            onClick={event => {
              event.stopPropagation()
              onToggle(line.id)
            }}
          >
            {line.collapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
          </button>
        )}
      </span>
      {node.kind == "text" ? (
        <>
          <span className="truncate text-green-700 dark:text-green-400">{JSON.stringify(node.text)}</span>
          {node.pos != null && <span className="text-muted-foreground">pos {node.pos}</span>}
        </>
      ) : (
        <>
          {/* Long attribute lists are cut, not the node's badges after them. */}
          <span className="min-w-0 truncate text-sky-700 dark:text-sky-400">
            &lt;{node.tag}
            {node.attrs.length > 0 && (
              <span className="text-muted-foreground">{node.attrs.map(([name, value]) => ` ${name}="${value}"`).join("")}</span>
            )}
            &gt;
          </span>
          {node.node && (
            <Tag className={cn("shrink-0", typeColour)} style={hue("node", node.node.name)}>
              {node.node.name} {node.node.from}–{node.node.to}
            </Tag>
          )}
          {node.chrome && <Tag className="shrink-0">chrome</Tag>}
        </>
      )}
    </div>
  )
}

const flag = (on: boolean) => (on ? "yes" : "no")

const Status = ({status}: {status: ViewInfo["status"]}) => {
  const items: [label: string, value: string, tip: string][] = [
    ["root", status.root, "Where the editor lives: in the page's document, or inside a shadow root."],
    ["connected", flag(status.connected), "Attached to the page and drawing. When not, document changes aren't drawn."],
    ["editable", flag(status.editable), "The user can type in it. No: it's read-only."],
    ["focusable", flag(status.focusable), "It can take keyboard focus: it's editable, or read-only with a tabindex."],
    ["focused", flag(status.focused), "It has keyboard focus now. Clicking in the in-page panel takes focus from it."],
    [
      "IME",
      status.composing ? (status.compositionStarted ? "composing, text changed" : "composing") : "no",
      "Typing through an input method (IME), as for Chinese or Japanese, or on some Android keyboards.",
    ],
  ]
  return (
    <dl aria-label="View status" className="flex shrink-0 flex-wrap gap-x-3 gap-y-0.5 border-b px-2 py-1 text-xs">
      {items.map(([label, value, tip]) => (
        <div key={label} className="flex gap-1">
          <Tip label={<span className="block max-w-64">{tip}</span>}>
            <dt className="cursor-help text-muted-foreground underline decoration-dotted underline-offset-2">{label}:</dt>
          </Tip>
          <dd className="font-mono">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** The editor's view: its status and its content's DOM, mapped to the document. Mounted per editor. */
export const View = ({store, editorId}: {store: PanelStore; editorId: number}) => {
  // TanStack Virtual can't be memoized: not compiled; this component keeps its manual memoization.
  "use no memo"
  const [source] = useState(() => createViewSource(store.transport, editorId))
  const {info, error} = useSyncExternalStore(source.subscribe, source.get)
  const [collapsed, setCollapsedState] = useState<ReadonlySet<string>>(() => new Set())
  // Also read by a reveal, which runs outside a render.
  const collapsedNow = useRef(collapsed)
  const setCollapsed = (next: ReadonlySet<string>) => {
    collapsedNow.current = next
    setCollapsedState(next)
  }
  // Nothing until the user picks a line.
  const [focused, setFocused] = useState<string | null>(null)
  // State: the virtualizer reads its element when this component renders.
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null)
  const lines = useMemo(() => (info ? flatten(info.dom, collapsed) : []), [info, collapsed])
  const outlined = useRef(false)

  // eslint-disable-next-line react-hooks/incompatible-library -- not compiled: "use no memo" above
  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => ROW,
    overscan: 20,
  })

  const element = (id: string, action: "outline" | "log" | "logHTML") =>
    // The element may have changed since the last load: load again.
    store.transport.send({type: "viewElement", id: editorId, path: pathOf(id), action}).catch(() => source.load())

  const hide = useCallback(() => {
    if (!outlined.current) return
    outlined.current = false
    store.transport.send({type: "highlight", id: editorId, path: null}).catch(() => {})
  }, [store, editorId])

  // A clicked element is outlined in the page until another is clicked, or the tab or editor changes.
  const select = (id: string) => {
    setFocused(id)
    outlined.current = true
    void element(id, "outline")
  }

  // A line opened up to, selected and scrolled to. Takes the scroller: the reveal calls it from its first render's closure.
  const showLine = (dom: ViewNode, id: string, scroller: HTMLElement | null) => {
    const next = new Set(collapsedNow.current)
    const parts = id ? id.split(".") : []
    for (let depth = 0; depth < parts.length; depth++) next.delete(parts.slice(0, depth).join("."))
    setCollapsed(next)
    select(id)
    centreRow(scroller, flatten(dom, next).findIndex(line => line.id == id), ROW)
  }

  const find = useMemo(() => (info ? (query: string) => search(info.dom, query) : null), [info])
  const searching = useSearch(find, id => info && showLine(info.dom, id, scrollElement))

  const toggle = (id: string) => {
    const closing = !collapsed.has(id)
    const next = new Set(collapsedNow.current)
    if (!next.delete(id)) next.add(id)
    setCollapsed(next)
    if (closing && focused != null && focused.startsWith(id ? `${id}.` : "") && focused != id) setFocused(id)
  }

  // Loads while its tab is shown: on showing (when the editor updated meanwhile) and on each update.
  const container = useCallback(
    (scroller: HTMLDivElement | null) => {
      setScrollElement(scroller)
      if (!scroller) return
      const shown = () => store.get().view == "view"
      let stale = true
      const load = () => {
        stale = false
        void source.load()
      }
      const stopState = store.onStateChanged(id => {
        if (id != editorId) return
        if (shown()) load()
        else stale = true
      })
      const stopStore = store.subscribe(() => {
        if (!shown()) hide()
        else if (stale) load()
      })
      // A "show in DOM" from the Structure: its element (or nearest ancestor's) opened up to, selected and scrolled to.
      const reveal = (path: Path) => {
        const info = source.get().info
        if (info) showLine(info.dom, lineOf(info.dom, path), scroller)
      }
      const takeReveal = () => {
        if (!shown()) return
        const path = store.takeDomReveal(editorId)
        if (path) void source.load().then(() => reveal(path))
      }
      const stopReveal = store.onReveal(takeReveal)
      if (shown()) load()
      takeReveal()
      return () => {
        stopState()
        stopStore()
        stopReveal()
        hide()
      }
    },
    // `showLine` reads the latest values through refs and setters: the first render's copy is enough,
    // and listing it would re-subscribe on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, editorId, source, hide],
  )

  const scrollToLine = (position: number) => {
    if (!scrollElement || position < 0) return
    const top = position * ROW
    if (top < scrollElement.scrollTop) scrollElement.scrollTop = top
    else if (top + ROW > scrollElement.scrollTop + scrollElement.clientHeight) {
      scrollElement.scrollTop = top + ROW - scrollElement.clientHeight
    }
  }

  const focusLine = (position: number) => {
    const line = lines[Math.max(0, Math.min(lines.length - 1, position))]
    if (!line) return
    select(line.id)
    scrollToLine(lines.indexOf(line))
  }

  // The line a menu opens on is selected (and outlined).
  const [menu] = useState(() =>
    createMenuAnchor<DomTarget>(
      "[data-dom]",
      row => ({id: row.getAttribute("data-dom") ?? ""}),
      (_, target) => select(target.id),
    ),
  )

  // As in a tree: Right opens a closed element or goes to its first child; Left closes or goes to the parent.
  const onKeyDown = (event: KeyboardEvent) => {
    menu.onKeyDown(event)
    if (event.defaultPrevented) return
    const position = lines.findIndex(line => line.id == focused)
    const line = lines[position]
    const moves: Partial<Record<string, number>> = {ArrowDown: position + 1, ArrowUp: position - 1, Home: 0, End: lines.length - 1}
    const target = moves[event.key]
    const folder = line != null && line.node.children.length > 0
    if (target != null) {
      event.preventDefault()
      focusLine(target)
    } else if (line && folder && event.key == "ArrowRight") {
      event.preventDefault()
      if (line.collapsed) toggle(line.id)
      else focusLine(position + 1)
    } else if (line && event.key == "ArrowLeft") {
      event.preventDefault()
      if (folder && !line.collapsed) toggle(line.id)
      else if (line.id) focusLine(lines.findIndex(other => other.id == line.id.replace(/\.?\d+$/, "")))
    }
  }

  const rendered = virtualizer.getVirtualItems()
  const active = rendered.some(item => lines[item.index]?.id == focused) ? focused : null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {error != null && (
        <p role="alert" className="flex items-center gap-2 border-b px-2 py-1 text-destructive">
          Couldn't load the view: {error}
          <Button variant="outline" size="xs" onClick={() => void source.load()}>
            Retry
          </Button>
        </p>
      )}
      {info && <Status status={info.status} />}
      <div className="flex h-7 shrink-0 items-center gap-1 border-b bg-strip px-2 text-xs">
        <SearchBox search={searching} label="Search the DOM" placeholder="Search text, tags, attributes, node names" />
        <Tip label="The content's DOM, each element with the node it draws">
          <button type="button" aria-label="About the DOM" className="flex text-muted-foreground hover:text-foreground [&_svg]:size-3.5">
            <InformationCircleIcon />
          </button>
        </Tip>
        <span className="flex items-center gap-1">
          <Tip label="Clear the selection and its outline in the page">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Clear the selection"
              disabled={focused == null}
              onClick={() => {
                setFocused(null)
                hide()
              }}
            >
              <NoSymbolIcon />
            </Button>
          </Tip>
          <Tip label="Log the selected element to the page's console">
            <Button variant="ghost" size="icon-xs" aria-label="Log to the console" onClick={() => void element(focused ?? "", "log")}>
              <CommandLineIcon />
            </Button>
          </Tip>
          <Tip label="Expand all">
            <Button variant="ghost" size="icon-xs" aria-label="Expand all" onClick={() => setCollapsed(new Set())}>
              <ChevronUpDownIcon />
            </Button>
          </Tip>
          <Tip label="Collapse all">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Collapse all"
              // The content element stays open: its blocks show.
              onClick={() => {
                setCollapsed(new Set(info ? folders(info.dom).filter(id => id != "") : []))
                if (focused) setFocused(focused.split(".")[0] ?? "")
              }}
            >
              <ChevronDownUpIcon />
            </Button>
          </Tip>
        </span>
      </div>
      <div
        ref={container}
        role="tree"
        aria-label="View"
        tabIndex={0}
        aria-activedescendant={active == null ? undefined : `view-${active || "root"}`}
        onKeyDown={onKeyDown}
        onContextMenu={menu.onContextMenu}
        onClick={event => {
          const id = event.target instanceof Element ? event.target.closest("[data-dom]")?.getAttribute("data-dom") : null
          if (id != null) select(id)
        }}
        className="relative min-h-0 flex-1 overflow-auto outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <div style={{height: virtualizer.getTotalSize()}}>
          {rendered.map(item => {
            const line = lines[item.index]
            return (
              line && (
                <Row
                  key={line.id}
                  line={line}
                  start={item.start}
                  focused={line.id == focused}
                  match={matchClass(line.id, searching)}
                  onToggle={toggle}
                />
              )
            )
          })}
        </div>
      </div>
      <DomMenu
        store={store}
        editorId={editorId}
        dom={info?.dom ?? null}
        anchor={menu}
        tree={scrollElement}
        onElement={(id, action) => void element(id, action)}
      />
    </div>
  )
}
