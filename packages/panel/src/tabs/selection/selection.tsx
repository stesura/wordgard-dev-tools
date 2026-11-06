import { whileShown } from "#stores/while-shown.ts";
import { LoadError } from "#components/load-error";
import { fire } from "../../transport.ts";
import { useStore } from "@nanostores/react";
import { useCallback, useState } from "react";
import { GuidePopover } from "#components/guide-popover";
import { RESOLVED_POSITIONS, SELECTION } from "../../guides/guides.ts";
import { Field } from "#components/node-pane";
import { json } from "#lib/json.ts";
import { selectionType } from "./selection-bar.tsx";
import { createSelectionSource } from "./selection-source.ts";
import type { PanelStore } from "#stores/panel-store.ts";
import { Tip } from "#components/tip";
import { type Links, Marks, Position, Section, SliceCard, pathLink } from "./selection-cards.tsx";

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

  return (
    // A container: cards side by side when there's room.
    <div className="@container flex min-h-0 flex-1 flex-col">
      <LoadError what="the selection" error={error} onRetry={() => void source.load()} />
      <div ref={container} className="min-h-0 flex-1 overflow-auto font-mono text-xs">
        <div className="flex min-h-8 items-center gap-1 border-b bg-strip px-2 py-1 font-sans">
          <h3 className="font-semibold">Selection</h3>
          <GuidePopover guide={SELECTION} align="start" />
        </div>
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
                code="state.selection"
                fixed
                menu={{ onLog: logSelection, copied: () => json(info.json) }}
              >
                <Field label="type">{selectionType(info.json)}</Field>
                <Field label="from–to">
                  {info.from}–{info.to}
                  {info.empty && <span className="text-muted-foreground"> · empty</span>}
                </Field>
                {info.nodePath && (
                  <Field label="node">
                    <Tip label="Show it in the Structure">
                      <button
                        type="button"
                        className={pathLink}
                        onClick={() => info.nodePath && links.onNode(info.nodePath)}
                      >
                        [{info.nodePath.join(", ")}]
                      </button>
                    </Tip>
                  </Field>
                )}
                {multiple && (
                  <Field label="ranges">
                    {detail.ranges.map((range) => `${range.from}–${range.to}`).join(", ")}
                  </Field>
                )}
                <Field label="typing">
                  <Marks marks={detail.activeMarks} links={links} />
                </Field>
              </Section>
              <Section
                name="JSON"
                title="JSON"
                code="state.selection.toJSON(state)"
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
        {/* Sticky: the position box stays at hand while the cards scroll. */}
        <div className="sticky top-0 z-10 flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1 border-y bg-strip px-2 py-1 font-sans">
          <span className="flex items-center gap-1">
            <h3 className="font-semibold">Resolved positions</h3>
            <GuidePopover guide={RESOLVED_POSITIONS} align="start" />
          </span>
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
        <div className="grid gap-2 p-2 @lg:grid-cols-2">
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
      </div>
    </div>
  );
};
