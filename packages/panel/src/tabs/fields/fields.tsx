import { LoadError } from "#components/load-error";
import { fire } from "../../transport.ts";
import { useStore } from "@nanostores/react";
import { persistent } from "#stores/persistent.ts";
import { cn } from "cn";
import { NoSymbolIcon } from "#icons";
import { Suspense, useCallback, useDeferredValue, useState, type KeyboardEvent } from "react";
import { Tag } from "#components/ui/badge";
import { Button } from "#components/ui/button";
import { createFieldsSource } from "./fields-source.ts";
import { createMenuAnchor } from "#lib/menu-anchor.ts";
import { errorMessage } from "#lib/json.ts";
import type { PanelStore } from "#stores/panel-store.ts";
import { SplitPane, type Orientation, type SplitKind } from "#components/split-pane";
import { Tip } from "#components/tip";
import { FieldMenu, type MenuTarget } from "./field-menu.tsx";
import { FieldView } from "./field-view.tsx";
import { When } from "./field-history.tsx";

// The list | the field pane: a wider pane than the other tabs', holding two parts.
const FIELDS_SPLIT: SplitKind = {
  key: "wordgard-devtools:fields-pane",
  wide: 672,
  defaults: { horizontal: 560, vertical: 320 },
  min: { horizontal: 280, vertical: 120 },
};

const COLUMNS = "grid grid-cols-[8rem_minmax(0,1fr)_4rem_10rem] items-center gap-x-3";

// The field selected last, by name, selected again after a reload (when it's still there).
const lastField = () =>
  persistent("wordgard-devtools:field", "", { decode: (name) => name, encode: (name) => name });

/** The editor's state fields: values, last change, history linked to the log. Mounted per editor. */
export const Fields = ({ store, editorId }: { store: PanelStore; editorId: number }) => {
  const [source] = useState(() => createFieldsSource(store.transport, editorId));
  const { value: info, error, version: loaded } = useStore(source.state);
  const version = useDeferredValue(loaded);
  const [picked, setPicked] = useState<number | null>(null);
  const [savedField] = useState(lastField);
  const saved = useStore(savedField);
  const setSelected = (index: number) => {
    setPicked(index);
    const name = source.state.get().value?.fields.find((f) => f.index == index)?.name;
    if (name != null) savedField.set(name);
  };
  // Until one is picked, the saved one, if the editor has it.
  const selected = picked ?? info?.fields.find((f) => f.name == saved)?.index ?? null;
  const shownIndex = useDeferredValue(selected);
  const onLog = (index: number) => store.showLogEntry(editorId, index);
  // A set entry's position, in the document shown.
  const showPos = (pos: number) =>
    store.transport.send({ type: "resolve", id: editorId, pos }).then(
      (at) => {
        store.showNode(editorId, at.inText ? [...at.parent.path, at.index] : at.parent.path);
        return null;
      },
      (e: unknown) => errorMessage(e)
    );
  // State: the menu gives the list focus back when it closes.
  const [list, setList] = useState<HTMLDivElement | null>(null);
  // The field a context menu opens on is selected.
  const [menu] = useState(() =>
    createMenuAnchor<MenuTarget>(
      "[data-field-index]",
      (row) => ({ index: Number(row.getAttribute("data-field-index")) }),
      (_, target) => setSelected(target.index)
    )
  );

  // While its tab is shown: tracks the fields' changes and loads on each state change.
  const container = useCallback(
    (element: HTMLDivElement | null) => {
      setList(element);
      if (!element) return;
      const shown = () => store.state.get().tab == "fields";
      let stale = true;
      let watching = false;
      const watch = (on: boolean) => {
        if (on == watching) return;
        watching = on;
        fire(store.transport, { type: "watchFields", id: editorId, on });
      };
      const load = () => {
        stale = false;
        void source.load();
      };
      const sync = () => {
        watch(shown());
        if (shown() && stale) load();
      };
      const stopState = store.on("state", (id) => {
        if (id != editorId) return;
        if (shown()) load();
        else stale = true;
      });
      // A list change may be this editor reconnecting under the same id, its tracking dropped.
      let editors = store.state.get().editors;
      const stopStore = store.state.listen(() => {
        if (store.state.get().editors != editors) {
          editors = store.state.get().editors;
          watching = false;
          stale = true;
        }
        sync();
      });
      sync();
      return () => {
        stopState();
        stopStore();
        watch(false);
      };
    },
    [store, editorId, source]
  );

  const fields = info?.fields ?? [];
  const onKeyDown = (event: KeyboardEvent) => {
    menu.onKeyDown(event);
    if (event.defaultPrevented) return;
    const step: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 };
    if (!(event.key in step) || !fields.length) return;
    event.preventDefault();
    const position = fields.findIndex((f) => f.index == selected);
    const next =
      fields[Math.max(0, Math.min(fields.length - 1, position + (step[event.key] ?? 0)))];
    if (next) setSelected(next.index);
  };

  // The field's next detail (a new version) has the history gone, and the list its count.
  // Without an index, every field's.
  const clearHistory = (index?: number) =>
    store.transport
      .send({ type: "clearFieldHistory", id: editorId, index })
      .then(() => source.load())
      .catch(() => {});

  const pane = (orientation: Orientation) => (
    <aside aria-label="Field" className="flex h-full min-h-0 flex-col">
      {shownIndex == null ? (
        <p className="p-2 text-muted-foreground">Select a field to see it here.</p>
      ) : (
        <Suspense fallback={<p className="p-2 text-muted-foreground">Loading…</p>}>
          <FieldView
            source={source}
            index={shownIndex}
            version={version}
            onLog={onLog}
            onClearHistory={(index) => void clearHistory(index)}
            onShowNode={(path) => store.showNode(editorId, path)}
            onShowPos={showPos}
            orientation={orientation}
          />
        </Suspense>
      )}
    </aside>
  );

  return (
    <div className="@container flex min-h-0 flex-1 flex-col">
      <LoadError what="the fields" error={error} onRetry={() => void source.load()} />
      <div className="flex h-7 shrink-0 items-center gap-2 border-b bg-strip px-2 text-xs">
        <Button
          variant="ghost"
          size="xs"
          disabled={!fields.some((field) => field.changes > 0)}
          onClick={() => void clearHistory()}
        >
          <NoSymbolIcon /> Clear all
        </Button>
      </div>
      <SplitPane kind={FIELDS_SPLIT} pane={pane}>
        <div
          ref={container}
          role="listbox"
          aria-label="State fields"
          tabIndex={0}
          aria-activedescendant={selected == null ? undefined : `field-${selected}`}
          onKeyDown={onKeyDown}
          onContextMenu={menu.onContextMenu}
          className="min-h-0 min-w-0 flex-1 overflow-auto font-mono text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {info && !fields.length && (
            <p className="p-2 font-sans text-muted-foreground">No state fields found.</p>
          )}
          {fields.length > 0 && (
            <div
              aria-hidden="true"
              className={cn(
                COLUMNS,
                "sticky top-0 z-10 border-b bg-background px-3 py-1 font-sans text-muted-foreground"
              )}
            >
              <span>Field</span>
              <span>Value</span>
              <span className="text-right">Changes</span>
              <span>Last change</span>
            </div>
          )}
          {fields.map((field) => (
            <div
              key={field.index}
              id={`field-${field.index}`}
              role="option"
              aria-selected={field.index == selected}
              data-field={field.name}
              data-field-index={field.index}
              onClick={() => setSelected(field.index)}
              className={cn(
                COLUMNS,
                "mx-1.5 mt-1.5 cursor-default rounded-md border px-1.5 py-1.5 whitespace-nowrap",
                field.index == selected && "border-ring bg-accent"
              )}
            >
              <span className="min-w-0">
                <Tag className={cn("max-w-full truncate", field.named && "text-foreground")}>
                  {field.name}
                </Tag>
              </span>
              <span className={cn("truncate", field.preview == null && "text-muted-foreground")}>
                {field.preview ?? "–"}
              </span>
              {field.changes > 0 ? (
                <Tip label="Changes seen">
                  <span data-changes className="text-right text-muted-foreground">
                    {field.changes}
                  </span>
                </Tip>
              ) : (
                <span />
              )}
              <span>{field.last && <When change={field.last} onLog={onLog} />}</span>
            </div>
          ))}
        </div>
      </SplitPane>
      <FieldMenu source={source} anchor={menu} list={list} />
    </div>
  );
};
