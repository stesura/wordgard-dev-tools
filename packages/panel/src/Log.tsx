import {useVirtualizer} from "@tanstack/react-virtual"
import {cn} from "cn"
import {BanIcon, CircleIcon, PauseIcon} from "lucide-react"
import {Suspense, use, useCallback, useDeferredValue, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode} from "react"
import {SLOW_MS, type LogEntryDetail, type LogRow} from "wordgard-devtools"
import {Button} from "#components/ui/button"
import {createLogSource, type LogSource} from "./log-source.ts"
import {Field, json} from "./node-pane.tsx"
import type {PanelStore} from "./store.ts"

const ROW = 20
const COLUMNS = "grid grid-cols-[3rem_6.5rem_minmax(5rem,1fr)_4.5rem_2rem_2rem_3.5rem_3.5rem] gap-x-2"

const pad = (n: number, width = 2) => String(n).padStart(width, "0")
export const clock = (time: number) => {
  const d = new Date(time)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
}
const ms = (value: number | null) => (value == null ? "–" : value.toFixed(1))
const slow = (value: number | null) => value != null && value > SLOW_MS
export const isSlow = (row: LogRow) => slow(row.dispatchMs) || slow(row.flushMs)

const flags = (row: LogRow) => [
  ...(row.docChanged ? ["doc"] : []),
  ...(row.selectionSet ? ["sel"] : []),
  ...(row.appended ? ["app"] : []),
]

const flushTitle = (row: LogRow) =>
  row.flush == null
    ? "Not drawn yet"
    : `Flush #${row.flush}` + (row.agentFlush ? ", forced by DevTools' own read" : "")

const Row = ({row, start, selected}: {row: LogRow; start: number; selected: boolean}) => (
  <div
    id={`log-row-${row.index}`}
    role="option"
    aria-selected={selected}
    data-index={row.index}
    className={cn(
      COLUMNS,
      "absolute inset-x-0 top-0 cursor-default items-center px-2 font-mono text-xs whitespace-nowrap",
      selected && "bg-accent",
      isSlow(row) && "bg-destructive/10",
    )}
    style={{height: ROW, transform: `translateY(${start}px)`}}
  >
    <span className="text-muted-foreground">{row.index}</span>
    <span className="text-muted-foreground">{clock(row.time)}</span>
    <span className="truncate">{row.userEvent ?? <span className="text-muted-foreground">–</span>}</span>
    <span className="flex gap-1">
      {flags(row).map(flag => (
        <span key={flag} className="rounded bg-muted px-1 text-muted-foreground">
          {flag}
        </span>
      ))}
    </span>
    <span title="Effects">{row.effects || ""}</span>
    <span title="Annotations">{row.annotations || ""}</span>
    <span title="Dispatch, ms" className={cn("text-right", slow(row.dispatchMs) && "text-destructive")}>
      {ms(row.dispatchMs)}
    </span>
    <span title={flushTitle(row)} className={cn("text-right", slow(row.flushMs) && "text-destructive")}>
      {ms(row.flushMs)}
      {row.agentFlush && "*"}
    </span>
  </div>
)

// Square root: a 1 ms update still shows, and two frames' budget fills the strip.
const barHeight = (total: number) => Math.max(6, Math.min(100, Math.sqrt(total / (2 * SLOW_MS)) * 100))

/** One bar per entry, its height the update's time (dispatch and flush); the line is a frame's budget. */
const Timeline = ({rows, selected, onSelect}: {rows: LogRow[]; selected: number | null; onSelect: (index: number) => void}) => (
  <div aria-hidden="true" className="h-10 shrink-0 border-b px-2 py-1">
    <div
      className="relative flex h-full items-end gap-px overflow-hidden"
      onClick={event => {
        const index = event.target instanceof Element ? event.target.getAttribute("data-bar") : null
        if (index != null) onSelect(Number(index))
      }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 border-t border-dashed border-destructive/50"
        style={{bottom: `${barHeight(SLOW_MS)}%`}}
      />
      {rows.map(row => (
        <div
          key={row.index}
          data-bar={row.index}
          title={`#${row.index}: dispatch ${ms(row.dispatchMs)} ms, flush ${ms(row.flushMs)} ms`}
          className={cn(
            "max-w-2 min-w-px flex-1 cursor-pointer rounded-t-sm",
            isSlow(row) ? "bg-destructive" : "bg-primary/60",
            selected == row.index && "bg-foreground",
          )}
          style={{height: `${barHeight((row.dispatchMs ?? 0) + (row.flushMs ?? 0))}%`}}
        />
      ))}
    </div>
  </div>
)

const Section = ({title, children}: {title: string; children: ReactNode}) => (
  <>
    <h3 className="mt-2 mb-1 font-sans text-muted-foreground">{title}</h3>
    {children}
  </>
)

const Ranges = ({entry}: {entry: LogEntryDetail}) =>
  entry.ranges.length ? (
    entry.ranges.map((range, i) => (
      <div key={i} className="mb-1 rounded border p-1" data-range>
        <div className="text-muted-foreground">
          {range.fromA}–{range.toA} → {range.fromB}–{range.toB}
        </div>
        <div className="whitespace-pre-wrap">
          <span className="bg-destructive/15 line-through">{range.beforeText}</span>
          {range.beforeText && range.afterText && " "}
          <span className="bg-green-500/20">{range.afterText}</span>
        </div>
        <details>
          <summary className="cursor-default text-muted-foreground">Tokens</summary>
          <pre className="whitespace-pre-wrap">before {json(range.before)}</pre>
          <pre className="whitespace-pre-wrap">after {json(range.after)}</pre>
        </details>
      </div>
    ))
  ) : (
    <p className="font-sans text-muted-foreground">No document change.</p>
  )

const Values = ({values}: {values: LogEntryDetail["effectValues"]}) =>
  values.length ? (
    values.map((value, i) => (
      <Field key={i} label={value.type}>
        <pre className="whitespace-pre-wrap">{json(value.value)}</pre>
      </Field>
    ))
  ) : (
    <p className="font-sans text-muted-foreground">None.</p>
  )

const EntryView = ({
  source,
  index,
  flush,
  onRetry,
}: {
  source: LogSource
  index: number
  flush: number | null
  onRetry: () => void
}) => {
  const detail = use(source.detail(index, flush))
  if (detail.error != null) {
    return (
      <p role="alert" className="flex items-center gap-2 text-destructive">
        {detail.error}
        <Button
          variant="outline"
          size="xs"
          onClick={() => {
            source.forget(index, flush)
            onRetry()
          }}
        >
          Retry
        </Button>
      </p>
    )
  }
  const {entry} = detail
  return (
    <div className="font-mono text-xs">
      <Field label="index">{entry.index}</Field>
      <Field label="time">{clock(entry.time)}</Field>
      <Field label="userEvent">{entry.userEvent ?? "–"}</Field>
      <Field label="flags">
        {[...flags(entry), ...(entry.scrollIntoView ? ["scroll"] : []), ...(entry.reconfigured ? ["reconfig"] : [])].join(" ") ||
          "–"}
      </Field>
      <Field label="dispatch">
        <span className={cn(slow(entry.dispatchMs) && "text-destructive")}>{ms(entry.dispatchMs)} ms</span>
      </Field>
      <Field label="flush">
        <span className={cn(slow(entry.flushMs) && "text-destructive")}>{ms(entry.flushMs)} ms</span>
        {entry.flush != null && <span className="text-muted-foreground"> #{entry.flush}</span>}
        {entry.agentFlush && <span className="text-muted-foreground"> forced by DevTools</span>}
      </Field>
      <Section title="Changes">
        <Ranges entry={entry} />
        <details>
          <summary className="cursor-default text-muted-foreground">ChangeSet JSON</summary>
          <pre className="whitespace-pre-wrap">{json(entry.changes)}</pre>
        </details>
      </Section>
      <Section title="Selection">
        <Field label="set">{entry.selection.set == null ? "– (mapped)" : json(entry.selection.set)}</Field>
        <Field label="before">{json(entry.selection.before)}</Field>
        <Field label="after">{json(entry.selection.after)}</Field>
      </Section>
      <Section title={`Effects (${entry.effectValues.length})`}>
        <Values values={entry.effectValues} />
      </Section>
      <Section title={`Annotations (${entry.annotationValues.length})`}>
        <Values values={entry.annotationValues} />
      </Section>
    </div>
  )
}

const EntryPane = ({source, row}: {source: LogSource; row: LogRow | null}) => {
  // Deferred: the previous entry stays up while the next one loads.
  const shown = useDeferredValue(row)
  // Remounts the view after a retry, which asks again.
  const [attempt, setAttempt] = useState(0)
  return (
    <aside
      aria-label="Transaction"
      className="h-48 w-full shrink-0 overflow-auto border-t p-2 @2xl:h-auto @2xl:w-96 @2xl:border-t-0 @2xl:border-l"
    >
      {shown == null ? (
        <p className="text-muted-foreground">Select a transaction to see it here.</p>
      ) : (
        <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
          <EntryView
            key={attempt}
            source={source}
            index={shown.index}
            flush={shown.flush}
            onRetry={() => setAttempt(n => n + 1)}
          />
        </Suspense>
      )}
    </aside>
  )
}

/** The transaction log of one editor, with record/pause and per-update timing. Mounted per editor. */
export const Log = ({store, editorId}: {store: PanelStore; editorId: number}) => {
  const [source] = useState(() => createLogSource(store.transport, editorId))
  const view = useSyncExternalStore(source.subscribe, source.get)
  const [selected, setSelected] = useState<number | null>(null)
  const scroller = useRef<HTMLDivElement | null>(null)
  const {rows} = view
  const rowCount = rows.length

  // The column header is a sticky row at the top of the scroller.
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW,
    overscan: 20,
    scrollMargin: ROW,
  })

  const scrollToRow = (position: number) => {
    const element = scroller.current
    if (!element || position < 0) return
    const top = position * ROW
    if (top < element.scrollTop) element.scrollTop = top
    else if (top + 2 * ROW > element.scrollTop + element.clientHeight) element.scrollTop = top + 2 * ROW - element.clientHeight
  }

  const select = (index: number) => {
    setSelected(index)
    scrollToRow(source.get().rows.findIndex(row => row.index == index))
  }

  // New rows are followed while the list is scrolled to the bottom.
  const atBottom = useRef(true)
  // Where following scrolled to: its scroll event may come after more rows, and isn't the user's.
  const followedTo = useRef(-1)
  // A new callback per row count: React calls it once those rows are committed.
  const followRows = useCallback(
    (element: HTMLDivElement | null) => {
      const list = scroller.current
      if (!element || !list || !atBottom.current || !rowCount) return
      list.scrollTop = list.scrollHeight
      followedTo.current = list.scrollTop
    },
    [rowCount],
  )

  // Loads while its tab is shown: on showing (when the log changed meanwhile) and on each change.
  const container = useCallback(
    (element: HTMLDivElement | null) => {
      scroller.current = element
      if (!element) return
      const shown = () => store.get().view == "log"
      let stale = true
      const load = () => {
        stale = false
        void source.load()
      }
      const onScroll = () => {
        if (element.scrollTop == followedTo.current) return
        atBottom.current = element.scrollTop + element.clientHeight >= element.scrollHeight - ROW
      }
      element.addEventListener("scroll", onScroll, {passive: true})
      // An entry another tab links to (a field's change): selected once its rows are in.
      const takeReveal = () => {
        if (!shown()) return
        const index = store.takeLogReveal(editorId)
        if (index == null) return
        setSelected(index)
        void source.load().then(() => requestAnimationFrame(() => select(index)))
      }
      const stopReveal = store.onReveal(takeReveal)
      const stopLog = store.onLogChanged(id => {
        if (id != editorId) return
        if (shown()) load()
        else stale = true
      })
      // A list change may be this editor reconnecting with a new log, under the same id.
      let editors = store.get().editors
      const stopStore = store.subscribe(() => {
        if (store.get().editors != editors) {
          editors = store.get().editors
          stale = true
        }
        if (shown() && stale) load()
      })
      if (shown()) load()
      takeReveal()
      return () => {
        stopReveal()
        element.removeEventListener("scroll", onScroll)
        stopLog()
        stopStore()
        scroller.current = null
      }
    },
    [store, editorId, source],
  )

  const onKeyDown = (event: KeyboardEvent) => {
    if (!rows.length) return
    const position = rows.findIndex(row => row.index == selected)
    const step: Record<string, number> = {ArrowDown: 1, ArrowUp: -1, PageDown: 10, PageUp: -10}
    const next =
      event.key == "Home"
        ? 0
        : event.key == "End"
          ? rows.length - 1
          : event.key in step
            ? Math.max(0, Math.min(rows.length - 1, (position < 0 ? rows.length : position) + (step[event.key] ?? 0)))
            : null
    const row = next == null ? undefined : rows[next]
    if (!row) return
    event.preventDefault()
    select(row.index)
  }

  const selectedRow = rows.find(row => row.index == selected) ?? null
  const virtualItems = virtualizer.getVirtualItems()
  // Only a rendered row can be the active descendant.
  const activeRow = virtualItems.some(item => rows[item.index]?.index == selected) ? selectedRow : null
  const slowCount = rows.filter(isSlow).length

  return (
    <div className="@container flex min-h-0 flex-1 flex-col">
      <div className="flex h-7 shrink-0 items-center gap-2 border-b px-2 text-xs">
        <Button
          variant={view.recording ? "secondary" : "ghost"}
          size="xs"
          aria-pressed={view.recording}
          onClick={() => void source.record(!view.recording)}
        >
          {view.recording ? <PauseIcon /> : <CircleIcon className="fill-destructive text-destructive" />}
          {view.recording ? "Pause" : "Record"}
        </Button>
        <Button
          variant="ghost"
          size="xs"
          disabled={!rows.length}
          onClick={() => {
            setSelected(null)
            void source.clear()
          }}
        >
          <BanIcon /> Clear
        </Button>
        <span className="text-muted-foreground" aria-live="polite">
          {rows.length} transaction{rows.length == 1 ? "" : "s"}
          {view.size > 0 && rows.length >= view.size && ` (the last ${view.size} kept)`}
          {slowCount > 0 && <span className="text-destructive"> · {slowCount} over {SLOW_MS} ms</span>}
        </span>
      </div>
      {view.error != null && (
        <p role="alert" className="flex items-center gap-2 border-b px-2 py-1 text-destructive">
          Couldn't load the log: {view.error}
          <Button variant="outline" size="xs" onClick={() => void source.load()}>
            Retry
          </Button>
        </p>
      )}
      <Timeline rows={rows} selected={selected} onSelect={select} />
      <div className="flex min-h-0 flex-1 flex-col @2xl:flex-row">
        <div
          ref={container}
          role="listbox"
          aria-label="Transactions"
          tabIndex={0}
          aria-activedescendant={activeRow ? `log-row-${activeRow.index}` : undefined}
          onKeyDown={onKeyDown}
          onClick={event => {
            const index = event.target instanceof Element ? event.target.closest("[data-index]")?.getAttribute("data-index") : null
            if (index != null) setSelected(Number(index))
          }}
          className="relative min-h-0 min-w-0 flex-1 overflow-auto outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <div className="min-w-[34rem]">
            <div
              aria-hidden="true"
              className={cn(COLUMNS, "sticky top-0 z-10 h-5 items-center border-b bg-background px-2 text-xs text-muted-foreground")}
            >
              <span>#</span>
              <span>time</span>
              <span>userEvent</span>
              <span>changed</span>
              <span title="Effects">eff</span>
              <span title="Annotations">ann</span>
              <span className="text-right" title="Dispatch, ms">
                disp
              </span>
              <span className="text-right" title="Flush, ms; * forced by DevTools">
                flush
              </span>
            </div>
            {!rows.length && view.loaded && (
              <p className="p-2 text-xs text-muted-foreground">
                {view.recording ? "Recording: use the editor." : "Not recording. Press Record, then use the editor."}
              </p>
            )}
            <div ref={followRows} className="relative" style={{height: virtualizer.getTotalSize()}}>
              {virtualItems.map(item => {
                const row = rows[item.index]
                return (
                  row && <Row key={row.index} row={row} start={item.start - ROW} selected={row.index == selected} />
                )
              })}
            </div>
          </div>
        </div>
        <EntryPane source={source} row={selectedRow} />
      </div>
    </div>
  )
}
