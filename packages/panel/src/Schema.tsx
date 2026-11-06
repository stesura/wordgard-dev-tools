import {cn} from "cn"
import {ClipboardDocumentIcon, CodeBracketIcon, CommandLineIcon, EyeIcon, XMarkIcon} from "#icons"
import {useCallback, useRef, useState, useSyncExternalStore, type ReactNode} from "react"
import type {SchemaGroup, SchemaInfo, SchemaMarkType, SchemaNodeType, SchemaParam} from "@stesura/wordgard-dev-tools"
import {Tag} from "#components/ui/badge"
import {Button} from "#components/ui/button"
import {ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger} from "#components/ui/context-menu"
import {copy, createMenuAnchor, type MenuAnchor} from "./node-menu.tsx"
import {json} from "./node-pane.tsx"
import {createSchemaSource} from "./schema-source.ts"
import type {PanelStore} from "./store.ts"
import {Tip} from "./tip.tsx"
import {hue, markColour, typeColour, type ColourKind} from "./colours.ts"
import {SplitPane} from "./split-pane.tsx"
import {scrollInto} from "./Structure.tsx"

type Kind = "node" | "mark" | "group"
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

// Groups have no colour of their own: a dotted underline marks the link.
const groupLink = "underline decoration-dotted underline-offset-2 hover:decoration-solid"

/** Type or group names, each a link to its card. */
const Links = ({kind, names, onGo}: {kind: Kind; names: string[]; onGo: Go}) =>
  names.length ? (
    <span className="flex flex-wrap gap-x-2">
      {names.map(name => (
        <button
          key={name}
          type="button"
          className={cn(
            "cursor-pointer rounded",
            kind == "mark" ? cn(markColour, "px-1 hover:underline") : kind == "node" ? cn(typeColour, "hover:underline") : groupLink,
          )}
          style={kind == "group" ? undefined : hue(kind, name)}
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
  kind: ColourKind
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
    {type.groups.length > 0 && (
      <Line label="groups">
        <Links kind="group" names={type.groups} onGo={onGo} />
      </Line>
    )}
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

const AUTOMATIC = "automatic"

const groupTags = (group: SchemaGroup) => [group.builtIn ? "Wordgard's" : "the schema's", ...(group.implied ? [AUTOMATIC] : [])]

/** A group's tags; "automatic" says what it means on hover. */
const GroupTags = ({group}: {group: SchemaGroup}) =>
  groupTags(group).map(tag =>
    tag == AUTOMATIC ? (
      <Tip
        key={tag}
        label={
          <span className="block max-w-72">
            Not declared: a type is in it by being a leaf or a plot, inline or block. Node cards don't list it.
          </span>
        }
      >
        <Tag className="cursor-help">{tag}</Tag>
      </Tip>
    ) : (
      <Tag key={tag}>{tag}</Tag>
    ),
  )

/** A node group: its types, and the content and mark targets that name it. */
const GroupCard = ({group, selected, onGo}: {group: SchemaGroup; selected: boolean; onGo: Go}) => (
  <section
    data-type={`group-${group.name}`}
    aria-label={`${group.name} group`}
    aria-current={selected || undefined}
    className={cn("mb-1.5 rounded border border-l-4 border-l-muted-foreground/40 px-2 py-1", selected && "ring-2 ring-ring")}
  >
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="font-semibold">{group.name}</span>
      <GroupTags group={group} />
    </div>
    <Line label="types">
      <Links kind="node" names={group.members} onGo={onGo} />
    </Line>
    {group.inContentOf.length > 0 && (
      <Line label="content of">
        <Links kind="node" names={group.inContentOf} onGo={onGo} />
      </Line>
    )}
    {group.inTargetOf.length > 0 && (
      <Line label="target of">
        <Links kind="mark" names={group.inTargetOf} onGo={onGo} />
      </Line>
    )}
  </section>
)

/** A card's id (`node-Paragraph`): its kind and name. */
const parseCard = (card: string) => {
  const dash = card.indexOf("-")
  const kind = card.slice(0, dash)
  return {kind: kind == "node" || kind == "mark" || kind == "group" ? kind : null, name: card.slice(dash + 1)}
}

type CardJSON = {kind: Kind; name: string; label: string; value: unknown}

/** A card's JSON: a type's spec, or a group's data. */
const jsonOf = (schema: SchemaInfo | null, card: string | null): CardJSON | null => {
  const {kind, name} = parseCard(card ?? "")
  if (kind == "node") {
    const type = schema?.nodes.find(t => t.name == name)
    return type ? {kind, name, label: "node type spec", value: type.spec} : null
  }
  if (kind == "mark") {
    const type = schema?.marks.find(t => t.name == name)
    return type ? {kind, name, label: "mark type spec", value: type.spec} : null
  }
  const group = kind == "group" ? schema?.groups.find(g => g.name == name) : undefined
  return group ? {kind: "group", name, label: "node group", value: group} : null
}

/** Logs a type (the live object), or with `json` its JSON; a group always as JSON. */
type Log = (kind: Kind, name: string, json: boolean) => void

/** The selected card's JSON, with log, copy and close buttons. */
const SpecPane = ({shown, onLog, onClose}: {shown: CardJSON | null; onLog: Log; onClose: () => void}) => (
  <aside aria-label="Spec" className="flex h-full min-h-0 flex-col">
    <div className="flex min-h-7 shrink-0 items-center gap-2 border-b bg-strip px-2 font-sans">
      {shown ? (
        <>
          <h3 className="font-medium">{shown.name}</h3>
          <span className="text-muted-foreground">{shown.label}</span>
        </>
      ) : (
        <h3 className="text-muted-foreground">JSON</h3>
      )}
      <span className="ml-auto flex items-center gap-1">
        {shown && shown.kind != "group" && (
          <Tip label={`Log the ${shown.name} ${shown.kind} type to the page's console`}>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Log the ${shown.name} ${shown.kind} type to the page's console`}
              onClick={() => onLog(shown.kind, shown.name, false)}
            >
              <CommandLineIcon />
            </Button>
          </Tip>
        )}
        {shown && (
          <Tip label="Copy the JSON">
            <Button variant="ghost" size="icon-xs" aria-label="Copy the JSON" onClick={() => void copy(json(shown.value))}>
              <ClipboardDocumentIcon />
            </Button>
          </Tip>
        )}
        <Tip label="Close">
          <Button variant="ghost" size="icon-xs" aria-label="Close the JSON" onClick={onClose}>
            <XMarkIcon />
          </Button>
        </Tip>
      </span>
    </div>
    {shown ? (
      <pre className="min-h-0 flex-1 overflow-auto p-2 font-mono text-xs whitespace-pre-wrap">{json(shown.value)}</pre>
    ) : (
      <p className="p-2 text-muted-foreground">Select a node type, mark type or group to see its JSON here.</p>
    )}
  </aside>
)

type MenuTarget = {card: string}

/** A card's context menu: show, log and copy its JSON. */
const SchemaMenu = ({
  schema,
  anchor,
  paneOpen,
  onShow,
  onLog,
}: {
  schema: SchemaInfo | null
  anchor: MenuAnchor<MenuTarget>
  paneOpen: boolean
  onShow: (card: string) => void
  onLog: Log
}) => {
  const target = useSyncExternalStore(anchor.subscribe, anchor.get)
  const card = jsonOf(schema, target?.card ?? null)
  return (
    <ContextMenu>
      <ContextMenuTrigger className="hidden">
        <span ref={anchor.setTrigger} />
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        {/* With the pane open, the menu's card is already in it (opening the menu selects it). */}
        {!paneOpen && (
          <ContextMenuItem className="text-xs" disabled={!card} onClick={() => target && onShow(target.card)}>
            <EyeIcon /> Show JSON
          </ContextMenuItem>
        )}
        {card?.kind != "group" && (
          <ContextMenuItem className="text-xs" disabled={!card} onClick={() => card && onLog(card.kind, card.name, false)}>
            <CommandLineIcon /> Log to console
          </ContextMenuItem>
        )}
        <ContextMenuItem className="text-xs" disabled={!card} onClick={() => card && onLog(card.kind, card.name, true)}>
          <CodeBracketIcon /> Log JSON
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem className="text-xs" disabled={!card} onClick={() => card && void copy(json(card.value))}>
          <ClipboardDocumentIcon /> Copy JSON
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
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
      <XMarkIcon />
    </button>
  </Tip>
)

/** A section's bar: its title, its count and its tag filters (a type shows when it has every
 * pressed tag). Sticky, so the section scrolling under it stays named. Its title, and the empty
 * stretch after its filters, collapse or expand the section. */
const Heading = ({
  title,
  count,
  open,
  onToggleOpen,
  tags,
  pressed,
  onToggle,
  onClear,
  children,
}: {
  title: string
  count: string
  open: boolean
  onToggleOpen: () => void
  tags: string[]
  pressed: ReadonlySet<string>
  onToggle: (tag: string) => void
  onClear: () => void
  children?: ReactNode
}) => (
  <div data-heading className="sticky top-0 z-10 flex min-h-7 flex-wrap items-center gap-1 border-b bg-strip px-2 py-1 font-sans">
    <h3 className="font-semibold">
      <button
        type="button"
        aria-expanded={open}
        aria-label={`${open ? "Collapse" : "Expand"} the ${title.toLowerCase()}`}
        className="cursor-pointer rounded hover:underline"
        onClick={onToggleOpen}
      >
        {title}
      </button>
    </h3>
    <span className="mr-2 text-muted-foreground">{count}</span>
    {tags.map(tag => (
      <Toggle key={tag} pressed={pressed.has(tag)} onClick={() => onToggle(tag)}>
        {tag}
      </Toggle>
    ))}
    {pressed.size > 0 && <Clear label={`Clear the ${title.toLowerCase()} filters`} onClick={onClear} />}
    {/* A mouse target only: the title is the keyboard's. */}
    <div data-collapse aria-hidden className="min-w-4 flex-1 cursor-pointer self-stretch" onClick={onToggleOpen} />
    {children}
  </div>
)

/** "12", or "3 of 12" when filtered. */
const count = (shown: number, all: number) => (shown == all ? String(all) : `${shown} of ${all}`)

const allOpen = {node: true, group: true, mark: true}
const none: ReadonlySet<string> = new Set()

/** The editor's node and mark types. Mounted per editor. */
export const Schema = ({store, editorId}: {store: PanelStore; editorId: number}) => {
  const [source] = useState(() => createSchemaSource(store.transport, editorId))
  const schema = useSyncExternalStore(source.subscribe, source.schema)
  const error = useSyncExternalStore(source.subscribe, source.error)
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(allOpen)
  const [nodeFilter, setNodeFilter] = useState(none)
  const [markFilter, setMarkFilter] = useState(none)
  const [groupFilter, setGroupFilter] = useState(none)
  const [byRank, setByRank] = useState(false)
  // The card clicked or shown last (a "show type" from the Structure): ringed.
  const [selectedCard, setSelectedCard] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement | null>(null)
  const [paneOpen, setPaneOpen] = useState(true)
  const showJSON = (card: string) => {
    setSelectedCard(card)
    setPaneOpen(true)
  }
  const logCard: Log = (kind, name, json) =>
    void store.transport.send({type: "logType", id: editorId, kind, name, json}).catch(() => {})
  // The card a context menu opens on is selected.
  const [menu] = useState(() =>
    createMenuAnchor<MenuTarget>(
      "[data-type]",
      row => ({card: row.getAttribute("data-type") ?? ""}),
      (_, target) => setSelectedCard(target.card),
    ),
  )

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
        const type = store.takeTypeReveal(editorId)
        if (type) void source.ready().then(() => go(type.kind, type.name))
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
    setOpen(allOpen)
    setNodeFilter(none)
    setMarkFilter(none)
    setGroupFilter(none)
    requestAnimationFrame(() => {
      const container = scroller.current
      const card = container?.querySelector(`[data-type='${kind}-${CSS.escape(name)}']`)
      const heading = card?.closest("[data-list]")?.querySelector("[data-heading]")
      if (container && card) scrollInto(container, card, heading instanceof HTMLElement ? heading.offsetHeight : 0)
    })
  }

  const allNodes = schema?.nodes ?? []
  const allMarks = schema?.marks ?? []
  const allGroups = schema?.groups ?? []
  const groups = allGroups.filter(
    group => matches(group.name, query) && groupTags(group).filter(tag => groupFilter.has(tag)).length == groupFilter.size,
  )
  const nodes = allNodes.filter(type => matches(type.name, query) && nodeTags(type).filter(tag => nodeFilter.has(tag)).length == nodeFilter.size)
  const filteredMarks = allMarks.filter(
    type => matches(type.name, query) && type.flags.filter(tag => markFilter.has(tag)).length == markFilter.size,
  )
  // By rank, unranked last; otherwise in the schema's order.
  const marks = byRank
    ? filteredMarks.toSorted((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity))
    : filteredMarks
  const toggleOpen = (kind: Kind) => setOpen(open => ({...open, [kind]: !open[kind]}))
  // A collapsed section counts as a filter.
  const filtered =
    query != "" || nodeFilter.size > 0 || markFilter.size > 0 || groupFilter.size > 0 || !(open.node && open.group && open.mark)
  const clearAll = () => {
    setQuery("")
    setNodeFilter(none)
    setMarkFilter(none)
    setGroupFilter(none)
    setOpen(allOpen)
  }

  return (
    <div className="@container flex min-h-0 flex-1 flex-col">
      {error != null && (
        <p role="alert" className="flex items-center gap-2 border-b px-2 py-1 text-destructive">
          Couldn't load the schema: {error}
          <Button variant="outline" size="xs" onClick={() => void source.load()}>
            Retry
          </Button>
        </p>
      )}
      {/* Narrow: the filter on its own line, its buttons under it. */}
      <div className="flex min-h-7 shrink-0 flex-wrap items-center gap-x-2 border-b bg-strip px-2 pb-1 text-xs @md:flex-nowrap @md:pb-0">
        <input
          type="search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          onKeyDown={event => {
            if (event.key == "Escape") setQuery("")
          }}
          aria-label="Filter the types"
          placeholder="Filter node types, mark types and groups"
          className="h-6 min-w-0 flex-1 basis-full bg-transparent outline-none @md:basis-0"
        />
        {filtered && (
          <Button variant="ghost" size="xs" className="shrink-0" onClick={clearAll}>
            Clear all filters
          </Button>
        )}
        {schema && (
          <span className="flex shrink-0 gap-1">
            <Toggle pressed={open.node} onClick={() => toggleOpen("node")}>
              {schema.nodes.length} nodes
            </Toggle>
            <Toggle pressed={open.mark} onClick={() => toggleOpen("mark")}>
              {schema.marks.length} marks
            </Toggle>
            <Toggle pressed={open.group} onClick={() => toggleOpen("group")}>
              {schema.groups.length} groups
            </Toggle>
          </span>
        )}
      </div>
      <SplitPane
        pane={paneOpen ? <SpecPane shown={jsonOf(schema, selectedCard)} onLog={logCard} onClose={() => setPaneOpen(false)} /> : null}
      >
      <div
        ref={container}
        className="min-h-0 flex-1 overflow-auto font-mono text-xs"
        onClick={event => {
          const card = event.target instanceof Element ? event.target.closest("[data-type]") : null
          if (card) setSelectedCard(card.getAttribute("data-type"))
        }}
        onDoubleClick={event => {
          const card = event.target instanceof Element ? event.target.closest("[data-type]")?.getAttribute("data-type") : null
          if (card) showJSON(card)
        }}
        onContextMenu={menu.onContextMenu}
      >
        <section data-list aria-label="Nodes">
          <Heading
            title="Nodes"
            count={count(nodes.length, allNodes.length)}
            open={open.node}
            onToggleOpen={() => toggleOpen("node")}
            tags={tagsOf(allNodes, nodeTags)}
            pressed={nodeFilter}
            onToggle={tag => setNodeFilter(filter => toggled(filter, tag))}
            onClear={() => setNodeFilter(none)}
          />
          {/* The line above the marks' bar is the nodes' (the bar's own would double the toolbar's, stuck under it). */}
          {open.node && (
            <div className="border-b p-2">
              {nodes.map(type => (
                <NodeCard key={type.name} type={type} selected={selectedCard == `node-${type.name}`} onGo={go} />
              ))}
              {schema && !nodes.length && <p className="font-sans text-muted-foreground">No node types match.</p>}
            </div>
          )}
        </section>
        <section data-list aria-label="Marks">
          <Heading
            title="Marks"
            count={count(marks.length, allMarks.length)}
            open={open.mark}
            onToggleOpen={() => toggleOpen("mark")}
            tags={tagsOf(allMarks, type => type.flags)}
            pressed={markFilter}
            onToggle={tag => setMarkFilter(filter => toggled(filter, tag))}
            onClear={() => setMarkFilter(none)}
          >
            <span className="text-muted-foreground">order</span>
            <Toggle pressed={!byRank} onClick={() => setByRank(false)}>
              schema
            </Toggle>
            <Toggle pressed={byRank} onClick={() => setByRank(true)}>
              rank
            </Toggle>
          </Heading>
          {open.mark && (
            <div className="border-b p-2">
              {marks.map(type => (
                <MarkCard key={type.name} type={type} selected={selectedCard == `mark-${type.name}`} onGo={go} />
              ))}
              {schema && !marks.length && <p className="font-sans text-muted-foreground">No mark types match.</p>}
            </div>
          )}
        </section>
        <section data-list aria-label="Node groups">
          <Heading
            title="Node groups"
            count={count(groups.length, allGroups.length)}
            open={open.group}
            onToggleOpen={() => toggleOpen("group")}
            tags={tagsOf(allGroups, groupTags)}
            pressed={groupFilter}
            onToggle={tag => setGroupFilter(filter => toggled(filter, tag))}
            onClear={() => setGroupFilter(none)}
          />
          {open.group && (
            <div className="p-2">
              {groups.map(group => (
                <GroupCard key={group.name} group={group} selected={selectedCard == `group-${group.name}`} onGo={go} />
              ))}
              {schema && !groups.length && <p className="font-sans text-muted-foreground">No groups match.</p>}
            </div>
          )}
        </section>
      </div>
      </SplitPane>
      <SchemaMenu schema={schema} anchor={menu} paneOpen={paneOpen} onShow={showJSON} onLog={logCard} />
    </div>
  )
}
