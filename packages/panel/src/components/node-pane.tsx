import { IconButton } from "#components/icon-button";
import { useStore } from "@nanostores/react";
import { ClipboardDocumentIcon, CommandLineIcon } from "#icons";
import { Suspense, use, useDeferredValue, useState, type ReactNode } from "react";
import type { NodePart, Path } from "@stesura/wordgard-dev-tools";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "./ui/context-menu.tsx";
import { CopySelection } from "./copy-selection.tsx";
import { copy } from "#lib/clipboard.ts";
import { createMenuAnchor, type MenuAnchor } from "#lib/menu-anchor.ts";
import type { DetailSource } from "#lib/detail-cache.ts";
import { pathOf } from "#lib/paths.ts";
import type { ColourKind } from "#lib/colours.ts";
import { CopyButton } from "./copy-button.tsx";
import { TypeLink } from "./type-link.tsx";
import { json } from "#lib/json.ts";

export const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="grid grid-cols-[4.5rem_1fr] gap-2 py-0.5">
    <span className="text-muted-foreground">{label}</span>
    <span data-value className="min-w-0 wrap-break-word">
      {children}
    </span>
  </div>
);

type ShowType = (kind: ColourKind, name: string) => void;

/** What a pane row logs: one of the node's values, or its JSON. */
export type PaneLog = NodePart | "json";

const PARTS: Partial<Record<string, PaneLog>> = {
  type: "type",
  path: "path",
  range: "range",
  param: "param",
  text: "text",
  json: "json",
};
const partOf = (key: string): PaneLog | null =>
  key.startsWith("mark:") ? { mark: Number(key.slice(5)) } : (PARTS[key] ?? null);

type PaneTarget = { part: PaneLog | null; text: string };

/** A row of the pane, with a context menu: log (live, in the page's console) and copy (as shown). */
const Part = ({ part, children }: { part: string; children: ReactNode }) => (
  <div data-part={part}>{children}</div>
);

const PaneMenu = ({
  anchor,
  onLog,
}: {
  anchor: MenuAnchor<PaneTarget>;
  onLog: (part: PaneLog) => void;
}) => {
  const { target: opened, setTrigger } = anchor;
  const target = useStore(opened);
  const part = target?.part;
  return (
    <ContextMenu>
      <ContextMenuTrigger className="hidden">
        <span ref={setTrigger} />
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <CopySelection text={target?.selection} />
        <ContextMenuItem disabled={part == null} onClick={() => part != null && onLog(part)}>
          <CommandLineIcon /> Log to console
        </ContextMenuItem>
        <ContextMenuItem onClick={() => target && void copy(target.text)}>
          <ClipboardDocumentIcon /> {part == "json" ? "Copy JSON" : "Copy value"}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

const NodeDetailView = ({
  source,
  path,
  version,
  onShowType,
  onLog,
}: {
  source: DetailSource;
  path: Path;
  version: number;
  onShowType: ShowType;
  onLog: (path: Path, part: PaneLog) => void;
}) => {
  const detail = use(source.detail(path, version));
  if (detail.error != null) return <p className="text-destructive">{detail.error}</p>;
  const { node } = detail;
  return (
    <div className="font-mono text-xs">
      <Part part="type">
        <Field label="type">
          <TypeLink kind="node" name={node.name} onShow={onShowType} />
        </Field>
      </Part>
      <Part part="path">
        <Field label="path">[{node.path.join(", ")}]</Field>
      </Part>
      <Part part="range">
        <Field label="from–to">
          {node.from}–{node.to}
        </Field>
      </Part>
      {node.text == null && node.param != null && (
        <Part part="param">
          <Field label="param">{json(node.param)}</Field>
        </Part>
      )}
      {node.text != null && (
        <Part part="text">
          <Field label="text">{json(node.text)}</Field>
        </Part>
      )}
      {node.markValues.map((mark, index) => (
        <Part key={mark.name} part={`mark:${index}`}>
          <Field label="mark">
            <TypeLink kind="mark" name={mark.name} onShow={onShowType} />
            {mark.value != null && ` = ${json(mark.value)}`}
          </Field>
        </Part>
      ))}
      <div className="mt-2 mb-1 flex items-center gap-1 border-t pt-1 font-sans">
        <h3 className="text-muted-foreground">JSON</h3>
        <span className="ml-auto flex items-center gap-1">
          {/* Logs even a node too large to show: the page has it. */}
          <IconButton
            label="Log the node's JSON to the console"
            onClick={() => onLog(node.path, "json")}
          >
            <CommandLineIcon />
          </IconButton>
          {node.json != null && (
            <CopyButton label="Copy the node's JSON" text={() => json(node.json)} />
          )}
        </span>
      </div>
      {node.json == null ? (
        <p className="font-sans text-muted-foreground">Too large to show.</p>
      ) : (
        <Part part="json">
          <pre data-value className="whitespace-pre-wrap">
            {json(node.json)}
          </pre>
        </Part>
      )}
    </div>
  );
};

export const NodePane = ({
  source,
  focused,
  onShowType,
  onLog,
}: {
  source: DetailSource;
  focused: string | null;
  onShowType: ShowType;
  onLog: (path: Path, part: PaneLog) => void;
}) => {
  // Deferred: the previous detail stays up while the next one loads, instead of a fallback.
  const version = useDeferredValue(useStore(source.state).version);
  const id = useDeferredValue(focused);
  const [menu] = useState(() =>
    createMenuAnchor<PaneTarget>(
      "[data-part]",
      (row) => ({
        part: partOf(row.getAttribute("data-part") ?? ""),
        text: row.querySelector("[data-value]")?.textContent ?? "",
      }),
      () => {}
    )
  );
  return (
    <aside
      aria-label="Node"
      className="h-full overflow-auto p-2"
      onContextMenu={menu.onContextMenu}
    >
      {id == null ? (
        <p className="text-muted-foreground">Focus a node to see it here.</p>
      ) : (
        <>
          <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
            <NodeDetailView
              source={source}
              path={pathOf(id)}
              version={version}
              onShowType={onShowType}
              onLog={onLog}
            />
          </Suspense>
          <PaneMenu anchor={menu} onLog={(part) => onLog(pathOf(id), part)} />
        </>
      )}
    </aside>
  );
};
