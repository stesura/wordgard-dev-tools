import {hotkeysCoreFeature, searchFeature, syncDataLoaderFeature, type ItemInstance} from "@headless-tree/core"
import {useTree} from "@headless-tree/react"
import {useVirtualizer} from "@tanstack/react-virtual"
import {cn} from "cn"
import {ChevronDownIcon, ChevronRightIcon, LoaderIcon} from "lucide-react"
import {useCallback, useRef, useState, useSyncExternalStore} from "react"
import type {Path, SelectionInfo, TreeNode} from "wordgard-devtools"
import {Tag} from "#components/ui/badge"
import {Button} from "#components/ui/button"
import {ROOT, itemId, parentOf, pathOf} from "./detail-cache.ts"
import {createDocSource} from "./doc-source.ts"
import {NodeMenu, createNodeMenuAnchor} from "./node-menu.tsx"
import {NodePane, SelectionStrip, isPrefix, json} from "./node-pane.tsx"
import {SplitPane} from "./split-pane.tsx"
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

const matches = (search: string, node: TreeNode) => {
  const needle = search.toLowerCase()
  return [node.name, node.textPreview, node.paramPreview].some(text => text?.toLowerCase().includes(needle))
}

const Row = ({
  item,
  start,
  selection,
  loading,
}: {
  item: ItemInstance<TreeNode>
  start: number
  selection: SelectionInfo | null
  loading: boolean
}) => {
  const node = item.getItemData()
  const holds = selection != null && (isPrefix(node.path, selection.headPath) || isPrefix(node.path, selection.anchorPath))
  const innermost =
    selection != null && (node.path.join() == selection.headPath.join() || node.path.join() == selection.anchorPath.join())
  return (
    <div
      {...item.getProps()}
      data-path={node.path.join(".")}
      data-name={node.name}
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
        <Tag key={mark.name}>
          {mark.name}
          {mark.preview != null && `=${mark.preview}`}
        </Tag>
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
  // State, not only a ref: the list may mount a render after this component (the split pane
  // measures first), and the virtualizer reads its element when this component renders.
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null)
  // Controlled, so a refresh can collapse and refocus through React state.
  const [expandedItems, setExpandedItems] = useState<string[]>([])
  const [focusedItem, setFocusedItem] = useState<string | null>(null)
  // The row a context menu opens on takes focus.
  const [menu] = useState(() =>
    createNodeMenuAnchor((row, path) => {
      setFocusedItem(itemId(path))
      row.focus({preventScroll: true})
    }),
  )

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
    getScrollElement: () => scrollElement,
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

  // A clicked row's node is outlined in the page until another is clicked, or the tab or editor changes.
  const outlined = useRef(false)
  const highlight = useCallback(
    (path: Path | null) => {
      if (!path && !outlined.current) return
      outlined.current = path != null
      store.transport.send({type: "highlight", id: editorId, path}).catch(() => {})
    },
    [store, editorId],
  )

  // The tree's container: headless-tree's ref, plus the source, document-change and reveal subscriptions.
  const container = useCallback(
    (element: HTMLDivElement | null) => {
      scroller.current = element
      setScrollElement(element)
      tree.registerElement(element)
      if (!element) return
      const stopSource = source.subscribe(() => tree.rebuildTree())
      // Levels may have loaded before this subscription (the split pane mounts the list a render late).
      tree.rebuildTree()
      const stopDoc = store.onDocChanged(id => {
        if (id == editorId) void refresh()
      })
      // The shown tab takes a pick's reveal.
      const takeReveal = () => {
        if (store.get().view != "tree") return
        const path = store.takeReveal(editorId)
        if (path) void reveal(path)
      }
      const stopReveal = store.onReveal(takeReveal)
      const stopView = store.subscribe(() => {
        if (store.get().view != "tree") highlight(null)
      })
      takeReveal()
      return () => {
        stopView()
        highlight(null)
        stopSource()
        stopDoc()
        stopReveal()
        scroller.current = null
        tree.registerElement(null)
      }
    },
    [store, editorId, refresh, reveal, source, tree, highlight],
  )

  return (
    <div className="@container flex min-h-0 flex-1 flex-col">
      <SelectionStrip selection={info} onReveal={() => info && void reveal(info.headPath)} />
      {error != null && (
        <p role="alert" className="flex items-center gap-2 border-b px-2 py-1 text-destructive">
          Couldn't load the tree: {error}
          <Button variant="outline" size="xs" onClick={() => void refresh()}>
            Retry
          </Button>
        </p>
      )}
      <SplitPane pane={<NodePane source={source} focused={focusedItem} />}>
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
            onContextMenu={menu.onContextMenu}
            onKeyDownCapture={menu.onKeyDown}
            // Capture: the rows' own click handlers (focus, expand) stay headless-tree's.
            onClickCapture={event => {
              const path = event.target instanceof Element ? event.target.closest("[data-path]")?.getAttribute("data-path") : null
              if (path != null) highlight(path ? path.split(".").map(Number) : [])
            }}
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
                    />
                  )
                )
              })}
            </div>
          </div>
        </div>
      </SplitPane>
      <NodeMenu store={store} editorId={editorId} anchor={menu} view="tree" />
    </div>
  )
}
