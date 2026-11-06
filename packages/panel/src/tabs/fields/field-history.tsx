import { Collapsible, CollapsibleContent } from "#components/ui/collapsible";
import { useStore } from "@nanostores/react";
import {
  ArrowUpRightIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClipboardDocumentIcon,
  CommandLineIcon,
} from "#icons";
import { Suspense, use, useState, type KeyboardEvent, type MouseEvent } from "react";
import type { FieldChange, Path } from "@stesura/wordgard-dev-tools";
import { SetChange, SetVerdictBadge, SetView } from "#components/set-view";
import { readSet } from "#lib/set-value.ts";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "#components/ui/context-menu";
import type { FieldsSource } from "./fields-source.ts";
import { clock } from "#lib/time.ts";
import { CopySelection } from "#components/copy-selection";
import { copy } from "#lib/clipboard.ts";
import type { MenuAnchor } from "#lib/menu-anchor.ts";
import { json } from "#lib/json.ts";
import { Tip } from "#components/tip";
import { cn } from "cn";

/** Keyboard focus on a link inside a row: an outline. */
const linkFocus =
  "rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid";

/** A change's time, and its transaction in the log as a link. The link is out of the tab order: the
 * list and the history are one stop each (the history's arrows reach it, and the menus show it). */
export const When = ({
  change,
  onLog,
}: {
  change: FieldChange;
  onLog: (index: number) => void;
}) => (
  <span className="flex gap-2">
    <span className="text-muted-foreground">{clock(change.time)}</span>
    {change.log != null && (
      <Tip label="Show the transaction in the log">
        <button
          type="button"
          tabIndex={-1}
          className={cn("cursor-pointer text-primary hover:underline", linkFocus)}
          onClick={(event) => {
            event.stopPropagation();
            if (change.log != null) onLog(change.log);
          }}
        >
          #{change.log}
        </button>
      </Tip>
    )}
  </span>
);

/** The value a change set, fetched when its row is expanded; for a set, what it added and dropped. */
const ChangeValue = ({
  source,
  index,
  seq,
  version,
  onShowNode,
}: {
  source: FieldsSource;
  index: number;
  seq: number;
  version: number;
  onShowNode: (path: Path) => void;
}) => {
  const result = use(source.change(index, seq, version));
  if (result.error != null) return <p className="font-sans text-destructive">{result.error}</p>;
  const { value, set } = result.detail;
  // Its positions are in that change's document: not linked.
  const shown = readSet(value);
  return (
    <>
      {set && <SetChange detail={set} onPath={onShowNode} tabIndex={-1} />}
      {shown ? <SetView set={shown} /> : <pre className="whitespace-pre-wrap">{json(value)}</pre>}
    </>
  );
};

/** What Right and Left move through in an item, after the item: its links and badge. */
const controls = (item: HTMLElement) =>
  [...item.querySelectorAll("button, [tabindex]")].filter(
    (control) => control instanceof HTMLElement && !control.hasAttribute("data-toggle")
  );

/**
 * A change in the history, a tree item: its preview, expanding to the value it set. Its menu logs or
 * copies it. Enter or Space toggles it; Right opens it, then goes through its links; Left goes back,
 * then closes it.
 */
export const HistoryItem = ({
  source,
  index,
  change,
  version,
  active,
  onLog,
  onShowNode,
}: {
  source: FieldsSource;
  index: number;
  change: FieldChange;
  version: number;
  /** The history's tab stop. */
  active: boolean;
  onLog: (index: number) => void;
  onShowNode: (path: Path) => void;
}) => {
  const [open, setOpen] = useState(false);
  // A click focuses the item, not the button (the preview's goes as it opens).
  const toggle = (event: MouseEvent<HTMLButtonElement>, next: boolean) => {
    setOpen(next);
    const item = event.currentTarget.closest("[data-seq]");
    if (item instanceof HTMLElement) item.focus({ preventScroll: true });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLLIElement>) => {
    const item = event.currentTarget;
    const current = event.target;
    if (event.altKey || event.ctrlKey || event.metaKey || !(current instanceof HTMLElement)) return;
    if (current == item && (event.key == "Enter" || event.key == " ")) {
      event.preventDefault();
      setOpen(!open);
      return;
    }
    if (event.key != "ArrowRight" && event.key != "ArrowLeft") return;
    const right = event.key == "ArrowRight";
    if (current == item && open != right) {
      event.preventDefault();
      setOpen(right);
      return;
    }
    const stops = [item, ...controls(item)];
    const next = stops[stops.indexOf(current) + (right ? 1 : -1)];
    if (!(next instanceof HTMLElement)) return;
    event.preventDefault();
    next.focus();
  };
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      render={
        <li
          role="treeitem"
          aria-expanded={open}
          aria-label={`${clock(change.time)}: ${change.preview}`}
          tabIndex={active ? 0 : -1}
          data-seq={change.seq}
          data-log={change.log ?? undefined}
          onKeyDown={onKeyDown}
          className="border-b py-0.5 outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid"
        />
      }
    >
      <div className="flex h-6 items-center gap-1">
        {/* The target is 24 × 24, the icon where it was (-ml-1.5); -mr-1 takes back the gap. For the
            mouse: the item's aria-expanded says it, and keys toggle it. */}
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          data-toggle
          aria-label={open ? "Collapse the value" : "Expand the value"}
          onClick={(event) => toggle(event, !open)}
          className="-mr-1 -ml-1.5 flex size-6 shrink-0 cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground [&_svg]:size-3"
        >
          {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
        </button>
        <When change={change} onLog={onLog} />
        {change.set && <SetVerdictBadge verdict={change.set} tabIndex={-1} />}
      </div>
      <CollapsibleContent>
        <Suspense fallback={<p className="font-sans text-muted-foreground">Loading…</p>}>
          <ChangeValue
            source={source}
            index={index}
            seq={change.seq}
            version={version}
            onShowNode={onShowNode}
          />
        </Suspense>
      </CollapsibleContent>
      {!open && (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          data-toggle
          onClick={(event) => toggle(event, true)}
          className="block w-full cursor-pointer text-left wrap-break-word"
        >
          {change.preview}
        </button>
      )}
    </Collapsible>
  );
};

export type HistoryTarget = { seq: number; log: number | null };

/** A history change's context menu. */
export const HistoryMenu = ({
  source,
  index,
  anchor,
  onLog,
}: {
  source: FieldsSource;
  index: number;
  anchor: MenuAnchor<HistoryTarget>;
  onLog: (index: number) => void;
}) => {
  const { target: opened, setTrigger } = anchor;
  const target = useStore(opened);
  const copyValue = async (seq: number) => {
    const result = await source.change(index, seq);
    if (result.error == null) await copy(json(result.detail.value));
  };
  return (
    <ContextMenu>
      <ContextMenuTrigger className="hidden">
        <span ref={setTrigger} />
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52" finalFocus={() => opened.get()?.row ?? true}>
        <CopySelection text={target?.selection} />
        <ContextMenuItem onClick={() => target && source.logChange(index, target.seq)}>
          <CommandLineIcon /> Log to console
        </ContextMenuItem>
        <ContextMenuItem onClick={() => target && void copyValue(target.seq)}>
          <ClipboardDocumentIcon /> Copy value
        </ContextMenuItem>
        {target?.log != null && (
          <ContextMenuItem onClick={() => target.log != null && onLog(target.log)}>
            <ArrowUpRightIcon /> Show #{target.log} in Log
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
};
