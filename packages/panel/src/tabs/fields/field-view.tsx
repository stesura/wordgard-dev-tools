import { ClipboardDocumentIcon, CommandLineIcon, NoSymbolIcon } from "#icons";
import { use, useState, useSyncExternalStore, type ReactNode } from "react";
import { Button } from "#components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "#components/ui/context-menu";
import { CopyButton } from "#components/copy-button";
import type { FieldsSource } from "./fields-source.ts";
import { CopySelection } from "#components/copy-selection";
import { copy } from "#lib/clipboard.ts";
import { createMenuAnchor, type MenuAnchor } from "#lib/menu-anchor.ts";
import { Field as Line } from "#components/node-pane";
import { json } from "#lib/json.ts";
import { SplitPane, type Orientation, type SplitKind } from "#components/split-pane";
import { Tip } from "#components/tip";
import { HistoryItem, HistoryMenu, type HistoryTarget } from "./field-history.tsx";

// Value | history, inside the field pane: laid out as the tab is (`wide` unused).
const FIELD_SPLIT: SplitKind = {
  key: "wordgard-devtools:field-pane",
  wide: 0,
  defaults: { horizontal: 280, vertical: 160 },
  min: { horizontal: 120, vertical: 60 },
};

/** The value's context menu. */
const ValueMenu = ({
  anchor,
  onLog,
  text,
}: {
  anchor: MenuAnchor<object>;
  onLog: () => void;
  text: () => string;
}) => {
  const { subscribe, get, setTrigger } = anchor;
  const target = useSyncExternalStore(subscribe, get);
  return (
    <ContextMenu>
      <ContextMenuTrigger className="hidden">
        <span ref={setTrigger} />
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <CopySelection text={target?.selection} />
        <ContextMenuItem className="text-xs" onClick={onLog}>
          <CommandLineIcon /> Log to console
        </ContextMenuItem>
        <ContextMenuItem className="text-xs" onClick={() => void copy(text())}>
          <ClipboardDocumentIcon /> Copy value
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

/** A part of the field pane: a heading with its buttons, its content scrolling. */
const Part = ({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) => (
  <div className="flex h-full min-h-0 flex-col">
    <div className="flex min-h-7 shrink-0 items-center gap-1 border-b bg-strip px-2 font-sans">
      <h3 className="text-muted-foreground">{title}</h3>
      <span className="ml-auto flex items-center gap-1">{actions}</span>
    </div>
    <div className="min-h-0 flex-1 overflow-auto p-2">{children}</div>
  </div>
);

export const FieldView = ({
  source,
  index,
  version,
  onLog,
  onClearHistory,
  orientation,
}: {
  source: FieldsSource;
  index: number;
  version: number;
  onLog: (index: number) => void;
  onClearHistory: (index: number) => void;
  orientation: Orientation;
}) => {
  const [menu] = useState(() =>
    createMenuAnchor<HistoryTarget>(
      "[data-seq]",
      (row) => ({ seq: Number(row.getAttribute("data-seq")) }),
      () => {}
    )
  );
  const [valueMenu] = useState(() =>
    createMenuAnchor(
      "[data-field-value]",
      () => ({}),
      () => {}
    )
  );
  const result = use(source.detail(index, version));
  if (result.error != null) return <p className="p-2 text-destructive">{result.error}</p>;
  const { field } = result;
  // Newest first, as shown; a change gone meanwhile is left out.
  const copyHistory = async () => {
    const changes = field.history.toReversed();
    const values = await Promise.all(
      changes.map((change) => source.change(field.index, change.seq))
    );
    const copied = changes.flatMap((change, i) => {
      const found = values[i];
      return found && found.error == null
        ? [{ transaction: change.log, time: change.time, value: found.value }]
        : [];
    });
    return json(copied);
  };
  const history = (
    <Part
      title="History, newest first"
      actions={
        <>
          <Tip label="Log the history to the page's console">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Log the history to the page's console"
              disabled={!field.history.length}
              onClick={() => source.logHistory(field.index)}
            >
              <CommandLineIcon />
            </Button>
          </Tip>
          <CopyButton
            label="Copy the history"
            disabled={!field.history.length}
            text={copyHistory}
          />
          <Tip label="Clear this field's history">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Clear this field's history"
              disabled={!field.history.length}
              onClick={() => onClearHistory(field.index)}
            >
              <NoSymbolIcon />
            </Button>
          </Tip>
        </>
      }
    >
      {field.history.length ? (
        <ol aria-label="History" onContextMenu={menu.onContextMenu} onKeyDown={menu.onKeyDown}>
          {[...field.history].reverse().map((change) => (
            <HistoryItem
              key={change.seq}
              source={source}
              index={field.index}
              change={change}
              onLog={onLog}
            />
          ))}
        </ol>
      ) : (
        <p className="font-sans text-muted-foreground">No changes seen.</p>
      )}
    </Part>
  );
  return (
    <div className="flex h-full min-h-0 flex-col font-mono text-xs">
      <div className="shrink-0 border-b p-2">
        <Line label="name">{field.name}</Line>
        <Line label="changes">{field.changes}</Line>
      </div>
      <SplitPane kind={FIELD_SPLIT} orientation={orientation} pane={history}>
        <Part title="Value">
          <div onContextMenu={valueMenu.onContextMenu}>
            <pre data-field-value className="whitespace-pre-wrap">
              {json(field.value)}
            </pre>
          </div>
        </Part>
      </SplitPane>
      <HistoryMenu source={source} index={field.index} anchor={menu} />
      <ValueMenu
        anchor={valueMenu}
        onLog={() => source.logValue(field.index)}
        text={() => json(field.value)}
      />
    </div>
  );
};
