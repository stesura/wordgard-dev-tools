import {cn} from "cn"
import {useCallback, useRef, useState, useSyncExternalStore, type ReactNode} from "react"
import type {SchemaMarkType, SchemaNodeType, SchemaParam} from "wordgard-devtools"
import {Button} from "#components/ui/button"
import {json} from "./node-pane.tsx"
import {createSchemaSource} from "./schema-source.ts"
import type {PanelStore} from "./store.ts"
import {hue, scrollInto, typeColour} from "./Structure.tsx"

type Kind = "node" | "mark"
type Go = (kind: Kind, name: string) => void

const Line = ({label, children}: {label: string; children: ReactNode}) => (
  <div className="grid grid-cols-[4.5rem_1fr] gap-2 py-0.5">
    <span className="text-muted-foreground">{label}</span>
    <span className="min-w-0 wrap-break-word">{children}</span>
  </div>
)

const Tags = ({items}: {items: string[]}) =>
  items.map(item => (
    <span key={item} className="rounded bg-muted px-1 text-muted-foreground">
      {item}
    </span>
  ))

/** Type names, each a link to its card. */
const Links = ({kind, names, onGo}: {kind: Kind; names: string[]; onGo: Go}) =>
  names.length ? (
    <span className="flex flex-wrap gap-x-2">
      {names.map(name => (
        <button
          key={name}
          type="button"
          className={cn("cursor-pointer hover:underline", typeColour)}
          style={hue(name)}
          onClick={() => onGo(kind, name)}
        >
          {name}
        </button>
      ))}
    </span>
  ) : (
    <span className="text-muted-foreground">none</span>
  )

const Param = ({param}: {param: SchemaParam}) =>
  param.validate == null && param.default === undefined ? null : (
    <Line label="param">
      {param.validate ?? "any"}
      {param.default !== undefined && <span className="text-muted-foreground"> · default {json(param.default)}</span>}
    </Line>
  )

const Card = ({kind, name, tags, shape, children}: {kind: Kind; name: string; tags: string[]; shape: string; children: ReactNode}) => (
  <section
    data-type={`${kind}-${name}`}
    aria-label={`${name} ${kind}`}
    className="mb-1.5 rounded border border-l-4 border-l-[hsl(var(--hue)_60%_50%)] px-2 py-1"
    style={hue(name)}
  >
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="font-semibold">{name}</span>
      <Tags items={tags} />
      <span className="ml-auto text-muted-foreground">{shape}</span>
    </div>
    {children}
  </section>
)

const NodeCard = ({type, onGo}: {type: SchemaNodeType; onGo: Go}) => (
  <Card kind="node" name={type.name} tags={[type.kind, type.inline ? "inline" : "block", ...type.flags]} shape={type.shape}>
    {type.groups.length > 0 && <Line label="groups">{type.groups.join(", ")}</Line>}
    {type.roles.length > 0 && <Line label="roles">{type.roles.join(", ")}</Line>}
    {type.content != null && (
      <Line label="content">
        {type.content} <span className="text-muted-foreground">(spec)</span>
      </Line>
    )}
    {type.kind == "plot" && (
      <Line label="holds">
        <Links kind="node" names={type.holds} onGo={onGo} />
      </Line>
    )}
    <Line label="marks">
      <Links kind="mark" names={type.marks} onGo={onGo} />
    </Line>
    <Param param={type.param} />
  </Card>
)

const MarkCard = ({type, onGo}: {type: SchemaMarkType; onGo: Go}) => (
  <Card kind="mark" name={type.name} tags={[...type.flags, ...(type.rank == null ? [] : [`rank ${type.rank}`])]} shape={type.shape}>
    {type.target != null && (
      <Line label="target">
        {type.target} <span className="text-muted-foreground">(spec)</span>
      </Line>
    )}
    <Line label="goes on">
      <Links kind="node" names={type.targets} onGo={onGo} />
    </Line>
    <Param param={type.param} />
  </Card>
)

const matches = (name: string, query: string) => name.toLowerCase().includes(query.toLowerCase())

/** The editor's node and mark types. Mounted per editor. */
export const Schema = ({store, editorId}: {store: PanelStore; editorId: number}) => {
  const [source] = useState(() => createSchemaSource(store.transport, editorId))
  const schema = useSyncExternalStore(source.subscribe, source.schema)
  const error = useSyncExternalStore(source.subscribe, source.error)
  const [query, setQuery] = useState("")
  const scroller = useRef<HTMLDivElement | null>(null)

  // Loads while its tab is shown: on showing (when the configuration changed meanwhile) and on
  // each configuration change.
  const container = useCallback(
    (element: HTMLDivElement | null) => {
      scroller.current = element
      if (!element) return
      const shown = () => store.get().view == "schema"
      let stale = true
      const load = () => {
        stale = false
        void source.load()
      }
      const stopConfig = store.onConfigChanged(id => {
        if (id != editorId) return
        if (shown()) load()
        else stale = true
      })
      const stopStore = store.subscribe(() => {
        if (shown() && stale) load()
      })
      if (shown()) load()
      return () => {
        stopConfig()
        stopStore()
        scroller.current = null
      }
    },
    [store, editorId, source],
  )

  // Clears the filter so the card is there, then scrolls to it once drawn.
  const go: Go = (kind, name) => {
    setQuery("")
    requestAnimationFrame(() => {
      const container = scroller.current
      const card = container?.querySelector(`[data-type='${kind}-${CSS.escape(name)}']`)
      if (container && card) scrollInto(container, card)
    })
  }

  const nodes = schema?.nodes.filter(type => matches(type.name, query)) ?? []
  const marks = schema?.marks.filter(type => matches(type.name, query)) ?? []

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {error != null && (
        <p role="alert" className="flex items-center gap-2 border-b px-2 py-1 text-destructive">
          Couldn't load the schema: {error}
          <Button variant="outline" size="xs" onClick={() => void source.load()}>
            Retry
          </Button>
        </p>
      )}
      <div className="flex h-7 shrink-0 items-center gap-2 border-b px-2 text-xs">
        <input
          type="search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          onKeyDown={event => {
            if (event.key == "Escape") setQuery("")
          }}
          aria-label="Filter the types"
          placeholder="Filter node and mark types"
          className="h-6 min-w-0 flex-1 bg-transparent outline-none"
        />
        {schema && (
          <span className="shrink-0 text-muted-foreground">
            {schema.nodes.length} nodes · {schema.marks.length} marks · doc {schema.doc}
            {schema.lineBreak != null && ` · line break ${schema.lineBreak}`}
          </span>
        )}
      </div>
      <div ref={container} className="min-h-0 flex-1 overflow-auto p-2 font-mono text-xs">
        <h3 className="mb-1 font-sans text-muted-foreground">Nodes</h3>
        {nodes.map(type => (
          <NodeCard key={type.name} type={type} onGo={go} />
        ))}
        <h3 className="mt-2 mb-1 font-sans text-muted-foreground">Marks</h3>
        {marks.map(type => (
          <MarkCard key={type.name} type={type} onGo={go} />
        ))}
        {schema && !nodes.length && !marks.length && <p className="font-sans text-muted-foreground">No types match.</p>}
      </div>
    </div>
  )
}
