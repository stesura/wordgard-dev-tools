import { cn } from "cn";
import { CodeBracketIcon, CommandLineIcon } from "#icons";
import { Suspense, use, useDeferredValue, useState, type ReactNode } from "react";
import type { EntryPart, LogEntryDetail, LogRow } from "@stesura/wordgard-dev-tools";
import { Button } from "#components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "#components/ui/context-menu";
import type { LogSource } from "./log-source.ts";
import { CopySelection, useMenuSelection } from "#components/copy-selection";
import { copy } from "#lib/clipboard.ts";
import { Field } from "#components/node-pane";
import { json } from "#lib/json.ts";
import { entryFlags, ms, slow, slowText } from "./log-format.ts";
import { clock } from "#lib/time.ts";

/** A part of the entry pane, with its menu: log the part live, copy its JSON. Focusable: Shift+F10 opens it too. */
const Section = ({
  title,
  onLog,
  copied,
  children,
}: {
  title: string;
  onLog: () => void;
  copied: () => string;
  children: ReactNode;
}) => {
  const { selection, onContextMenu } = useMenuSelection();
  return (
    <ContextMenu>
      <ContextMenuTrigger
        onContextMenu={onContextMenu}
        render={
          <section
            aria-label={title}
            tabIndex={0}
            className="rounded outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        }
      >
        <h3 className="mt-2 mb-1 font-sans text-muted-foreground">{title}</h3>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <CopySelection text={selection} />
        <ContextMenuItem className="text-xs" onClick={onLog}>
          <CommandLineIcon /> Log to console
        </ContextMenuItem>
        <ContextMenuItem className="text-xs" onClick={() => void copy(copied())}>
          <CodeBracketIcon /> Copy as JSON
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

const Ranges = ({ entry }: { entry: LogEntryDetail }) =>
  entry.ranges.length ? (
    entry.ranges.map((range, i) => (
      <div key={i} className="mb-1 rounded border p-1" data-range>
        <div className="text-muted-foreground">
          {range.fromA}–{range.toA} → {range.fromB}–{range.toB}
        </div>
        <div className="whitespace-pre-wrap">
          <span className="bg-destructive/15 line-through">{range.beforeText}</span>
          {range.beforeText && range.afterText && " "}
          <span className="bg-green-500/20">{range.afterText}</span>
        </div>
        <details>
          <summary className="cursor-default text-muted-foreground">Tokens</summary>
          <pre className="whitespace-pre-wrap">before {json(range.before)}</pre>
          <pre className="whitespace-pre-wrap">after {json(range.after)}</pre>
        </details>
      </div>
    ))
  ) : (
    <p className="font-sans text-muted-foreground">No document change.</p>
  );

const Values = ({ values }: { values: LogEntryDetail["effectValues"] }) =>
  values.length ? (
    values.map((value, i) => (
      <Field key={i} label={value.type}>
        <pre className="whitespace-pre-wrap">{json(value.value)}</pre>
      </Field>
    ))
  ) : (
    <p className="font-sans text-muted-foreground">None.</p>
  );

const EntryView = ({
  source,
  index,
  flush,
  onRetry,
}: {
  source: LogSource;
  index: number;
  flush: number | null;
  onRetry: () => void;
}) => {
  const detail = use(source.detail(index, flush));
  if (detail.error != null) {
    return (
      <p role="alert" className="flex items-center gap-2 text-destructive">
        {detail.error}
        <Button
          variant="outline"
          size="xs"
          onClick={() => {
            source.forget(index, flush);
            onRetry();
          }}
        >
          Retry
        </Button>
      </p>
    );
  }
  const { entry } = detail;
  const log = (part: EntryPart) => () => source.logEntry(entry.index, part);
  return (
    <div className="font-mono text-xs">
      <Section title="Transaction" onLog={log("transaction")} copied={() => json(entry)}>
        <Field label="index">{entry.index}</Field>
        <Field label="time">{clock(entry.time)}</Field>
        <Field label="userEvent">{entry.userEvent ?? "–"}</Field>
        <Field label="flags">{entryFlags(entry)}</Field>
        <Field label="dispatch">
          <span className={cn(slow(entry.dispatchMs) && slowText)}>{ms(entry.dispatchMs)} ms</span>
        </Field>
        <Field label="flush">
          <span className={cn(slow(entry.flushMs) && slowText)}>{ms(entry.flushMs)} ms</span>
          {entry.flush != null && <span className="text-muted-foreground"> #{entry.flush}</span>}
          {entry.agentFlush && <span className="text-muted-foreground"> forced by DevTools</span>}
        </Field>
      </Section>
      <Section
        title="Changes"
        onLog={log("changes")}
        copied={() => json({ changes: entry.changes, ranges: entry.ranges })}
      >
        <Ranges entry={entry} />
        <details>
          <summary className="cursor-default text-muted-foreground">ChangeSet JSON</summary>
          <pre className="whitespace-pre-wrap">{json(entry.changes)}</pre>
        </details>
      </Section>
      <Section title="Selection" onLog={log("selection")} copied={() => json(entry.selection)}>
        <Field label="set">
          {entry.selection.set == null ? "– (mapped)" : json(entry.selection.set)}
        </Field>
        <Field label="before">{json(entry.selection.before)}</Field>
        <Field label="after">{json(entry.selection.after)}</Field>
      </Section>
      <Section
        title={`Effects (${entry.effectValues.length})`}
        onLog={log("effects")}
        copied={() => json(entry.effectValues)}
      >
        <Values values={entry.effectValues} />
      </Section>
      <Section
        title={`Annotations (${entry.annotationValues.length})`}
        onLog={log("annotations")}
        copied={() => json(entry.annotationValues)}
      >
        <Values values={entry.annotationValues} />
      </Section>
    </div>
  );
};

export const EntryPane = ({ source, row }: { source: LogSource; row: LogRow | null }) => {
  // Deferred: the previous entry stays up while the next one loads.
  const shown = useDeferredValue(row);
  // Remounts the view after a retry, which asks again.
  const [attempt, setAttempt] = useState(0);
  return (
    <aside aria-label="Transaction" className="h-full overflow-auto p-2">
      {shown == null ? (
        <p className="text-muted-foreground">Select a transaction to see it here.</p>
      ) : (
        <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
          <EntryView
            key={attempt}
            source={source}
            index={shown.index}
            flush={shown.flush}
            onRetry={() => setAttempt((n) => n + 1)}
          />
        </Suspense>
      )}
    </aside>
  );
};
