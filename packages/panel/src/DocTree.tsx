import {hotkeysCoreFeature, searchFeature, syncDataLoaderFeature, type ItemInstance} from "@headless-tree/core"
import {useTree} from "@headless-tree/react"
import {useVirtualizer} from "@tanstack/react-virtual"
import {cn} from "cn"
import {ChevronDownIcon, ChevronRightIcon, CrosshairIcon, LoaderIcon} from "lucide-react"
import {
  Suspense,
  use,
  useCallback,
  useDeferredValue,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react"
import type {Path, SelectionInfo, TreeNode} from "wordgard-devtools"
import {Button} from "#components/ui/button"
import {ROOT, createDocSource, itemId, parentOf, pathOf, type DocSource} from "./doc-source.ts"
import type {PanelStore} from "./store.ts"

const ROW = 20
const INDENT = 12

const placeholder = (path: Path, name: string, childCount = 0): TreeNode => ({
  path,
  name,
  from: 0,
  to: 0,
  childCount,
  marks: [],
  paramPreview: null,
  textPreview: null,
})

const isPrefix = (prefix: Path, path: Path) => prefix.length <= path.length && prefix.every((n, i) => n == path[i])

const matches = (search: string, node: TreeNode) => {
  const needle = search.toLowerCase()
  return [node.name, node.textPreview, node.paramPreview].some(text => text?.toLowerCase().includes(needle))
}

const selectionType = (json: unknown) =>
  typeof json == "object" && json != null && "type" in json ? String(json.type) : "?"

const SelectionStrip = ({selection, onReveal}: {selection: SelectionInfo | null; onReveal: () => void}) => (
  <div className="flex h-7 shrink-0 items-center gap-3 border-b px-2 font-mono text-xs" aria-label="Selection">
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
        <Button variant="ghost" size="xs" className="ml-auto" onClick={onReveal}>
          <CrosshairIcon /> Reveal
        </Button>
      </>
    ) : (
      <span className="text-muted-foreground">No selection</span>
    )}
  </div>
)

const Field = ({label, children}: {label: string; children: ReactNode}) => (
  <div className="grid grid-cols-[4.5rem_1fr] gap-2 py-0.5">
    <span className="text-muted-foreground">{label}</span>
    <span className="min-w-0 wrap-break-word">{children}</span>
  </div>
)

const json = (value: unknown) => JSON.stringify(value, null, 2) ?? String(value)

const NodeDetailView = ({source, path, version}: {source: DocSource; path: Path; version: number}) => {
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

const NodePane = ({source, focused}: {source: DocSource; focused: string | null}) => {
  // Deferred: the previous detail stays up while the next one loads, instead of a fallback.
  const version = useDeferredValue(useSyncExternalStore(source.subscribe, source.version))
  const id = useDeferredValue(focused)
  return (
    <aside aria-label="Node" className="w-80 shrink-0 overflow-auto border-l p-2">
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

const Row = ({
  item,
  start,
  selection,
  loading,
  onHover,
}: {
  item: ItemInstance<TreeNode>
  start: number
  selection: SelectionInfo | null
  loading: boolean
  onHover: (path: Path) => void
}) => {
  const node = item.getItemData()
  const holds = selection != null && (isPrefix(node.path, selection.headPath) || isPrefix(node.path, selection.anchorPath))
  const innermost =
    selection != null && (node.path.join() == selection.headPath.join() || node.path.join() == selection.anchorPath.join())
  return (
    <div
      {...item.getProps()}
      data-path={node.path.join(".")}
      onPointerEnter={() => onHover(node.path)}
      data-selection={innermost ? "innermost" : holds ? "holds" : undefined}
      className={cn(
        "absolute inset-x-0 top-0 flex cursor-default items-center gap-1.5 pr-2 font-mono text-xs whitespace-nowrap outline-none",
        item.isFocused() && "bg-accent",
        item.isMatchingSearch() && "bg-yellow-500/20",
      )}
      style={{height: ROW, transform: `translateY(${start}px)`, paddingLeft: item.getItemMeta().level * INDENT + 4}}
    >
      <span className="flex w-3 shrink-0 justify-center text-muted-foreground [&_svg]:size-3">
        {loading ? (
          <LoaderIcon className="animate-spin" />
        ) : (
          item.isFolder() && (item.isExpanded() ? <ChevronDownIcon /> : <ChevronRightIcon />)
        )}
      </span>
      <span
        aria-hidden="true"
        className={cn("size-1.5 shrink-0 rounded-full", innermost ? "bg-primary" : holds ? "bg-primary/40" : "")}
      />
      {node.name == "Text" && node.textPreview != null ? (
        <span className="truncate">{json(node.textPreview)}</span>
      ) : (
        <>
          <span>{node.name}</span>
          {node.paramPreview != null && <span className="text-muted-foreground">{node.paramPreview}</span>}
          {node.textPreview != null && <span className="truncate text-muted-foreground">{node.textPreview}</span>}
        </>
      )}
      {node.marks.map(mark => (
        <span key={mark.name} className="rounded bg-muted px-1 text-muted-foreground">
          {mark.name}
          {mark.preview != null && `=${mark.preview}`}
        </span>
      ))}
      <span className="ml-auto shrink-0 pl-2 text-muted-foreground">
        {node.from}–{node.to}
      </span>
    </div>
  )
}

// Each step of a path: "1", "1.0", "1.0.2".
const steps = (path: Path) => path.map((_, depth) => itemId(path.slice(0, depth + 1)))

/** The selected editor's document, loaded as rows are expanded. Mounted per editor. */
export const DocTree = ({store, editorId}: {store: PanelStore; editorId: number}) => {
  const [source] = useState(() => createDocSource(store.transport, editorId))
  const {selection} = useSyncExternalStore(store.subscribe, store.get)
  const info = selection?.id == editorId ? selection.info : null
  const error = useSyncExternalStore(source.subscribe, source.error)
  const scroller = useRef<HTMLDivElement | null>(null)
  // Controlled, so a refresh can collapse and refocus through React state.
  const [expandedItems, setExpandedItems] = useState<string[]>([])
  const [focusedItem, setFocusedItem] = useState<string | null>(null)

  // Rows are virtualized at a fixed height: scroll by index, the row may not be in the DOM.
  const scrollToRow = useCallback((index: number) => {
    const element = scroller.current
    if (!element) return
    const top = index * ROW
    if (top < element.scrollTop) element.scrollTop = top
    else if (top + ROW > element.scrollTop + element.clientHeight) element.scrollTop = top + ROW - element.clientHeight
  }, [])

  // The source owns the data (versioned per document change); headless-tree reads it synchronously.
  const tree = useTree<TreeNode>({
    rootItemId: ROOT,
    state: {expandedItems, focusedItem},
    setExpandedItems,
    setFocusedItem,
    getItemName: item => item.getItemData().name,
    isItemFolder: item => item.getItemData().childCount > 0,
    dataLoader: {
      getItem: id => (id == ROOT ? placeholder([], "Document", 1) : (source.node(id) ?? placeholder(pathOf(id), "…"))),
      getChildren: id => source.children(id),
    },
    isSearchMatchingItem: (search, item) => matches(search, item.getItemData()),
    scrollToItem: item => scrollToRow(item.getItemMeta().index),
    features: [syncDataLoaderFeature, hotkeysCoreFeature, searchFeature],
  })

  const items = tree.getItems()
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW,
    overscan: 20,
  })

  // Refetches every expanded level in one request. Levels that no longer resolve collapse; a
  // focused node that's gone hands focus to its nearest remaining ancestor.
  const refresh = useCallback(async () => {
    const gone = await source.refresh([ROOT, ...tree.getState().expandedItems])
    if (gone.length) setExpandedItems(ids => ids.filter(id => !gone.includes(id)))
    // Only where the parent's level is loaded and lacks the node: a node hidden under a collapsed
    // row keeps focus.
    setFocusedItem(focused => {
      let id = focused
      for (let parent = id && parentOf(id); id != null && parent != null; parent = id && parentOf(id)) {
        if (!source.loaded(parent) || source.node(id)) break
        id = parent
      }
      return id == ROOT ? null : id
    })
  }, [source, tree])

  const reveal = useCallback(
    async (path: Path) => {
      if (!path.length) return
      const ancestors = steps(path).slice(0, -1)
      const target = itemId(path)
      // The levels down to the target, not the target's own children.
      await source.load([ROOT, ...ancestors])
      setExpandedItems(ids => [...new Set([...ids, ...ancestors])])
      setFocusedItem(target)
      // Once React has rendered the expanded levels (a few frames at most).
      for (let frame = 0; frame < 30; frame++) {
        await new Promise(requestAnimationFrame)
        const index = tree.getItemInstance(target).getItemMeta().index
        if (index < 0) continue
        scrollToRow(index)
        tree.updateDomFocus()
        return
      }
    },
    [source, tree, scrollToRow],
  )

  const highlight = (path: Path | null) => {
    store.transport.send({type: "highlight", id: editorId, path}).catch(() => {})
  }

  // The tree's container: headless-tree's ref, plus the source, document-change and reveal subscriptions.
  const container = useCallback(
    (element: HTMLDivElement | null) => {
      scroller.current = element
      tree.registerElement(element)
      if (!element) return
      const stopSource = source.subscribe(() => tree.rebuildTree())
      const stopDoc = store.onDocChanged(id => {
        if (id == editorId) void refresh()
      })
      const takeReveal = () => {
        const path = store.takeReveal(editorId)
        if (path) void reveal(path)
      }
      const stopReveal = store.onReveal(takeReveal)
      takeReveal()
      return () => {
        stopSource()
        stopDoc()
        stopReveal()
        scroller.current = null
        tree.registerElement(null)
      }
    },
    [store, editorId, refresh, reveal, source, tree],
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SelectionStrip selection={info} onReveal={() => info && void reveal(info.headPath)} />
      {error != null && (
        <p role="alert" className="flex items-center gap-2 border-b px-2 py-1 text-destructive">
          Couldn't load the tree: {error}
          <Button variant="outline" size="xs" onClick={() => void refresh()}>
            Retry
          </Button>
        </p>
      )}
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {tree.isSearchOpen() && (
            <input
              {...tree.getSearchInputElementProps()}
              // Mounts after the key that opened the search: about 20 ms later in the shadow root
              // (keys faster than that go to the tree). Focused on mount, it takes the next keys.
              autoFocus
              aria-label="Search loaded nodes"
              placeholder="Search loaded nodes"
              className="h-6 shrink-0 border-b bg-transparent px-2 text-xs outline-none"
            />
          )}
          <div
            {...tree.getContainerProps("Document")}
            ref={container}
            onPointerLeave={() => highlight(null)}
            className="relative min-h-0 flex-1 overflow-auto outline-none"
          >
            <div style={{height: virtualizer.getTotalSize()}}>
              {virtualizer.getVirtualItems().map(row => {
                const item = items[row.index]
                return (
                  item && (
                    <Row
                      key={item.getKey()}
                      item={item}
                      start={row.start}
                      selection={info}
                      loading={source.loading(item.getId())}
                      onHover={highlight}
                    />
                  )
                )
              })}
            </div>
          </div>
        </div>
        <NodePane source={source} focused={focusedItem} />
      </div>
    </div>
  )
}
