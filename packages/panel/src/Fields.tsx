import {cn} from "cn"
import {ChevronDownIcon, ChevronRightIcon, ClipboardDocumentIcon, CommandLineIcon, InformationCircleIcon, NoSymbolIcon} from "#icons"
import {Suspense, use, useCallback, useDeferredValue, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode} from "react"
import type {FieldChange} from "@stesura/wordgard-dev-tools"
import {Tag} from "#components/ui/badge"
import {Button} from "#components/ui/button"
import {ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger} from "#components/ui/context-menu"
import {createFieldsSource, type FieldsSource} from "./fields-source.ts"
import {clock} from "./Log.tsx"
import {copy, createMenuAnchor, type MenuAnchor} from "./node-menu.tsx"
import {Field as Line, json} from "./node-pane.tsx"
import type {PanelStore} from "./store.ts"
import {SplitPane, type Orientation, type SplitKind} from "./split-pane.tsx"
import {Tip} from "./tip.tsx"

/** A change's time, and its transaction in the log as a link. */
const When = ({change, onLog}: {change: FieldChange; onLog: (index: number) => void}) => (
  <span className="flex gap-2">
    <span className="text-muted-foreground">{clock(change.time)}</span>
    {change.log != null && (
      <Tip label="Show the transaction in the log">
        <button
          type="button"
          className="cursor-pointer text-primary hover:underline"
          onClick={event => {
            event.stopPropagation()
            if (change.log != null) onLog(change.log)
          }}
        >
          #{change.log}
        </button>
      </Tip>
    )}
  </span>
)

// The list | the field pane: a wider pane than the other tabs', holding two parts.
const FIELDS_SPLIT: SplitKind = {
  key: "wordgard-devtools:fields-pane",
  wide: 672,
  defaults: {horizontal: 560, vertical: 320},
  min: {horizontal: 280, vertical: 120},
}

// Value | history, inside the field pane: laid out as the tab is (`wide` unused).
const FIELD_SPLIT: SplitKind = {
  key: "wordgard-devtools:field-pane",
  wide: 0,
  defaults: {horizontal: 280, vertical: 160},
  min: {horizontal: 120, vertical: 60},
}

/** The value a change set, fetched when its row is expanded. */
const ChangeValue = ({source, index, seq}: {source: FieldsSource; index: number; seq: number}) => {
  const result = use(source.change(index, seq))
  if (result.error != null) return <p className="font-sans text-destructive">{result.error}</p>
  return <pre className="whitespace-pre-wrap">{json(result.value)}</pre>
}

/** A change in the history: its preview, expanding to the value it set. Its menu logs or copies it. */
const HistoryItem = ({
  source,
  index,
  change,
  onLog,
}: {
  source: FieldsSource
  index: number
  change: FieldChange
  onLog: (index: number) => void
}) => {
  const [open, setOpen] = useState(false)
  return (
    <li data-seq={change.seq} className="border-b py-0.5">
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-expanded={open}
          aria-label={open ? "Collapse the value" : "Expand the value"}
          onClick={() => setOpen(!open)}
          className="flex cursor-pointer text-muted-foreground hover:text-foreground [&_svg]:size-3"
        >
          {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
        </button>
        <When change={change} onLog={onLog} />
      </div>
      {open ? (
        <Suspense fallback={<p className="font-sans text-muted-foreground">Loading…</p>}>
          <ChangeValue source={source} index={index} seq={change.seq} />
        </Suspense>
      ) : (
        // The chevron is the keyboard's way in.
        <button type="button" tabIndex={-1} onClick={() => setOpen(true)} className="block w-full cursor-pointer text-left wrap-break-word">
          {change.preview}
        </button>
      )}
    </li>
  )
}

type HistoryTarget = {seq: number}

/** A history change's context menu. */
const HistoryMenu = ({source, index, anchor}: {source: FieldsSource; index: number; anchor: MenuAnchor<HistoryTarget>}) => {
  const target = useSyncExternalStore(anchor.subscribe, anchor.get)
  const copyValue = async (seq: number) => {
    const result = await source.change(index, seq)
    if (result.error == null) await copy(json(result.value))
  }
  return (
    <ContextMenu>
      <ContextMenuTrigger className="hidden">
        <span ref={anchor.setTrigger} />
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52" finalFocus={() => anchor.get()?.row.querySelector("button") ?? true}>
        <ContextMenuItem className="text-xs" onClick={() => target && source.logChange(index, target.seq)}>
          <CommandLineIcon /> Log to console
        </ContextMenuItem>
        <ContextMenuItem className="text-xs" onClick={() => target && void copyValue(target.seq)}>
          <ClipboardDocumentIcon /> Copy value
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

/** A part of the field pane: a heading with its buttons, its content scrolling. */
const Part = ({title, actions, children}: {title: string; actions: ReactNode; children: ReactNode}) => (
  <div className="flex h-full min-h-0 flex-col">
    <div className="flex min-h-7 shrink-0 items-center gap-1 border-b bg-strip px-2 font-sans">
      <h3 className="text-muted-foreground">{title}</h3>
      <span className="ml-auto flex items-center gap-1">{actions}</span>
    </div>
    <div className="min-h-0 flex-1 overflow-auto p-2">{children}</div>
  </div>
)

const FieldView = ({
  source,
  index,
  version,
  onLog,
  onClearHistory,
  orientation,
}: {
  source: FieldsSource
  index: number
  version: number
  onLog: (index: number) => void
  onClearHistory: (index: number) => void
  orientation: Orientation
}) => {
  const [menu] = useState(() =>
    createMenuAnchor<HistoryTarget>(
      "[data-seq]",
      row => ({seq: Number(row.getAttribute("data-seq"))}),
      () => {},
    ),
  )
  const result = use(source.detail(index, version))
  if (result.error != null) return <p className="p-2 text-destructive">{result.error}</p>
  const {field} = result
  // Newest first, as shown; a change gone meanwhile is left out.
  const copyHistory = async () => {
    const changes = field.history.toReversed()
    const values = await Promise.all(changes.map(change => source.change(field.index, change.seq)))
    const copied = changes.flatMap((change, i) => {
      const found = values[i]
      return found && found.error == null ? [{transaction: change.log, time: change.time, value: found.value}] : []
    })
    await copy(json(copied))
  }
  const history = (
    <Part
      title="History, newest first"
      actions={
        <>
          <Tip label="Log the history to the page's console">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Log the history to the page's console"
              disabled={!field.history.length}
              onClick={() => source.logHistory(field.index)}
            >
              <CommandLineIcon />
            </Button>
          </Tip>
          <Tip label="Copy the history">
            <Button variant="ghost" size="icon-xs" aria-label="Copy the history" disabled={!field.history.length} onClick={() => void copyHistory()}>
              <ClipboardDocumentIcon />
            </Button>
          </Tip>
          <Tip label="Clear this field's history">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Clear this field's history"
              disabled={!field.history.length}
              onClick={() => onClearHistory(field.index)}
            >
              <NoSymbolIcon />
            </Button>
          </Tip>
        </>
      }
    >
      {field.history.length ? (
        <ol aria-label="History" onContextMenu={menu.onContextMenu} onKeyDown={menu.onKeyDown}>
          {[...field.history].reverse().map(change => (
            <HistoryItem key={change.seq} source={source} index={field.index} change={change} onLog={onLog} />
          ))}
        </ol>
      ) : (
        <p className="font-sans text-muted-foreground">No changes seen.</p>
      )}
    </Part>
  )
  return (
    <div className="flex h-full min-h-0 flex-col font-mono text-xs">
      <div className="shrink-0 border-b p-2">
        <Line label="name">{field.name}</Line>
        <Line label="changes">{field.changes}</Line>
      </div>
      <SplitPane kind={FIELD_SPLIT} orientation={orientation} pane={history}>
        <Part
          title="Value"
          actions={
            <>
              <Tip label="Log the value to the page's console">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Log the value to the page's console"
                  onClick={() => source.logValue(field.index)}
                >
                  <CommandLineIcon />
                </Button>
              </Tip>
              <Tip label="Copy the value">
                <Button variant="ghost" size="icon-xs" aria-label="Copy the value" onClick={() => void copy(json(field.value))}>
                  <ClipboardDocumentIcon />
                </Button>
              </Tip>
            </>
          }
        >
          <pre className="whitespace-pre-wrap">{json(field.value)}</pre>
        </Part>
      </SplitPane>
      <HistoryMenu source={source} index={field.index} anchor={menu} />
    </div>
  )
}

type MenuTarget = {index: number}

/** A field's context menu. */
const FieldMenu = ({
  source,
  anchor,
  list,
}: {
  source: FieldsSource
  anchor: MenuAnchor<MenuTarget>
  list: HTMLElement | null
}) => {
  const target = useSyncExternalStore(anchor.subscribe, anchor.get)
  const index = target?.index
  const copyValue = async (index: number) => {
    const result = await source.detail(index, source.version())
    if (result.field) await copy(json(result.field.value))
  }
  return (
    <ContextMenu>
      <ContextMenuTrigger className="hidden">
        <span ref={anchor.setTrigger} />
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52" finalFocus={() => list ?? true}>
        <ContextMenuItem
          className="text-xs"
          onClick={() => index != null && source.logValue(index)}
        >
          <CommandLineIcon /> Log to console
        </ContextMenuItem>
        <ContextMenuItem className="text-xs" onClick={() => index != null && void copyValue(index)}>
          <ClipboardDocumentIcon /> Copy value
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

const COLUMNS = "grid grid-cols-[8rem_minmax(0,1fr)_4rem_10rem] items-center gap-x-3"

// The field selected last, by name, selected again after a reload (when it's still there).
const FIELD_KEY = "wordgard-devtools:field"

const readSavedField = () => {
  try {
    return localStorage.getItem(FIELD_KEY)
  } catch {
    return null
  }
}

const saveField = (name: string) => {
  try {
    localStorage.setItem(FIELD_KEY, name)
  } catch {
    // Storage blocked: nothing is restored.
  }
}

/** The editor's state fields: values, last change, history linked to the log. Mounted per editor. */
export const Fields = ({store, editorId}: {store: PanelStore; editorId: number}) => {
  const [source] = useState(() => createFieldsSource(store.transport, editorId))
  const info = useSyncExternalStore(source.subscribe, source.fields)
  const error = useSyncExternalStore(source.subscribe, source.error)
  const version = useDeferredValue(useSyncExternalStore(source.subscribe, source.version))
  const [picked, setPicked] = useState<number | null>(null)
  const [saved] = useState(readSavedField)
  const setSelected = (index: number) => {
    setPicked(index)
    const name = source.fields()?.fields.find(f => f.index == index)?.name
    if (name != null) saveField(name)
  }
  // Until one is picked, the saved one, if the editor has it.
  const selected = picked ?? info?.fields.find(f => f.name == saved)?.index ?? null
  const shownIndex = useDeferredValue(selected)
  const onLog = (index: number) => store.showLogEntry(editorId, index)
  // State: the menu gives the list focus back when it closes.
  const [list, setList] = useState<HTMLDivElement | null>(null)
  // The field a context menu opens on is selected.
  const [menu] = useState(() =>
    createMenuAnchor<MenuTarget>(
      "[data-field-index]",
      row => ({index: Number(row.getAttribute("data-field-index"))}),
      (_, target) => setSelected(target.index),
    ),
  )

  // While its tab is shown: tracks the fields' changes and loads on each state change.
  const container = useCallback(
    (element: HTMLDivElement | null) => {
      setList(element)
      if (!element) return
      const shown = () => store.get().view == "fields"
      let stale = true
      let watching = false
      const watch = (on: boolean) => {
        if (on == watching) return
        watching = on
        store.transport.send({type: "watchFields", id: editorId, on}).catch(() => {})
      }
      const load = () => {
        stale = false
        void source.load()
      }
      const sync = () => {
        watch(shown())
        if (shown() && stale) load()
      }
      const stopState = store.onStateChanged(id => {
        if (id != editorId) return
        if (shown()) load()
        else stale = true
      })
      // A list change may be this editor reconnecting under the same id, its tracking dropped.
      let editors = store.get().editors
      const stopStore = store.subscribe(() => {
        if (store.get().editors != editors) {
          editors = store.get().editors
          watching = false
          stale = true
        }
        sync()
      })
      sync()
      return () => {
        stopState()
        stopStore()
        watch(false)
      }
    },
    [store, editorId, source],
  )

  const fields = info?.fields ?? []
  const onKeyDown = (event: KeyboardEvent) => {
    menu.onKeyDown(event)
    if (event.defaultPrevented) return
    const step: Record<string, number> = {ArrowDown: 1, ArrowUp: -1}
    if (!(event.key in step) || !fields.length) return
    event.preventDefault()
    const position = fields.findIndex(f => f.index == selected)
    const next = fields[Math.max(0, Math.min(fields.length - 1, position + (step[event.key] ?? 0)))]
    if (next) setSelected(next.index)
  }

  // The field's next detail (a new version) has the history gone, and the list its count.
  const clearHistory = (index: number) =>
    store.transport
      .send({type: "clearFieldHistory", id: editorId, index})
      .then(() => source.load())
      .catch(() => {})

  const pane = (orientation: Orientation) => (
    <aside aria-label="Field" className="flex h-full min-h-0 flex-col">
      {shownIndex == null ? (
        <p className="p-2 text-muted-foreground">Select a field to see it here.</p>
      ) : (
        <Suspense fallback={<p className="p-2 text-muted-foreground">Loading…</p>}>
          <FieldView source={source} index={shownIndex} version={version} onLog={onLog} onClearHistory={index => void clearHistory(index)} orientation={orientation} />
        </Suspense>
      )}
    </aside>
  )

  return (
    <div className="@container flex min-h-0 flex-1 flex-col">
      {error != null && (
        <p role="alert" className="flex items-center gap-2 border-b px-2 py-1 text-destructive">
          Couldn't load the fields: {error}
          <Button variant="outline" size="xs" onClick={() => void source.load()}>
            Retry
          </Button>
        </p>
      )}
      <div className="flex h-7 shrink-0 items-center gap-2 border-b bg-strip px-2 text-xs">
        <Tag className={cn(info?.tracking && "bg-green-500/15 text-green-800 dark:text-green-300")}>
          {info?.tracking ? "Tracking changes" : "Not tracking changes"}
        </Tag>
        <Tip
          label={
            <span className="block max-w-72">
              Changes are tracked while this tab is shown or the log records. Unnamed fields show as "field #n": name them
              with <code className="font-mono">wordgardDevtools({"{fields: {name: field}}"})</code>.
            </span>
          }
        >
          <button type="button" aria-label="About the fields" className="flex text-muted-foreground hover:text-foreground [&_svg]:size-3.5">
            <InformationCircleIcon />
          </button>
        </Tip>
      </div>
      <SplitPane kind={FIELDS_SPLIT} pane={pane}>
        <div
          ref={container}
          role="listbox"
          aria-label="State fields"
          tabIndex={0}
          aria-activedescendant={selected == null ? undefined : `field-${selected}`}
          onKeyDown={onKeyDown}
          onContextMenu={menu.onContextMenu}
          className="min-h-0 min-w-0 flex-1 overflow-auto font-mono text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {info && !fields.length && <p className="p-2 font-sans text-muted-foreground">No state fields found.</p>}
          {fields.length > 0 && (
            <div aria-hidden="true" className={cn(COLUMNS, "sticky top-0 z-10 border-b bg-background px-3 py-1 font-sans text-muted-foreground")}>
              <span>Field</span>
              <span>Value</span>
              <span className="text-right">Changes</span>
              <span>Last change</span>
            </div>
          )}
          {fields.map(field => (
            <div
              key={field.index}
              id={`field-${field.index}`}
              role="option"
              aria-selected={field.index == selected}
              data-field={field.name}
              data-field-index={field.index}
              onClick={() => setSelected(field.index)}
              className={cn(
                COLUMNS,
                "mx-1.5 mt-1.5 cursor-default rounded-md border px-1.5 py-1.5 whitespace-nowrap",
                field.index == selected && "border-ring bg-accent",
              )}
            >
              <span className="min-w-0">
                <Tag className={cn("max-w-full truncate", field.named && "text-foreground")}>{field.name}</Tag>
              </span>
              <span className={cn("truncate", field.preview == null && "text-muted-foreground")}>{field.preview ?? "–"}</span>
              {field.changes > 0 ? (
                <Tip label="Changes seen">
                  <span data-changes className="text-right text-muted-foreground">
                    {field.changes}
                  </span>
                </Tip>
              ) : (
                <span />
              )}
              <span>{field.last && <When change={field.last} onLog={onLog} />}</span>
            </div>
          ))}
        </div>
      </SplitPane>
      <FieldMenu source={source} anchor={menu} list={list} />
    </div>
  )
}
