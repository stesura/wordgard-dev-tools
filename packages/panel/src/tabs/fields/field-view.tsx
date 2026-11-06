import { IconButton } from "#components/icon-button";
import { useStore } from "@nanostores/react";
import { ClipboardDocumentIcon, CommandLineIcon, NoSymbolIcon } from "#icons";
import { use, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from "react";
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
import { HistoryItem, HistoryMenu, type HistoryTarget } from "./field-history.tsx";
import type { Path } from "@stesura/wordgard-dev-tools";
import { SetView } from "#components/set-view";
import { cn } from "cn";
import { readSet } from "#lib/set-value.ts";
import { scrollInto } from "#lib/dom.ts";

// Keyboard focus on the value: an outline, as on a Schema card.
const valueFocus =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

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
  const { target: opened, setTrigger } = anchor;
  const target = useStore(opened);
  return (
    <ContextMenu>
      <ContextMenuTrigger className="hidden">
        <span ref={setTrigger} />
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52" finalFocus={() => opened.get()?.row ?? true}>
        <CopySelection text={target?.selection} />
        <ContextMenuItem onClick={onLog}>
          <CommandLineIcon /> Log to console
        </ContextMenuItem>
        <ContextMenuItem onClick={() => void copy(text())}>
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
  onShowNode,
  onShowPos,
  orientation,
}: {
  source: FieldsSource;
  index: number;
  version: number;
  onLog: (index: number) => void;
  onClearHistory: (index: number) => void;
  onShowNode: (path: Path) => void;
  /** Shows the node at a position of the current document; resolves to an error, or null. */
  onShowPos: (pos: number) => Promise<string | null>;
  orientation: Orientation;
}) => {
  // Per field: the pane stays mounted when another is selected.
  const [posError, setPosError] = useState<{ index: number; error: string | null } | null>(null);
  // The change a menu opens on takes focus.
  const [menu] = useState(() =>
    createMenuAnchor<HistoryTarget>(
      "[data-seq]",
      (row) => ({
        seq: Number(row.getAttribute("data-seq")),
        log: row.hasAttribute("data-log") ? Number(row.getAttribute("data-log")) : null,
      }),
      (row) => row.focus({ preventScroll: true })
    )
  );
  // The history's tab stop: the change focused last (per field), or the newest.
  const [focused, setFocused] = useState<{ index: number; seq: number } | null>(null);
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
  const set = readSet(field.value);
  const changes = field.history.toReversed();
  // Newest first, as shown; a change gone meanwhile is left out.
  const copyHistory = async () => {
    const values = await Promise.all(
      changes.map((change) => source.change(field.index, change.seq))
    );
    const copied = changes.flatMap((change, i) => {
      const found = values[i];
      return found && found.error == null
        ? [{ transaction: change.log, time: change.time, value: found.detail.value }]
        : [];
    });
    return json(copied);
  };
  const active =
    focused?.index == field.index && changes.some((change) => change.seq == focused.seq)
      ? focused.seq
      : changes[0]?.seq;
  // Up and Down (Home, End) move between the changes, from a change or a link in it.
  const onHistoryKeyDown = (event: KeyboardEvent<HTMLOListElement>) => {
    menu.onKeyDown(event);
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const current = event.target instanceof Element ? event.target.closest("[data-seq]") : null;
    const items = [...event.currentTarget.querySelectorAll("[data-seq]")];
    const at = current ? items.indexOf(current) : -1;
    const moves: Partial<Record<string, number>> = {
      ArrowDown: at + 1,
      ArrowUp: at - 1,
      Home: 0,
      End: items.length - 1,
    };
    const next = items[moves[event.key] ?? -1];
    if (!(next instanceof HTMLElement)) return;
    event.preventDefault();
    next.focus({ preventScroll: true });
    const scroller = event.currentTarget.parentElement;
    if (scroller) scrollInto(scroller, next);
  };
  const onHistoryFocus = (event: FocusEvent<HTMLOListElement>) => {
    const seq = event.target.closest("[data-seq]")?.getAttribute("data-seq");
    if (seq != null) setFocused({ index: field.index, seq: Number(seq) });
  };
  const history = (
    <Part
      title="History, newest first"
      actions={
        <>
          <IconButton
            label="Log the history to the console"
            disabled={!field.history.length}
            onClick={() => source.logHistory(field.index)}
          >
            <CommandLineIcon />
          </IconButton>
          <CopyButton
            label="Copy the history"
            disabled={!field.history.length}
            text={copyHistory}
          />
          <IconButton
            label="Clear this field's history"
            disabled={!field.history.length}
            onClick={() => onClearHistory(field.index)}
          >
            <NoSymbolIcon />
          </IconButton>
        </>
      }
    >
      {field.history.length ? (
        <ol
          role="tree"
          aria-label="History"
          onContextMenu={menu.onContextMenu}
          onKeyDown={onHistoryKeyDown}
          onFocus={onHistoryFocus}
        >
          {changes.map((change) => (
            <HistoryItem
              key={change.seq}
              source={source}
              index={field.index}
              change={change}
              version={version}
              active={change.seq == active}
              onLog={onLog}
              onShowNode={onShowNode}
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
          <div onContextMenu={valueMenu.onContextMenu} onKeyDown={valueMenu.onKeyDown}>
            {/* A stop of its own: its menu opens from the keyboard, and keys scroll it. */}
            {set ? (
              <div data-field-value tabIndex={0} className={valueFocus}>
                <SetView
                  set={set}
                  onPos={(pos) =>
                    void onShowPos(pos).then((error) => setPosError({ index: field.index, error }))
                  }
                />
                {posError?.index == field.index && posError.error != null && (
                  <p className="font-sans text-destructive">{posError.error}</p>
                )}
              </div>
            ) : (
              <pre data-field-value tabIndex={0} className={cn("whitespace-pre-wrap", valueFocus)}>
                {json(field.value)}
              </pre>
            )}
          </div>
        </Part>
      </SplitPane>
      <HistoryMenu source={source} index={field.index} anchor={menu} onLog={onLog} />
      <ValueMenu
        anchor={valueMenu}
        onLog={() => source.logValue(field.index)}
        text={() => json(field.value)}
      />
    </div>
  );
};
