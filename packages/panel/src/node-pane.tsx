import {ClipboardDocumentIcon, CommandLineIcon, EyeIcon} from "#icons"
import {Suspense, use, useDeferredValue, useSyncExternalStore, type ReactNode} from "react"
import type {Path} from "@stesura/wordgard-dev-tools"
import {Button} from "#components/ui/button"
import {pathOf, type DetailSource} from "./detail-cache.ts"
import type {ColourKind} from "./colours.ts"
import {copy} from "./node-menu.tsx"
import type {PanelStore} from "./store.ts"
import {Tip} from "./tip.tsx"
import {TypeLink} from "./type-link.tsx"

export const isPrefix = (prefix: Path, path: Path) => prefix.length <= path.length && prefix.every((n, i) => n == path[i])

export const selectionType = (json: unknown) =>
  typeof json == "object" && json != null && "type" in json ? String(json.type) : "?"

/** The selected editor's selection, under every tab. */
export const SelectionBar = ({store, editorId}: {store: PanelStore; editorId: number}) => {
  const {selection} = useSyncExternalStore(store.subscribe, store.get)
  const info = selection?.id == editorId ? selection.info : null
  return (
    <div
      className="flex min-h-7 shrink-0 flex-wrap items-center gap-x-3 border-t bg-strip px-2 font-mono text-xs whitespace-nowrap"
      aria-label="Selection"
    >
      <Tip label="Open the Selection tab">
        <button
          type="button"
          className="cursor-pointer font-sans font-medium underline decoration-dotted underline-offset-2 hover:decoration-solid"
          onClick={() => store.setView("selection")}
        >
          Selection
        </button>
      </Tip>
      {info ? (
        <>
          <span>
            <span className="text-muted-foreground">type:</span> {selectionType(info.json)}
          </span>
          <span>
            <span className="text-muted-foreground">anchor:</span> {info.anchor}
          </span>
          <span>
            <span className="text-muted-foreground">head:</span> {info.head}
          </span>
          {info.empty && <span className="text-muted-foreground">empty</span>}
          <span className="ml-auto flex items-center gap-1">
            <Tip label="Show the node holding the selection's head in the Structure">
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Show the node holding the selection's head in the Structure"
                onClick={() => store.showNode(editorId, info.headPath)}
              >
                <EyeIcon />
              </Button>
            </Tip>
            <Tip label="Log the selection to the page's console">
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Log the selection to the page's console"
                onClick={() => store.transport.send({type: "logState", id: editorId, keys: ["selection"]}).catch(() => {})}
              >
                <CommandLineIcon />
              </Button>
            </Tip>
            <Tip label="Copy the selection's JSON">
              <Button variant="ghost" size="icon-xs" aria-label="Copy the selection's JSON" onClick={() => void copy(json(info.json))}>
                <ClipboardDocumentIcon />
              </Button>
            </Tip>
          </span>
        </>
      ) : (
        <span className="text-muted-foreground">No selection</span>
      )}
    </div>
  )
}

export const Field = ({label, children}: {label: string; children: ReactNode}) => (
  <div className="grid grid-cols-[4.5rem_1fr] gap-2 py-0.5">
    <span className="text-muted-foreground">{label}</span>
    <span className="min-w-0 wrap-break-word">{children}</span>
  </div>
)

export const json = (value: unknown) => JSON.stringify(value, null, 2) ?? String(value)

type ShowType = (kind: ColourKind, name: string) => void

const NodeDetailView = ({
  source,
  path,
  version,
  onShowType,
  onLogJSON,
}: {
  source: DetailSource
  path: Path
  version: number
  onShowType: ShowType
  onLogJSON: (path: Path) => void
}) => {
  const detail = use(source.detail(path, version))
  if (detail.error != null) return <p className="text-destructive">{detail.error}</p>
  const {node} = detail
  return (
    <div className="font-mono text-xs">
      <Field label="type">
        <TypeLink kind="node" name={node.name} onShow={onShowType} />
      </Field>
      <Field label="path">[{node.path.join(", ")}]</Field>
      <Field label="from–to">
        {node.from}–{node.to}
      </Field>
      {node.text == null && node.param != null && <Field label="param">{json(node.param)}</Field>}
      {node.text != null && <Field label="text">{json(node.text)}</Field>}
      {node.markValues.map(mark => (
        <Field key={mark.name} label="mark">
          <TypeLink kind="mark" name={mark.name} onShow={onShowType} />
          {mark.value != null && ` = ${json(mark.value)}`}
        </Field>
      ))}
      <div className="mt-2 mb-1 flex items-center gap-1 border-t pt-1 font-sans">
        <h3 className="text-muted-foreground">JSON</h3>
        <span className="ml-auto flex items-center gap-1">
          {/* Logs even a node too large to show: the page has it. */}
          <Tip label="Log the node's JSON to the page's console">
            <Button variant="ghost" size="icon-xs" aria-label="Log the node's JSON to the page's console" onClick={() => onLogJSON(node.path)}>
              <CommandLineIcon />
            </Button>
          </Tip>
          {node.json != null && (
            <Tip label="Copy the node's JSON">
              <Button variant="ghost" size="icon-xs" aria-label="Copy the node's JSON" onClick={() => void copy(json(node.json))}>
                <ClipboardDocumentIcon />
              </Button>
            </Tip>
          )}
        </span>
      </div>
      {node.json == null ? (
        <p className="font-sans text-muted-foreground">Too large to show.</p>
      ) : (
        <pre className="whitespace-pre-wrap">{json(node.json)}</pre>
      )}
    </div>
  )
}

export const NodePane = ({
  source,
  focused,
  onShowType,
  onLogJSON,
}: {
  source: DetailSource
  focused: string | null
  onShowType: ShowType
  onLogJSON: (path: Path) => void
}) => {
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
          <NodeDetailView source={source} path={pathOf(id)} version={version} onShowType={onShowType} onLogJSON={onLogJSON} />
        </Suspense>
      )}
    </aside>
  )
}
