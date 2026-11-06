import { useStore } from "@nanostores/react";
import { ChevronDownIcon, ChevronRightIcon, ClipboardDocumentIcon, CommandLineIcon } from "#icons";
import { Suspense, use, useState } from "react";
import type { FieldChange } from "@stesura/wordgard-dev-tools";
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

/** A change's time, and its transaction in the log as a link. */
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
          className="cursor-pointer text-primary hover:underline"
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

/** The value a change set, fetched when its row is expanded. */
const ChangeValue = ({
  source,
  index,
  seq,
}: {
  source: FieldsSource;
  index: number;
  seq: number;
}) => {
  const result = use(source.change(index, seq));
  if (result.error != null) return <p className="font-sans text-destructive">{result.error}</p>;
  return <pre className="whitespace-pre-wrap">{json(result.value)}</pre>;
};

/** A change in the history: its preview, expanding to the value it set. Its menu logs or copies it. */
export const HistoryItem = ({
  source,
  index,
  change,
  onLog,
}: {
  source: FieldsSource;
  index: number;
  change: FieldChange;
  onLog: (index: number) => void;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <li data-seq={change.seq} className="border-b py-0.5">
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-expanded={open}
          aria-label={open ? "Collapse the value" : "Expand the value"}
          onClick={() => setOpen(!open)}
          className="flex cursor-pointer text-muted-foreground hover:text-foreground [&_svg]:size-3"
        >
          {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
        </button>
        <When change={change} onLog={onLog} />
      </div>
      {open ? (
        <Suspense fallback={<p className="font-sans text-muted-foreground">Loading…</p>}>
          <ChangeValue source={source} index={index} seq={change.seq} />
        </Suspense>
      ) : (
        // The chevron is the keyboard's way in.
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setOpen(true)}
          className="block w-full cursor-pointer text-left wrap-break-word"
        >
          {change.preview}
        </button>
      )}
    </li>
  );
};

export type HistoryTarget = { seq: number };

/** A history change's context menu. */
export const HistoryMenu = ({
  source,
  index,
  anchor,
}: {
  source: FieldsSource;
  index: number;
  anchor: MenuAnchor<HistoryTarget>;
}) => {
  const { target: opened, setTrigger } = anchor;
  const target = useStore(opened);
  const copyValue = async (seq: number) => {
    const result = await source.change(index, seq);
    if (result.error == null) await copy(json(result.value));
  };
  return (
    <ContextMenu>
      <ContextMenuTrigger className="hidden">
        <span ref={setTrigger} />
      </ContextMenuTrigger>
      <ContextMenuContent
        className="w-52"
        finalFocus={() => opened.get()?.row.querySelector("button") ?? true}
      >
        <CopySelection text={target?.selection} />
        <ContextMenuItem onClick={() => target && source.logChange(index, target.seq)}>
          <CommandLineIcon /> Log to console
        </ContextMenuItem>
        <ContextMenuItem onClick={() => target && void copyValue(target.seq)}>
          <ClipboardDocumentIcon /> Copy value
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};
