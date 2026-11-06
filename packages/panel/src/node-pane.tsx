import {ViewfinderCircleIcon} from "#icons"
import {Suspense, use, useDeferredValue, useSyncExternalStore, type ReactNode} from "react"
import type {Path, SelectionInfo} from "@stesura/wordgard-dev-tools"
import {Button} from "#components/ui/button"
import {pathOf, type DetailSource} from "./detail-cache.ts"
import {Tip} from "./tip.tsx"

export const isPrefix = (prefix: Path, path: Path) => prefix.length <= path.length && prefix.every((n, i) => n == path[i])

const selectionType = (json: unknown) =>
  typeof json == "object" && json != null && "type" in json ? String(json.type) : "?"

export const SelectionStrip = ({selection, onReveal}: {selection: SelectionInfo | null; onReveal: () => void}) => (
  <div className="flex min-h-7 shrink-0 flex-wrap items-center gap-x-3 border-b bg-muted/40 px-2 font-mono text-xs whitespace-nowrap" aria-label="Selection">
    <span className="font-sans font-medium">Selection</span>
    {selection ? (
      <>
        <span>
          <span className="text-muted-foreground">type</span> {selectionType(selection.json)}
        </span>
        <span>
          <span className="text-muted-foreground">anchor</span> {selection.anchor}
        </span>
        <span>
          <span className="text-muted-foreground">head</span> {selection.head}
        </span>
        {selection.empty && <span className="text-muted-foreground">empty</span>}
        <Tip label="Show the node holding the selection's head">
          <Button variant="ghost" size="xs" className="ml-auto" onClick={onReveal}>
            <ViewfinderCircleIcon /> Reveal
          </Button>
        </Tip>
      </>
    ) : (
      <span className="text-muted-foreground">No selection</span>
    )}
  </div>
)

export const Field = ({label, children}: {label: string; children: ReactNode}) => (
  <div className="grid grid-cols-[4.5rem_1fr] gap-2 py-0.5">
    <span className="text-muted-foreground">{label}</span>
    <span className="min-w-0 wrap-break-word">{children}</span>
  </div>
)

export const json = (value: unknown) => JSON.stringify(value, null, 2) ?? String(value)

const NodeDetailView = ({source, path, version}: {source: DetailSource; path: Path; version: number}) => {
  const detail = use(source.detail(path, version))
  if (detail.error != null) return <p className="text-destructive">{detail.error}</p>
  const {node} = detail
  return (
    <div className="font-mono text-xs">
      <Field label="name">{node.name}</Field>
      <Field label="path">[{node.path.join(", ")}]</Field>
      <Field label="from–to">
        {node.from}–{node.to}
      </Field>
      {node.text == null && node.param != null && <Field label="param">{json(node.param)}</Field>}
      {node.text != null && <Field label="text">{json(node.text)}</Field>}
      {node.markValues.map(mark => (
        <Field key={mark.name} label="mark">
          {mark.name}
          {mark.value != null && ` = ${json(mark.value)}`}
        </Field>
      ))}
      <h3 className="mt-2 mb-1 font-sans text-muted-foreground">JSON</h3>
      {node.json == null ? (
        <p className="font-sans text-muted-foreground">Too large to show.</p>
      ) : (
        <pre className="whitespace-pre-wrap">{json(node.json)}</pre>
      )}
    </div>
  )
}

export const NodePane = ({source, focused}: {source: DetailSource; focused: string | null}) => {
  // Deferred: the previous detail stays up while the next one loads, instead of a fallback.
  const version = useDeferredValue(useSyncExternalStore(source.subscribe, source.version))
  const id = useDeferredValue(focused)
  return (
    <aside
      aria-label="Node"
      className="h-full overflow-auto p-2"
    >
      {id == null ? (
        <p className="text-muted-foreground">Focus a node to see it here.</p>
      ) : (
        <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
          <NodeDetailView source={source} path={pathOf(id)} version={version} />
        </Suspense>
      )}
    </aside>
  )
}
