import { whileShown } from "#stores/while-shown.ts";
import { LoadError } from "#components/load-error";
import { fire } from "../../transport.ts";
import { useStore } from "@nanostores/react";
import { useCallback, useState } from "react";
import { GuidePopover } from "#components/guide-popover";
import { RESOLVED_POSITIONS, SELECTION, SELECTION_JSON } from "../../guides/guides.ts";
import { Field } from "#components/node-pane";
import { json } from "#lib/json.ts";
import { selectionType } from "./selection-bar.tsx";
import { createSelectionSource } from "./selection-source.ts";
import type { PanelStore } from "#stores/panel-store.ts";
import type { Path } from "@stesura/wordgard-dev-tools";
import { Tip } from "#components/tip";
import { IconButton } from "#components/icon-button";
import { ArrowTopRightOnSquareIcon } from "#icons";
import { paneHeader } from "#components/pane-header";
import { SplitPane, type SplitKind } from "#components/split-pane";
import { Tag } from "#components/ui/badge";
import { type Links, Marks, Position, Section, SliceCard, pathLink } from "./selection-cards.tsx";

// Other types (an extension's own) keep the plain tag.
const typeColours: Record<string, string> = {
  text: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
  cell: "bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-300",
  node: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
};

const TypeTag = ({ type }: { type: string }) => (
  <Tag data-selection-type={type} className={typeColours[type]}>
    {type}
  </Tag>
);

const PathLink = ({ path, links }: { path: Path; links: Links }) => (
  <Tip label="Show it in the Structure">
    <button type="button" className={pathLink} onClick={() => links.onNode(path)}>
      [{path.join(", ")}]
    </button>
  </Tip>
);

/** A cell selection's anchor or head: the position in front of the cell, and the cell. */
const CellLink = ({ pos, path, links }: { pos: number; path: Path; links: Links }) => (
  <span className="inline-flex flex-wrap gap-x-2">
    {pos}
    <PathLink path={path} links={links} />
  </span>
);

// The selection | the resolved positions: side by side when there's room for both cards' columns.
const RESOLVED_SPLIT: SplitKind = {
  key: "wordgard-devtools:resolved-pane",
  wide: 768,
  defaults: { horizontal: 360, vertical: 240 },
  min: { horizontal: 240, vertical: 100 },
};

/** The selected editor's selection, resolved, and any position typed in. Mounted per editor. */
export const SelectionTab = ({ store, editorId }: { store: PanelStore; editorId: number }) => {
  const [source] = useState(() => createSelectionSource(store.transport, editorId));
  const { value: detail, error } = useStore(source.state);
  const probe = useStore(source.probed);
  const { selection } = useStore(store.state);
  const info = selection?.id == editorId ? selection.info : null;
  const [typed, setTyped] = useState("");
  const links: Links = {
    onNode: (path) => store.showNode(editorId, path),
    onType: (kind, name) => store.showType(editorId, name, kind),
  };
  const logPos = (pos: number) => fire(store.transport, { type: "logPos", id: editorId, pos });
  const logSelection = () =>
    fire(store.transport, { type: "logState", id: editorId, keys: ["selection"] });
  // The innermost node holding the head; a cell selection's head cell.
  const showHolder = () => {
    if (info) store.showNode(editorId, info.cells?.headCellPath ?? info.headPath);
  };

  // Loads while its tab is shown: on showing (when the state changed meanwhile) and on each change.
  const container = useCallback(
    (element: HTMLDivElement | null) => {
      if (!element) return;
      return whileShown(store, {
        tab: "selection",
        editorId,
        on: "state",
        load: () => void source.load(),
      });
    },
    [store, editorId, source]
  );

  const onTyped = (value: string) => {
    setTyped(value);
    // The page says what's wrong with a decimal or an out-of-range number.
    void source.probe(value.trim() == "" ? null : Number(value));
  };

  const multiple = detail != null && detail.ranges.length > 1;

  const resolved = (
    <aside aria-label="Resolved positions" className="@container flex h-full min-h-0 flex-col">
      <div className={paneHeader}>
        <h3 className="font-medium">Resolved positions</h3>
        <GuidePopover guide={RESOLVED_POSITIONS} align="start" />
        <label className="ml-auto flex items-center gap-2">
          <span>Resolve</span>
          <input
            type="number"
            min={0}
            value={typed}
            onChange={(event) => onTyped(event.target.value)}
            onKeyDown={(event) => {
              if (event.key == "Escape") onTyped("");
            }}
            aria-label="Position to resolve"
            placeholder="pos"
            // No spin buttons.
            className="h-5 w-20 [appearance:textfield] rounded border bg-background px-1 font-mono outline-none focus-visible:ring-1 focus-visible:ring-ring [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
        </label>
      </div>
      <div className="grid min-h-0 flex-1 content-start gap-2 overflow-auto p-2 font-mono text-xs @lg:grid-cols-2">
        {info &&
          detail &&
          (info.empty ? (
            <Position
              name="Cursor"
              code="state.sel.head"
              pos={detail.head}
              links={links}
              onLog={logPos}
            />
          ) : (
            <>
              <Position
                name="Anchor"
                code="state.sel.anchor"
                pos={detail.anchor}
                links={links}
                onLog={logPos}
              />
              <Position
                name="Head"
                code="state.sel.head"
                pos={detail.head}
                links={links}
                onLog={logPos}
              />
            </>
          ))}
        {probe &&
          (probe.resolved ? (
            <Position
              name="Position"
              code={`doc.resolve(${probe.pos})`}
              pos={probe.resolved}
              links={links}
              onLog={logPos}
              onClear={() => onTyped("")}
            />
          ) : (
            <p role="alert" className="font-sans text-destructive">
              {probe.error}
            </p>
          ))}
      </div>
    </aside>
  );

  return (
    <div ref={container} className="flex min-h-0 flex-1 flex-col">
      <LoadError what="the selection" error={error} onRetry={() => void source.load()} />
      <SplitPane kind={RESOLVED_SPLIT} pane={resolved}>
        <div className={paneHeader}>
          <h3 className="font-medium">Selection</h3>
          <IconButton
            label="Show the node holding the selection"
            className="ml-auto"
            disabled={!info}
            onClick={showHolder}
          >
            <ArrowTopRightOnSquareIcon />
          </IconButton>
        </div>
        {/* A container: cards side by side when there's room. */}
        <div className="@container min-h-0 flex-1 overflow-auto font-mono text-xs">
          {!info || !detail ? (
            <p className="p-2 font-sans text-muted-foreground">
              {info ? "Loading…" : "No selection"}
            </p>
          ) : (
            <div className="flex flex-col gap-2 p-2">
              <div className="grid gap-2 @lg:grid-cols-2">
                <Section
                  name="Selection"
                  title="Selection"
                  guide={SELECTION}
                  fixed
                  menu={{
                    onLog: logSelection,
                    copied: () => json(info.json),
                    onShowNode: showHolder,
                  }}
                >
                  <Field label="type">
                    <TypeTag type={selectionType(info.json)} />
                  </Field>
                  <Field label="from–to">
                    {info.from}–{info.to}
                    {info.empty && <span className="text-muted-foreground"> · empty</span>}
                  </Field>
                  {info.nodePath && (
                    <Field label="node">
                      <PathLink path={info.nodePath} links={links} />
                    </Field>
                  )}
                  {info.cells && (
                    <>
                      <Field label="anchorCell">
                        <CellLink
                          pos={info.cells.anchorCell}
                          path={info.cells.anchorCellPath}
                          links={links}
                        />
                      </Field>
                      <Field label="headCell">
                        <CellLink
                          pos={info.cells.headCell}
                          path={info.cells.headCellPath}
                          links={links}
                        />
                      </Field>
                      <Field label="cells">
                        <span className="inline-flex flex-wrap gap-x-2">
                          {info.cells.paths.map((path) => (
                            <PathLink key={path.join()} path={path} links={links} />
                          ))}
                        </span>
                      </Field>
                    </>
                  )}
                  {multiple && (
                    <Field label="ranges">
                      {detail.ranges.map((range) => `${range.from}–${range.to}`).join(", ")}
                    </Field>
                  )}
                  <Field label="activeMarks">
                    <Marks marks={detail.activeMarks} links={links} />
                  </Field>
                </Section>
                <Section
                  name="JSON"
                  title="JSON"
                  guide={SELECTION_JSON}
                  fixed
                  menu={{ onLog: logSelection, copied: () => json(info.json) }}
                >
                  <pre className="whitespace-pre-wrap">{json(info.json)}</pre>
                </Section>
              </div>
              <SliceCard
                slice={detail.slice}
                links={links}
                onLog={() => fire(store.transport, { type: "logSlice", id: editorId })}
              />
            </div>
          )}
        </div>
      </SplitPane>
    </div>
  );
};
