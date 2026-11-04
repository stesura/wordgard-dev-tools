import {cn} from "cn"
import {Suspense, use, useCallback, useDeferredValue, useState, useSyncExternalStore, type KeyboardEvent} from "react"
import type {FieldChange} from "wordgard-devtools"
import {Button} from "#components/ui/button"
import {createFieldsSource, type FieldsSource} from "./fields-source.ts"
import {clock} from "./Log.tsx"
import {Field as Line, json} from "./node-pane.tsx"
import type {PanelStore} from "./store.ts"
import {SplitPane} from "./split-pane.tsx"
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

const FieldView = ({
  source,
  index,
  version,
  onLog,
}: {
  source: FieldsSource
  index: number
  version: number
  onLog: (index: number) => void
}) => {
  const result = use(source.detail(index, version))
  if (result.error != null) return <p className="text-destructive">{result.error}</p>
  const {field} = result
  return (
    <div className="font-mono text-xs">
      <Line label="name">{field.name}</Line>
      <Line label="changes">{field.changes}</Line>
      <h3 className="mt-2 mb-1 font-sans text-muted-foreground">Value</h3>
      <pre className="whitespace-pre-wrap">{json(field.value)}</pre>
      <h3 className="mt-2 mb-1 font-sans text-muted-foreground">History, newest first</h3>
      {field.history.length ? (
        <ol aria-label="History">
          {[...field.history].reverse().map((change, i) => (
            <li key={field.history.length - i} className="border-b py-0.5">
              <When change={change} onLog={onLog} />
              <span className="wrap-break-word">{change.preview}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="font-sans text-muted-foreground">No changes seen.</p>
      )}
    </div>
  )
}

/** The editor's state fields: values, last change, history linked to the log. Mounted per editor. */
export const Fields = ({store, editorId}: {store: PanelStore; editorId: number}) => {
  const [source] = useState(() => createFieldsSource(store.transport, editorId))
  const info = useSyncExternalStore(source.subscribe, source.fields)
  const error = useSyncExternalStore(source.subscribe, source.error)
  const version = useDeferredValue(useSyncExternalStore(source.subscribe, source.version))
  const [selected, setSelected] = useState<number | null>(null)
  const shownIndex = useDeferredValue(selected)
  const onLog = (index: number) => store.showLogEntry(editorId, index)

  // While its tab is shown: tracks the fields' changes and loads on each state change.
  const container = useCallback(
    (element: HTMLDivElement | null) => {
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
    const step: Record<string, number> = {ArrowDown: 1, ArrowUp: -1}
    if (!(event.key in step) || !fields.length) return
    event.preventDefault()
    const position = fields.findIndex(f => f.index == selected)
    const next = fields[Math.max(0, Math.min(fields.length - 1, position + (step[event.key] ?? 0)))]
    if (next) setSelected(next.index)
  }

  const pane = (
    <aside aria-label="Field" className="h-full overflow-auto p-2">
      {shownIndex == null ? (
        <p className="text-muted-foreground">Select a field to see it here.</p>
      ) : (
        <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
          <FieldView source={source} index={shownIndex} version={version} onLog={onLog} />
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
      <p className="flex h-7 shrink-0 items-center border-b px-2 text-xs text-muted-foreground">
        {info?.tracking ? "Tracking changes" : "Not tracking changes"} while this tab is shown or the log records.
        Name fields with <code className="mx-1 font-mono">wordgardDevtools({"{fields: {name: field}}"})</code>.
      </p>
      <SplitPane pane={pane}>
        <div
          ref={container}
          role="listbox"
          aria-label="State fields"
          tabIndex={0}
          aria-activedescendant={selected == null ? undefined : `field-${selected}`}
          onKeyDown={onKeyDown}
          className="min-h-0 min-w-0 flex-1 overflow-auto font-mono text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {info && !fields.length && <p className="p-2 font-sans text-muted-foreground">No state fields found.</p>}
          {fields.map(field => (
            <div
              key={field.index}
              id={`field-${field.index}`}
              role="option"
              aria-selected={field.index == selected}
              data-field={field.name}
              onClick={() => setSelected(field.index)}
              className={cn(
                "grid cursor-default grid-cols-[8rem_1fr_3rem_9rem] items-center gap-x-2 px-2 py-0.5 whitespace-nowrap",
                field.index == selected && "bg-accent",
              )}
            >
              <span className={cn("truncate", !field.named && "text-muted-foreground")}>{field.name}</span>
              <span className={cn("truncate", field.preview == null && "text-muted-foreground")}>{field.preview ?? "–"}</span>
              <Tip label="Changes seen">
                <span data-changes className="text-right text-muted-foreground">
                  {field.changes || ""}
                </span>
              </Tip>
              <span>{field.last && <When change={field.last} onLog={onLog} />}</span>
            </div>
          ))}
        </div>
      </SplitPane>
    </div>
  )
}
