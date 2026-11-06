import { cn } from "cn";
import { NoSymbolIcon, RecordIcon, PauseIcon } from "#icons";
import { useCallback, useRef, useState, type KeyboardEvent } from "react";
import { SLOW_MS } from "@stesura/wordgard-dev-tools";
import { Button } from "#components/ui/button";
import { createLogSource } from "./log-source.ts";
import { createMenuAnchor } from "#lib/menu-anchor.ts";
import type { PanelStore } from "#stores/panel-store.ts";
import { Tip } from "#components/tip";
import { SplitPane } from "#components/split-pane";
import { keepRowInView, useRows } from "#hooks/use-rows.ts";
import { COLUMNS, ROW, Row, type Sort, SortHeading, sorted } from "./log-rows.tsx";
import { useStore } from "@nanostores/react";
import {
  FilterBar,
  SettingBox,
  createLogFilters,
  filteredRows,
  noFilters,
} from "./log-filters.tsx";
import { RowMenu, type RowTarget } from "./row-menu.tsx";
import { isSlow, slowText } from "./log-format.ts";
import { Timeline } from "./log-timeline.tsx";
import { EntryPane } from "./entry-pane.tsx";

/** The transaction log of one editor, with record/pause and per-update timing. Mounted per editor. */
export const Log = ({ store, editorId }: { store: PanelStore; editorId: number }) => {
  const [source] = useState(() => createLogSource(store.transport, editorId));
  const view = useStore(source.state);
  const [selected, setSelected] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  // State, not only a ref: the list may mount a render after this component (the split pane
  // measures first), and the rows are read from it when this component renders.
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  const { rows } = view;
  const rowCount = rows.length;
  const [sort, setSort] = useState<Sort>({ key: "index", descending: false });
  // Also read by a reveal, which runs outside a render: set with the state, in the event.
  const sortNow = useRef(sort);
  const changeSort = (next: Sort) => {
    sortNow.current = next;
    setSort(next);
  };
  const [savedFilters] = useState(createLogFilters);
  const filters = useStore(savedFilters);
  const filtered = filteredRows(rows, filters);
  const shown = sorted(filtered, sort);
  // The newest rows come last: new ones are followed.
  const chronological = (sort.key == "index" || sort.key == "time") && !sort.descending;

  // The column header is a sticky row at the top of the scroller.
  const { indices, height } = useRows(scrollElement, shown.length, ROW, { margin: ROW });

  // Stable: the list's ref callback uses it, and would subscribe again on a new one.
  const select = useCallback(
    (index: number) => {
      setSelected(index);
      const order = sorted(
        filteredRows(source.state.get().rows, savedFilters.get()),
        sortNow.current
      );
      // Two rows of room: the sticky column header covers the first.
      keepRowInView(
        scroller.current,
        order.findIndex((row) => row.index == index),
        ROW,
        2
      );
    },
    [source, savedFilters]
  );

  // New rows are followed while the list is scrolled to the bottom.
  const atBottom = useRef(true);
  // Where following scrolled to: its scroll event may come after more rows, and isn't the user's.
  const followedTo = useRef(-1);
  // A new callback per row count: React calls it once those rows are committed.
  const followRows = useCallback(
    (element: HTMLDivElement | null) => {
      const list = scroller.current;
      if (!element || !list || !atBottom.current || !rowCount || !chronological) return;
      list.scrollTop = list.scrollHeight;
      followedTo.current = list.scrollTop;
    },
    [rowCount, chronological]
  );

  // Loads while its tab is shown: on showing (when the log changed meanwhile) and on each change.
  const container = useCallback(
    (element: HTMLDivElement | null) => {
      scroller.current = element;
      setScrollElement(element);
      if (!element) return;
      const shown = () => store.state.get().tab == "log";
      let stale = true;
      const load = () => {
        stale = false;
        void source.load();
      };
      const onScroll = () => {
        if (element.scrollTop == followedTo.current) return;
        atBottom.current = element.scrollTop + element.clientHeight >= element.scrollHeight - ROW;
      };
      element.addEventListener("scroll", onScroll, { passive: true });
      // An entry another tab links to (a field's change): selected once its rows are in.
      const takeReveal = () => {
        if (!shown()) return;
        const index = store.takeLogReveal(editorId);
        if (index == null) return;
        // The entry may be filtered out.
        savedFilters.set(noFilters);
        setSelected(index);
        void source.load().then(() => requestAnimationFrame(() => select(index)));
      };
      const stopReveal = store.onReveal(takeReveal);
      const stopLog = store.onLogChanged((id) => {
        if (id != editorId) return;
        if (shown()) load();
        else stale = true;
      });
      // A list change may be this editor reconnecting with a new log, under the same id.
      let editors = store.state.get().editors;
      const stopStore = store.state.listen(() => {
        if (store.state.get().editors != editors) {
          editors = store.state.get().editors;
          stale = true;
        }
        if (shown() && stale) load();
      });
      // The tab's red dot: kept mounted while hidden, this tab knows whether its editor records.
      const report = () => store.setRecording(source.state.get().recording);
      const stopSource = source.state.listen(report);
      report();
      if (shown()) load();
      takeReveal();
      return () => {
        stopReveal();
        element.removeEventListener("scroll", onScroll);
        stopLog();
        stopStore();
        stopSource();
        store.setRecording(false);
        scroller.current = null;
      };
    },
    [store, editorId, source, select, savedFilters]
  );

  // The row a menu opens on is selected.
  const [menu] = useState(() =>
    createMenuAnchor<RowTarget>(
      "[data-index]",
      (row) => ({ index: Number(row.getAttribute("data-index")) }),
      (_, target) => setSelected(target.index)
    )
  );

  const onKeyDown = (event: KeyboardEvent) => {
    menu.onKeyDown(event);
    if (event.defaultPrevented) return;
    if (!shown.length) return;
    const position = shown.findIndex((row) => row.index == selected);
    const step: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, PageDown: 10, PageUp: -10 };
    const next =
      event.key == "Home"
        ? 0
        : event.key == "End"
          ? shown.length - 1
          : event.key in step
            ? Math.max(
                0,
                Math.min(
                  shown.length - 1,
                  (position < 0 ? shown.length : position) + (step[event.key] ?? 0)
                )
              )
            : null;
    const row = next == null ? undefined : shown[next];
    if (!row) return;
    event.preventDefault();
    select(row.index);
  };

  const selectedRow = rows.find((row) => row.index == selected) ?? null;
  // Only a rendered row can be the active descendant.
  const activeRow = indices.some((index) => shown[index]?.index == selected) ? selectedRow : null;
  const slowCount = rows.filter(isSlow).length;

  return (
    <div className="@container flex min-h-0 flex-1 flex-col">
      <div className="flex h-7 shrink-0 items-center gap-2 border-b bg-strip px-2 text-xs">
        <Button
          variant={view.recording ? "secondary" : "ghost"}
          size="xs"
          aria-pressed={view.recording}
          onClick={() => void source.record(!view.recording)}
        >
          {view.recording ? <PauseIcon /> : <RecordIcon className="text-destructive" />}
          {view.recording ? "Pause" : "Record"}
        </Button>
        <span className="text-muted-foreground" aria-live="polite">
          {filtered.length != rows.length && `${filtered.length} of `}
          {rows.length} transaction{rows.length == 1 ? "" : "s"}
          {view.size > 0 && rows.length >= view.size && ` (the last ${view.size} kept)`}
          {slowCount > 0 && (
            <span className={slowText}>
              {" "}
              · {slowCount} over {SLOW_MS} ms
            </span>
          )}
        </span>
        <Button
          variant="ghost"
          size="xs"
          disabled={!rows.length}
          onClick={() => {
            setSelected(null);
            void source.clear();
          }}
        >
          <NoSymbolIcon /> Clear
        </Button>
        <span className="ml-auto flex items-center gap-2">
          <SettingBox
            source={source}
            setting="selectPointer"
            on={view.selectPointer}
            label="record select.pointer"
            tip="Record selections made with the pointer (clicks and drags in the editor)"
          />
          <SettingBox
            source={source}
            setting="focusChanges"
            on={view.focusChanges}
            label="record focus"
            tip="Record focus changes: the empty transactions Wordgard dispatches when the editor gains or loses focus (clicking in the in-page panel takes it)"
          />
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
      <FilterBar
        rows={rows}
        filters={filters}
        onChange={(update) => savedFilters.set(update(savedFilters.get()))}
      />
      <Timeline rows={filtered} selected={selected} onSelect={select} />
      <SplitPane pane={<EntryPane source={source} row={selectedRow} />}>
        {/* The header sits outside the listbox, which holds only rows. */}
        <div ref={container} className="relative min-h-0 min-w-0 flex-1 overflow-auto">
          <div className="min-w-[34rem]">
            <div
              className={cn(
                COLUMNS,
                "sticky top-0 z-10 h-5 items-center border-b bg-background px-2 text-xs text-muted-foreground"
              )}
            >
              <SortHeading sortKey="index" label="#" tip="Index" sort={sort} onSort={changeSort} />
              <SortHeading sortKey="time" label="time" tip="Time" sort={sort} onSort={changeSort} />
              <span>userEvent</span>
              <span>changed</span>
              <Tip label="Effects">
                <span>eff</span>
              </Tip>
              <SortHeading
                sortKey="annotations"
                label="ann"
                tip="Annotations"
                sort={sort}
                onSort={changeSort}
              />
              <SortHeading
                sortKey="dispatch"
                label="disp"
                tip="Dispatch, ms"
                sort={sort}
                onSort={changeSort}
                right
              />
              <SortHeading
                sortKey="flush"
                label="flush"
                tip="Flush, ms; * forced by DevTools"
                sort={sort}
                onSort={changeSort}
                right
              />
            </div>
            {!rows.length && view.loaded && (
              <p className="p-2 text-xs text-muted-foreground">
                {view.recording
                  ? "Recording: use the editor."
                  : "Not recording. Press Record, then use the editor."}
              </p>
            )}
            {rows.length > 0 && !shown.length && (
              <p className="p-2 text-xs text-muted-foreground">
                No transactions match the filters.
              </p>
            )}
            <div
              ref={followRows}
              role="listbox"
              aria-label="Transactions"
              tabIndex={0}
              aria-activedescendant={activeRow ? `log-row-${activeRow.index}` : undefined}
              onKeyDown={onKeyDown}
              onContextMenu={menu.onContextMenu}
              onClick={(event) => {
                const index =
                  event.target instanceof Element
                    ? event.target.closest("[data-index]")?.getAttribute("data-index")
                    : null;
                if (index != null) setSelected(Number(index));
              }}
              className="relative outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset"
              style={{ height }}
            >
              {indices.map((index) => {
                const row = shown[index];
                return (
                  row && (
                    <Row
                      key={row.index}
                      row={row}
                      start={index * ROW}
                      selected={row.index == selected}
                    />
                  )
                );
              })}
            </div>
          </div>
        </div>
      </SplitPane>
      <RowMenu source={source} rows={rows} anchor={menu} />
    </div>
  );
};
