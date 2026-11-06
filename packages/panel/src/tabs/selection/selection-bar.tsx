import { IconButton } from "#components/icon-button";
import { fire } from "../../transport.ts";
import { useStore } from "@nanostores/react";
import { CommandLineIcon, EyeIcon } from "#icons";
import { CopyButton } from "#components/copy-button";
import { GuidePopover } from "#components/guide-popover";
import { SELECTION_BAR } from "../../guides/guides.ts";
import type { PanelStore } from "#stores/panel-store.ts";
import { Tip } from "#components/tip";
import { TypeLink } from "#components/type-link";
import { json } from "#lib/json.ts";

export const selectionType = (json: unknown) =>
  typeof json == "object" && json != null && "type" in json ? String(json.type) : "?";

/** The selected editor's selection, under every tab. */
export const SelectionBar = ({ store, editorId }: { store: PanelStore; editorId: number }) => {
  const { selection } = useStore(store.state);
  const info = selection?.id == editorId ? selection.info : null;
  return (
    <div
      className="flex min-h-7 shrink-0 flex-wrap items-center gap-x-3 border-t bg-strip px-2 font-mono text-xs whitespace-nowrap"
      aria-label="Selection"
    >
      <span className="flex items-center gap-0.5">
        <span className="font-sans font-medium">Selection</span>
        <GuidePopover guide={SELECTION_BAR} label="About the selection bar" align="start" />
      </span>
      {info ? (
        <>
          <span>
            <span className="text-muted-foreground">type:</span> {selectionType(info.json)}
          </span>
          <span>
            <span className="text-muted-foreground">anchor:</span> {info.anchor}
          </span>
          <span>
            <span className="text-muted-foreground">head:</span> {info.head}
          </span>
          {info.cells && (
            <>
              <span>
                <span className="text-muted-foreground">anchorCell:</span> {info.cells.anchorCell}
              </span>
              <span>
                <span className="text-muted-foreground">headCell:</span> {info.cells.headCell}
              </span>
            </>
          )}
          {info.empty && <span className="text-muted-foreground">empty</span>}
          {(info.activeMarks.length > 0 || info.storedMarks) && (
            <span className="inline-flex flex-wrap items-center gap-1" data-active-marks>
              <span className="text-muted-foreground">activeMarks:</span>
              {info.activeMarks.length ? (
                info.activeMarks.map((mark) => (
                  <TypeLink
                    key={mark.name}
                    kind="mark"
                    name={mark.name}
                    onShow={(kind, name) => store.showType(editorId, name, kind)}
                  />
                ))
              ) : (
                <span>none</span>
              )}
              {info.storedMarks && (
                <Tip label="The cursor's own marks: typing gets these, not the marks around it">
                  <span className="text-muted-foreground" tabIndex={0}>
                    (stored)
                  </span>
                </Tip>
              )}
            </span>
          )}
          <span className="ml-auto flex items-center gap-1">
            <IconButton
              label={
                info.cells
                  ? "Show the head cell in the Structure"
                  : "Show the node holding the selection's head in the Structure"
              }
              onClick={() => store.showNode(editorId, info.cells?.headCellPath ?? info.headPath)}
            >
              <EyeIcon />
            </IconButton>
            <IconButton
              label="Log the selection to the console"
              onClick={() =>
                fire(store.transport, { type: "logState", id: editorId, keys: ["selection"] })
              }
            >
              <CommandLineIcon />
            </IconButton>
            <CopyButton label="Copy the selection's JSON" text={() => json(info.json)} />
          </span>
        </>
      ) : (
        <span className="text-muted-foreground">No selection</span>
      )}
    </div>
  );
};
