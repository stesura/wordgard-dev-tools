import { ClipboardDocumentIcon, CodeBracketIcon, CommandLineIcon } from "#icons";
import { useSyncExternalStore } from "react";
import type { LogRow } from "@stesura/wordgard-dev-tools";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "#components/ui/context-menu";
import type { LogSource } from "./log-source.ts";
import { CopySelection } from "#components/copy-selection";
import { copy } from "#lib/clipboard.ts";
import type { MenuAnchor } from "#lib/menu-anchor.ts";
import { json } from "#lib/json.ts";
import { clock } from "#lib/time.ts";
import { flags, ms } from "./log-format.ts";

/** A row as a line of text, its columns tab-separated. */
const rowText = (row: LogRow) =>
  [
    `#${row.index}`,
    clock(row.time),
    row.userEvent ?? "–",
    flags(row).join(" ") || "–",
    `effects ${row.effects}`,
    `annotations ${row.annotations.join(", ")}`,
    `dispatch ${ms(row.dispatchMs)} ms`,
    `flush ${ms(row.flushMs)} ms${row.agentFlush ? " (forced by DevTools)" : ""}`,
  ].join("\t");

export type RowTarget = { index: number };

/** A row's context menu. */
export const RowMenu = ({
  source,
  rows,
  anchor,
}: {
  source: LogSource;
  rows: LogRow[];
  anchor: MenuAnchor<RowTarget>;
}) => {
  const { subscribe, get, setTrigger } = anchor;
  const target = useSyncExternalStore(subscribe, get);
  const row = target ? rows.find((r) => r.index == target.index) : undefined;
  const copyJSON = async (row: LogRow) => {
    const detail = await source.detail(row.index, row.flush);
    if (detail.entry) await copy(json(detail.entry));
  };
  return (
    <ContextMenu>
      <ContextMenuTrigger className="hidden">
        <span ref={setTrigger} />
      </ContextMenuTrigger>
      <ContextMenuContent
        className="w-48"
        finalFocus={() => {
          const list = get()?.row.closest("[role='listbox']");
          return list instanceof HTMLElement ? list : true;
        }}
      >
        <CopySelection text={target?.selection} />
        <ContextMenuItem className="text-xs" onClick={() => row && source.logEntry(row.index)}>
          <CommandLineIcon /> Log to console
        </ContextMenuItem>
        <ContextMenuItem className="text-xs" onClick={() => row && void copyJSON(row)}>
          <CodeBracketIcon /> Copy as JSON
        </ContextMenuItem>
        <ContextMenuItem className="text-xs" onClick={() => row && void copy(rowText(row))}>
          <ClipboardDocumentIcon /> Copy as text
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};
