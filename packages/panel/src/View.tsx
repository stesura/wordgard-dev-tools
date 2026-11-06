import {useVirtualizer} from "@tanstack/react-virtual"
import {cn} from "cn"
import {ChevronDownIcon, ChevronRightIcon, ArrowsPointingInIcon, ArrowsPointingOutIcon, CommandLineIcon} from "#icons"
import {useCallback, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent} from "react"
import type {ViewInfo, ViewNode} from "@stesura/wordgard-dev-tools"
import {Tag} from "#components/ui/badge"
import {Button} from "#components/ui/button"
import {hue, typeColour} from "./colours.ts"
import type {PanelStore} from "./store.ts"
import {Tip} from "./tip.tsx"
import {createViewSource} from "./view-source.ts"

const ROW = 20
const INDENT = 14

/** One DOM node: its id is its child indices from the content element (`""` for it), dot-separated. */
type Line = {id: string; depth: number; node: ViewNode; collapsed: boolean}

const pathOf = (id: string) => (id ? id.split(".").map(Number) : [])

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

const folders = (node: ViewNode, id = "", out: string[] = []) => {
  if (!node.children.length) return out
  out.push(id)
  node.children.forEach((child, index) => folders(child, id ? `${id}.${index}` : String(index), out))
  return out
}

const Row = ({line, start, focused, onToggle}: {line: Line; start: number; focused: boolean; onToggle: (id: string) => void}) => {
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
        "absolute inset-x-0 top-0 flex cursor-default items-center gap-1 pr-2 font-mono text-xs whitespace-nowrap",
        focused && "bg-accent",
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
  const items: [string, string][] = [
    ["editor", status.kind],
    ["in", status.root],
    ["connected", flag(status.connected)],
    ["editable", flag(status.editable)],
    ["focusable", flag(status.focusable)],
    ["focused", flag(status.focused)],
    ["composing", status.composing ? (status.compositionStarted ? "yes, started" : "yes") : "no"],
    ["head at", status.head ? `${status.head.left}, ${status.head.top}–${status.head.bottom}` : "–"],
    ["theme", status.themeClasses || "–"],
  ]
  return (
    <dl aria-label="View status" className="flex shrink-0 flex-wrap gap-x-3 gap-y-0.5 border-b px-2 py-1 text-xs">
      {items.map(([label, value]) => (
        <div key={label} className="flex gap-1">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-mono">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** The editor's view: its status and its content's DOM, mapped to the document. Mounted per editor. */
export const View = ({store, editorId}: {store: PanelStore; editorId: number}) => {
  const [source] = useState(() => createViewSource(store.transport, editorId))
  const {info, error} = useSyncExternalStore(source.subscribe, source.get)
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  // Nothing until the user picks a line.
  const [focused, setFocused] = useState<string | null>(null)
  // State: the virtualizer reads its element when this component renders.
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null)
  const lines = useMemo(() => (info ? flatten(info.dom, collapsed) : []), [info, collapsed])
  const outlined = useRef(false)

  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => ROW,
    overscan: 20,
  })

  const element = (id: string, action: "outline" | "log") =>
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

  const toggle = (id: string) => {
    const closing = !collapsed.has(id)
    setCollapsed(ids => {
      const next = new Set(ids)
      if (!next.delete(id)) next.add(id)
      return next
    })
    if (closing && focused != null && focused.startsWith(id ? `${id}.` : "") && focused != id) setFocused(id)
  }

  // Loads while its tab is shown: on showing (when the editor updated meanwhile) and on each update.
  const container = useCallback(
    (element: HTMLDivElement | null) => {
      setScrollElement(element)
      if (!element) return
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
      if (shown()) load()
      return () => {
        stopState()
        stopStore()
        hide()
      }
    },
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

  // As in a tree: Right opens a closed element or goes to its first child; Left closes or goes to the parent.
  const onKeyDown = (event: KeyboardEvent) => {
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
      <div className="flex h-7 shrink-0 items-center gap-1 border-b bg-muted/40 px-2 text-xs">
        <span className="text-muted-foreground">The content's DOM, each element with the node it draws</span>
        <span className="ml-auto flex items-center gap-1">
          <Tip label="Log the selected element to the page's console">
            <Button variant="ghost" size="icon-xs" aria-label="Log to the console" onClick={() => void element(focused ?? "", "log")}>
              <CommandLineIcon />
            </Button>
          </Tip>
          <Tip label="Expand all">
            <Button variant="ghost" size="icon-xs" aria-label="Expand all" onClick={() => setCollapsed(new Set())}>
              <ArrowsPointingOutIcon />
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
              <ArrowsPointingInIcon />
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
        onClick={event => {
          const id = event.target instanceof Element ? event.target.closest("[data-dom]")?.getAttribute("data-dom") : null
          if (id != null) select(id)
        }}
        className="relative min-h-0 flex-1 overflow-auto outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <div style={{height: virtualizer.getTotalSize()}}>
          {rendered.map(item => {
            const line = lines[item.index]
            return line && <Row key={line.id} line={line} start={item.start} focused={line.id == focused} onToggle={toggle} />
          })}
        </div>
      </div>
    </div>
  )
}
