import {cn} from "cn"
import {XIcon} from "lucide-react"
import {useCallback, useRef, useState, useSyncExternalStore, type ReactNode} from "react"
import type {SchemaMarkType, SchemaNodeType, SchemaParam} from "@stesura/wordgard-dev-tools"
import {Tag} from "#components/ui/badge"
import {Button} from "#components/ui/button"
import {json} from "./node-pane.tsx"
import {createSchemaSource} from "./schema-source.ts"
import type {PanelStore} from "./store.ts"
import {Tip} from "./tip.tsx"
import {hue, markColour, typeColour} from "./colours.ts"
import {scrollInto} from "./Structure.tsx"

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
    <Tag key={item}>
      {item}
    </Tag>
  ))

/** Type names, each a link to its card. */
const Links = ({kind, names, onGo}: {kind: Kind; names: string[]; onGo: Go}) =>
  names.length ? (
    <span className="flex flex-wrap gap-x-2">
      {names.map(name => (
        <button
          key={name}
          type="button"
          className={cn("cursor-pointer rounded hover:underline", kind == "mark" ? cn(markColour, "px-1") : typeColour)}
          style={hue(kind, name)}
          onClick={event => {
            // The target card is the one ringed, not the one holding the link.
            event.stopPropagation()
            onGo(kind, name)
          }}
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

const Card = ({
  kind,
  name,
  tags,
  shape,
  selected,
  children,
}: {
  kind: Kind
  name: string
  tags: string[]
  shape: string
  selected: boolean
  children: ReactNode
}) => (
  <section
    data-type={`${kind}-${name}`}
    aria-label={`${name} ${kind}`}
    aria-current={selected || undefined}
    className={cn(
      "mb-1.5 rounded border border-l-4 border-l-[hsl(var(--hue)_60%_50%)] px-2 py-1",
      selected && "ring-2 ring-ring",
    )}
    style={hue(kind, name)}
  >
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="font-semibold">{name}</span>
      <Tags items={tags} />
      <span className="ml-auto text-muted-foreground">{shape}</span>
    </div>
    {children}
  </section>
)

const nodeTags = (type: SchemaNodeType) => [type.kind, type.inline ? "inline" : "block", ...type.flags]

const NodeCard = ({type, selected, onGo}: {type: SchemaNodeType; selected: boolean; onGo: Go}) => (
  <Card kind="node" name={type.name} tags={nodeTags(type)} shape={type.shape} selected={selected}>
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

const MarkCard = ({type, selected, onGo}: {type: SchemaMarkType; selected: boolean; onGo: Go}) => (
  <Card
    kind="mark"
    name={type.name}
    tags={[...type.flags, ...(type.rank == null ? [] : [`rank ${type.rank}`])]}
    shape={type.shape}
    selected={selected}
  >
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

/** Every tag the types carry, in first-seen order. */
const tagsOf = <T,>(types: T[], tags: (type: T) => string[]) => [...new Set(types.flatMap(tags))]

const toggled = (set: ReadonlySet<string>, tag: string) => {
  const next = new Set(set)
  if (!next.delete(tag)) next.add(tag)
  return next
}

/** A toggle in a row of filters. */
const Toggle = ({pressed, onClick, children}: {pressed: boolean; onClick: () => void; children: ReactNode}) => (
  <button
    type="button"
    aria-pressed={pressed}
    onClick={onClick}
    className={cn(
      "h-5 cursor-pointer rounded px-1.5 text-xs",
      pressed ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground",
    )}
  >
    {children}
  </button>
)

/** Clears a row of filters. */
const Clear = ({label, onClick}: {label: string; onClick: () => void}) => (
  <Tip label={label}>
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-5 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground [&_svg]:size-3.5"
    >
      <XIcon />
    </button>
  </Tip>
)

/** A section's heading with its tag filters: a type shows when it has every pressed tag. */
const Heading = ({
  title,
  tags,
  pressed,
  onToggle,
  onClear,
  children,
}: {
  title: string
  tags: string[]
  pressed: ReadonlySet<string>
  onToggle: (tag: string) => void
  onClear: () => void
  children?: ReactNode
}) => (
  <div className="mb-1 flex flex-wrap items-center gap-1 font-sans">
    <h3 className="mr-1 text-muted-foreground">{title}</h3>
    {tags.map(tag => (
      <Toggle key={tag} pressed={pressed.has(tag)} onClick={() => onToggle(tag)}>
        {tag}
      </Toggle>
    ))}
    {pressed.size > 0 && <Clear label={`Clear the ${title.toLowerCase()} filters`} onClick={onClear} />}
    {children}
  </div>
)

type Shown = "all" | "nodes" | "marks"
const none: ReadonlySet<string> = new Set()

/** The editor's node and mark types. Mounted per editor. */
export const Schema = ({store, editorId}: {store: PanelStore; editorId: number}) => {
  const [source] = useState(() => createSchemaSource(store.transport, editorId))
  const schema = useSyncExternalStore(source.subscribe, source.schema)
  const error = useSyncExternalStore(source.subscribe, source.error)
  const [query, setQuery] = useState("")
  const [shown, setShown] = useState<Shown>("all")
  const [nodeFilter, setNodeFilter] = useState(none)
  const [markFilter, setMarkFilter] = useState(none)
  const [byRank, setByRank] = useState(false)
  // The card clicked or shown last (a "show type" from the Structure): ringed.
  const [selectedCard, setSelectedCard] = useState<string | null>(null)
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
      // A context menu's "show type": once the schema is in, the card is scrolled to.
      const takeReveal = () => {
        if (!shown()) return
        const name = store.takeTypeReveal(editorId)
        if (name) void source.ready().then(() => go("node", name))
      }
      const stopReveal = store.onReveal(takeReveal)
      if (shown()) load()
      takeReveal()
      return () => {
        stopConfig()
        stopStore()
        stopReveal()
        scroller.current = null
      }
    },
    [store, editorId, source],
  )

  // Clears the filters so the card is there, rings it, then scrolls to it once drawn.
  const go: Go = (kind, name) => {
    setSelectedCard(`${kind}-${name}`)
    setQuery("")
    setShown("all")
    setNodeFilter(none)
    setMarkFilter(none)
    requestAnimationFrame(() => {
      const container = scroller.current
      const card = container?.querySelector(`[data-type='${kind}-${CSS.escape(name)}']`)
      if (container && card) scrollInto(container, card)
    })
  }

  const allNodes = schema?.nodes ?? []
  const allMarks = schema?.marks ?? []
  const nodes = allNodes.filter(type => matches(type.name, query) && nodeTags(type).filter(tag => nodeFilter.has(tag)).length == nodeFilter.size)
  const filteredMarks = allMarks.filter(
    type => matches(type.name, query) && type.flags.filter(tag => markFilter.has(tag)).length == markFilter.size,
  )
  // By rank, unranked last; otherwise in the schema's order.
  const marks = byRank
    ? filteredMarks.toSorted((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity))
    : filteredMarks
  const show = (which: Shown) => setShown(shown == which ? "all" : which)

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
      <div className="flex h-7 shrink-0 items-center gap-2 border-b bg-muted/40 px-2 text-xs">
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
          <span className="flex shrink-0 gap-1">
            <Toggle pressed={shown == "nodes"} onClick={() => show("nodes")}>
              {schema.nodes.length} nodes
            </Toggle>
            <Toggle pressed={shown == "marks"} onClick={() => show("marks")}>
              {schema.marks.length} marks
            </Toggle>
            {shown != "all" && <Clear label="Show nodes and marks" onClick={() => setShown("all")} />}
          </span>
        )}
      </div>
      <div
        ref={container}
        className="min-h-0 flex-1 overflow-auto p-2 font-mono text-xs"
        onClick={event => {
          const card = event.target instanceof Element ? event.target.closest("[data-type]") : null
          if (card) setSelectedCard(card.getAttribute("data-type"))
        }}
      >
        {shown != "marks" && (
          <section aria-label="Nodes" className="mb-6">
            <Heading
              title="Nodes"
              tags={tagsOf(allNodes, nodeTags)}
              pressed={nodeFilter}
              onToggle={tag => setNodeFilter(filter => toggled(filter, tag))}
              onClear={() => setNodeFilter(none)}
            />
            {nodes.map(type => (
              <NodeCard key={type.name} type={type} selected={selectedCard == `node-${type.name}`} onGo={go} />
            ))}
            {schema && !nodes.length && <p className="font-sans text-muted-foreground">No node types match.</p>}
          </section>
        )}
        {shown != "nodes" && (
          <section aria-label="Marks">
            <Heading
              title="Marks"
              tags={tagsOf(allMarks, type => type.flags)}
              pressed={markFilter}
              onToggle={tag => setMarkFilter(filter => toggled(filter, tag))}
              onClear={() => setMarkFilter(none)}
            >
              <span className="ml-auto text-muted-foreground">order</span>
              <Toggle pressed={!byRank} onClick={() => setByRank(false)}>
                schema
              </Toggle>
              <Toggle pressed={byRank} onClick={() => setByRank(true)}>
                rank
              </Toggle>
            </Heading>
            {marks.map(type => (
              <MarkCard key={type.name} type={type} selected={selectedCard == `mark-${type.name}`} onGo={go} />
            ))}
            {schema && !marks.length && <p className="font-sans text-muted-foreground">No mark types match.</p>}
          </section>
        )}
      </div>
    </div>
  )
}
