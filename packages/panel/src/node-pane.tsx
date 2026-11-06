import {ClipboardDocumentIcon, CommandLineIcon, EyeIcon} from "#icons"
import {Suspense, use, useDeferredValue, useState, useSyncExternalStore, type ReactNode} from "react"
import type {NodePart, Path} from "@stesura/wordgard-dev-tools"
import {Button} from "#components/ui/button"
import {ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger} from "#components/ui/context-menu"
import {CopySelection, copy, createMenuAnchor, type MenuAnchor} from "./node-menu.tsx"
import {pathOf, type DetailSource} from "./detail-cache.ts"
import type {ColourKind} from "./colours.ts"
import {CopyButton} from "./copy-button.tsx"
import {GuidePopover} from "./guide.tsx"
import {SELECTION_BAR} from "./guides.ts"
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
      <span className="flex items-center gap-0.5">
        <button
          type="button"
          className="cursor-pointer font-sans font-medium underline decoration-dotted underline-offset-2 hover:decoration-solid"
          onClick={() => store.setView("selection")}
        >
          Selection
        </button>
        <GuidePopover guide={SELECTION_BAR} label="About the selection bar" align="start" />
      </span>
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
          {(info.activeMarks.length > 0 || info.storedMarks) && (
            <span className="inline-flex flex-wrap items-center gap-1" data-active-marks>
              <span className="text-muted-foreground">marks:</span>
              {info.activeMarks.length ? (
                info.activeMarks.map(mark => (
                  <TypeLink key={mark.name} kind="mark" name={mark.name} onShow={(kind, name) => store.showType(editorId, name, kind)} />
                ))
              ) : (
                <span>none</span>
              )}
              {info.storedMarks && (
                <Tip label="The cursor's own marks: typing gets these, not the marks around it">
                  <span className="text-muted-foreground" tabIndex={0}>
                    (stored)
                  </span>
                </Tip>
              )}
            </span>
          )}
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
            <CopyButton label="Copy the selection's JSON" text={() => json(info.json)} />
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
    <span data-value className="min-w-0 wrap-break-word">{children}</span>
  </div>
)

export const json = (value: unknown) => JSON.stringify(value, null, 2) ?? String(value)

type ShowType = (kind: ColourKind, name: string) => void

/** What a pane row logs: one of the node's values, or its JSON. */
export type PaneLog = NodePart | "json"

const PARTS: Partial<Record<string, PaneLog>> = {type: "type", path: "path", range: "range", param: "param", text: "text", json: "json"}
const partOf = (key: string): PaneLog | null => (key.startsWith("mark:") ? {mark: Number(key.slice(5))} : (PARTS[key] ?? null))

type PaneTarget = {part: PaneLog | null; text: string}

/** A row of the pane, with a context menu: log (live, in the page's console) and copy (as shown). */
const Part = ({part, children}: {part: string; children: ReactNode}) => <div data-part={part}>{children}</div>

const PaneMenu = ({anchor, onLog}: {anchor: MenuAnchor<PaneTarget>; onLog: (part: PaneLog) => void}) => {
  const {subscribe, get, setTrigger} = anchor
  const target = useSyncExternalStore(subscribe, get)
  const part = target?.part
  return (
    <ContextMenu>
      <ContextMenuTrigger className="hidden">
        <span ref={setTrigger} />
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <CopySelection text={target?.selection} />
        <ContextMenuItem className="text-xs" disabled={part == null} onClick={() => part != null && onLog(part)}>
          <CommandLineIcon /> Log to console
        </ContextMenuItem>
        <ContextMenuItem className="text-xs" onClick={() => target && void copy(target.text)}>
          <ClipboardDocumentIcon /> {part == "json" ? "Copy JSON" : "Copy value"}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

const NodeDetailView = ({
  source,
  path,
  version,
  onShowType,
  onLog,
}: {
  source: DetailSource
  path: Path
  version: number
  onShowType: ShowType
  onLog: (path: Path, part: PaneLog) => void
}) => {
  const detail = use(source.detail(path, version))
  if (detail.error != null) return <p className="text-destructive">{detail.error}</p>
  const {node} = detail
  return (
    <div className="font-mono text-xs">
      <Part part="type">
        <Field label="type">
          <TypeLink kind="node" name={node.name} onShow={onShowType} />
        </Field>
      </Part>
      <Part part="path">
        <Field label="path">[{node.path.join(", ")}]</Field>
      </Part>
      <Part part="range">
        <Field label="from–to">
          {node.from}–{node.to}
        </Field>
      </Part>
      {node.text == null && node.param != null && (
        <Part part="param">
          <Field label="param">{json(node.param)}</Field>
        </Part>
      )}
      {node.text != null && (
        <Part part="text">
          <Field label="text">{json(node.text)}</Field>
        </Part>
      )}
      {node.markValues.map((mark, index) => (
        <Part key={mark.name} part={`mark:${index}`}>
          <Field label="mark">
            <TypeLink kind="mark" name={mark.name} onShow={onShowType} />
            {mark.value != null && ` = ${json(mark.value)}`}
          </Field>
        </Part>
      ))}
      <div className="mt-2 mb-1 flex items-center gap-1 border-t pt-1 font-sans">
        <h3 className="text-muted-foreground">JSON</h3>
        <span className="ml-auto flex items-center gap-1">
          {/* Logs even a node too large to show: the page has it. */}
          <Tip label="Log the node's JSON to the page's console">
            <Button variant="ghost" size="icon-xs" aria-label="Log the node's JSON to the page's console" onClick={() => onLog(node.path, "json")}>
              <CommandLineIcon />
            </Button>
          </Tip>
          {node.json != null && (
            <CopyButton label="Copy the node's JSON" text={() => json(node.json)} />
          )}
        </span>
      </div>
      {node.json == null ? (
        <p className="font-sans text-muted-foreground">Too large to show.</p>
      ) : (
        <Part part="json">
          <pre data-value className="whitespace-pre-wrap">
            {json(node.json)}
          </pre>
        </Part>
      )}
    </div>
  )
}

export const NodePane = ({
  source,
  focused,
  onShowType,
  onLog,
}: {
  source: DetailSource
  focused: string | null
  onShowType: ShowType
  onLog: (path: Path, part: PaneLog) => void
}) => {
  // Deferred: the previous detail stays up while the next one loads, instead of a fallback.
  const version = useDeferredValue(useSyncExternalStore(source.subscribe, source.version))
  const id = useDeferredValue(focused)
  const [menu] = useState(() =>
    createMenuAnchor<PaneTarget>(
      "[data-part]",
      row => ({
        part: partOf(row.getAttribute("data-part") ?? ""),
        text: row.querySelector("[data-value]")?.textContent ?? "",
      }),
      () => {},
    ),
  )
  return (
    <aside aria-label="Node" className="h-full overflow-auto p-2" onContextMenu={menu.onContextMenu}>
      {id == null ? (
        <p className="text-muted-foreground">Focus a node to see it here.</p>
      ) : (
        <>
          <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
            <NodeDetailView source={source} path={pathOf(id)} version={version} onShowType={onShowType} onLog={onLog} />
          </Suspense>
          <PaneMenu anchor={menu} onLog={part => onLog(pathOf(id), part)} />
        </>
      )}
    </aside>
  )
}
