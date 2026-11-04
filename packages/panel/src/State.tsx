import {useVirtualizer} from "@tanstack/react-virtual"
import {cn} from "cn"
import {ChevronDownIcon, ChevronRightIcon, ChevronsDownUpIcon, ChevronsUpDownIcon, ClipboardCopyIcon} from "lucide-react"
import {useCallback, useMemo, useState, useSyncExternalStore, type KeyboardEvent} from "react"
import {Button} from "#components/ui/button"
import {copy} from "./node-menu.tsx"
import {createStateSource} from "./state-source.ts"
import type {PanelStore} from "./store.ts"
import {Tip} from "./tip.tsx"

const ROW = 20
const INDENT = 14
const ROOT = "$"

/** One line of the JSON: a value, an object's or array's opening (or the whole of it, collapsed), or its closing. */
type Line = {
  /** The key path from the root (`$/doc/content/0`, keys URI-encoded so a "/" in one can't split it); a closing line adds `#`. */
  id: string
  depth: number
  key: string | null
  kind: "value" | "open" | "close"
  /** A value's JSON, or the brackets. */
  text: string
  /** Opening lines: the number of entries. */
  size: number
  type: "string" | "number" | "boolean" | "null" | "bracket"
  /** An opening shown closed, its entries hidden. */
  collapsed: boolean
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value == "object" && value != null && !Array.isArray(value)

const typeOf = (value: unknown): Line["type"] =>
  typeof value == "string" ? "string" : typeof value == "number" ? "number" : typeof value == "boolean" ? "boolean" : "null"

/** Ids of every object and array: what "collapse all" closes. */
const containers = (value: unknown, id = ROOT, out: string[] = []) => {
  const entries = Array.isArray(value) ? value.entries() : isRecord(value) ? Object.entries(value) : null
  if (!entries) return out
  out.push(id)
  for (const [key, child] of entries) containers(child, childId(id, key), out)
  return out
}

const childId = (id: string, key: string | number) => `${id}/${encodeURIComponent(key)}`

const flatten = (value: unknown, collapsed: ReadonlySet<string>) => {
  const lines: Line[] = []
  const walk = (value: unknown, id: string, depth: number, key: string | null) => {
    const array = Array.isArray(value)
    const entries: [string | number, unknown][] | null = array ? [...value.entries()] : isRecord(value) ? Object.entries(value) : null
    if (!entries) {
      lines.push({id, depth, key, kind: "value", text: JSON.stringify(value) ?? String(value), size: 0, type: typeOf(value), collapsed: false})
      return
    }
    const [open, close] = array ? ["[", "]"] : ["{", "}"]
    const shut = collapsed.has(id) && entries.length > 0
    lines.push({
      id,
      depth,
      key,
      kind: "open",
      text: entries.length == 0 ? open + close : shut ? `${open} … ${close}` : open,
      size: entries.length,
      type: "bracket",
      collapsed: shut,
    })
    if (shut || entries.length == 0) return
    for (const [k, child] of entries) walk(child, childId(id, k), depth + 1, array ? null : String(k))
    lines.push({id: `${id}#`, depth, key: null, kind: "close", text: close, size: 0, type: "bracket", collapsed: false})
  }
  walk(value, ROOT, 0, null)
  return lines
}

const valueColour: Record<Line["type"], string> = {
  string: "text-green-700 dark:text-green-400",
  number: "text-amber-700 dark:text-amber-400",
  boolean: "text-violet-700 dark:text-violet-300",
  null: "text-muted-foreground",
  bracket: "text-muted-foreground",
}

const Row = ({line, start, focused, onToggle}: {line: Line; start: number; focused: boolean; onToggle: (id: string) => void}) => {
  const folder = line.kind == "open" && line.size > 0
  return (
    <div
      id={`state-${line.id}`}
      role="treeitem"
      aria-level={line.depth + 1}
      aria-expanded={folder ? !line.collapsed : undefined}
      aria-selected={focused}
      data-line={line.id}
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
      {line.key != null && <span className="text-sky-700 dark:text-sky-400">{JSON.stringify(line.key)}:</span>}
      <span className={cn("truncate", valueColour[line.type])}>{line.text}</span>
      {line.collapsed && (
        <span className="text-muted-foreground">
          {line.size} {line.text.startsWith("[") ? "items" : "keys"}
        </span>
      )}
    </div>
  )
}

/** The editor's state as plain JSON (`GardState.toJSON`), collapsible and virtualized. Mounted per editor. */
export const State = ({store, editorId}: {store: PanelStore; editorId: number}) => {
  const [source] = useState(() => createStateSource(store.transport, editorId))
  const {json, loaded, error} = useSyncExternalStore(source.subscribe, source.get)
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  // Nothing until the user picks a line.
  const [focused, setFocused] = useState<string | null>(null)
  // State: the virtualizer reads its element when this component renders.
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null)
  const lines = useMemo(() => (loaded ? flatten(json, collapsed) : []), [json, loaded, collapsed])

  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => ROW,
    overscan: 20,
  })

  // Closing an object that holds the focused line moves focus to it.
  const toggle = (id: string) => {
    const closing = !collapsed.has(id)
    setCollapsed(ids => {
      const next = new Set(ids)
      if (!next.delete(id)) next.add(id)
      return next
    })
    if (closing && focused != null && (focused.startsWith(`${id}/`) || focused == `${id}#`)) setFocused(id)
  }

  // Everything but the root closes: focus goes to the root's entry that held it.
  const collapseAll = () => {
    setCollapsed(new Set(containers(json).filter(id => id != ROOT)))
    if (focused != null && focused != ROOT) setFocused(focused.replace(/#$/, "").split("/").slice(0, 2).join("/"))
  }

  // Loads while its tab is shown: on showing (when the state changed meanwhile) and on each change.
  const container = useCallback(
    (element: HTMLDivElement | null) => {
      setScrollElement(element)
      if (!element) return
      const shown = () => store.get().view == "state"
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
        if (shown() && stale) load()
      })
      if (shown()) load()
      return () => {
        stopState()
        stopStore()
      }
    },
    [store, editorId, source],
  )

  const scrollToLine = (position: number) => {
    const element = scrollElement
    if (!element || position < 0) return
    const top = position * ROW
    if (top < element.scrollTop) element.scrollTop = top
    else if (top + ROW > element.scrollTop + element.clientHeight) element.scrollTop = top + ROW - element.clientHeight
  }

  const focusLine = (position: number) => {
    const line = lines[Math.max(0, Math.min(lines.length - 1, position))]
    if (!line) return
    setFocused(line.id)
    scrollToLine(lines.indexOf(line))
  }

  // As in a tree: Right opens a closed object, Left closes an open one or goes to its parent.
  const onKeyDown = (event: KeyboardEvent) => {
    const position = lines.findIndex(line => line.id == focused)
    const line = lines[position]
    const moves: Partial<Record<string, number>> = {ArrowDown: position + 1, ArrowUp: position - 1, Home: 0, End: lines.length - 1}
    const target = moves[event.key]
    if (target != null) {
      event.preventDefault()
      focusLine(target)
    } else if (line && event.key == "ArrowRight" && line.kind == "open" && line.size > 0) {
      // Opens a closed object; in an open one, goes to its first entry.
      event.preventDefault()
      if (line.collapsed) toggle(line.id)
      else focusLine(position + 1)
    } else if (line && event.key == "ArrowLeft") {
      event.preventDefault()
      if (line.kind == "open" && line.size > 0 && !line.collapsed) toggle(line.id)
      else if (line.id != ROOT) {
        // A closing line goes to its opening, others to their parent.
        const target = line.kind == "close" ? line.id.slice(0, -1) : line.id.replace(/\/[^/]*$/, "")
        focusLine(lines.findIndex(other => other.id == target))
      }
    }
  }

  const rendered = virtualizer.getVirtualItems()
  const active = rendered.some(item => lines[item.index]?.id == focused) ? focused : null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {error != null && (
        <p role="alert" className="flex items-center gap-2 border-b px-2 py-1 text-destructive">
          Couldn't load the state: {error}
          <Button variant="outline" size="xs" onClick={() => void source.load()}>
            Retry
          </Button>
        </p>
      )}
      <div className="flex h-7 shrink-0 items-center gap-1 border-b bg-muted/40 px-2 text-xs">
        <span className="text-muted-foreground">
          <code className="font-mono">GardState.toJSON()</code>, with the named fields that serialise
        </span>
        <span className="ml-auto flex items-center gap-1">
          <Tip label="Expand all">
            <Button variant="ghost" size="icon-xs" aria-label="Expand all" onClick={() => setCollapsed(new Set())}>
              <ChevronsUpDownIcon />
            </Button>
          </Tip>
          <Tip label="Collapse all">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Collapse all"
              // The root stays open: its keys show.
              onClick={collapseAll}
            >
              <ChevronsDownUpIcon />
            </Button>
          </Tip>
          <Tip label="Copy the JSON">
            <Button variant="ghost" size="icon-xs" aria-label="Copy the JSON" onClick={() => void copy(JSON.stringify(json, null, 2))}>
              <ClipboardCopyIcon />
            </Button>
          </Tip>
        </span>
      </div>
      <div
        ref={container}
        role="tree"
        aria-label="State"
        tabIndex={0}
        aria-activedescendant={active == null ? undefined : `state-${active}`}
        onKeyDown={onKeyDown}
        onClick={event => {
          const id = event.target instanceof Element ? event.target.closest("[data-line]")?.getAttribute("data-line") : null
          if (id != null) setFocused(id)
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
