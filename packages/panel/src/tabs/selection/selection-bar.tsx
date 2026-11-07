import { IconButton } from "#components/icon-button";
import { Button } from "#components/ui/button";
import { fire } from "../../transport.ts";
import { useStore } from "@nanostores/react";
import { CommandLineIcon } from "#icons";
import { GuidePopover } from "#components/guide-popover";
import { EDITOR_BAR, SELECTION_BAR } from "../../guides/guides.ts";
import type { EditorStatus } from "@stesura/wordgard-dev-tools";
import type { PanelStore } from "#stores/panel-store.ts";
import { Tip } from "#components/tip";
import { TypeLink } from "#components/type-link";

export const selectionType = (json: unknown) =>
  typeof json == "object" && json != null && "type" in json ? String(json.type) : "?";

const flag = (on: boolean) => (on ? "yes" : "no");

/** The view's status as the bar shows it: what the editor guide explains, label by label. */
const statusItems = (status: EditorStatus): [label: string, value: string][] => [
  ["root", status.root],
  ["connected", flag(status.connected)],
  ["editable", flag(status.editable)],
  ["focusable", flag(status.focusable)],
  ["focused", flag(status.focused)],
  [
    "IME",
    status.composing ? (status.compositionStarted ? "composing, text changed" : "composing") : "no",
  ],
];

/**
 * Under every tab: the selected editor's selection, then its view (the Editor). One line when
 * there's room, the two on their own lines when narrow.
 */
export const SelectionBar = ({ store, editorId }: { store: PanelStore; editorId: number }) => {
  const { selection, status } = useStore(store.state);
  const info = selection?.id == editorId ? selection.info : null;
  const view = status?.id == editorId ? status.info : null;
  return (
    <div className="@container/bar flex shrink-0 flex-wrap items-center gap-x-6 border-t bg-strip px-2 font-mono text-xs whitespace-nowrap">
      <div
        role="group"
        aria-label="Selection"
        className="flex min-h-7 basis-full flex-wrap items-center gap-x-3 gap-y-1 @4xl/bar:basis-auto"
      >
        <span className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="xs"
            className="font-sans"
            title="Open the Selection tab"
            onClick={() => store.setTab("selection")}
          >
            Selection
          </Button>
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
              <span
                className="inline-flex flex-wrap items-center gap-x-1 gap-y-2"
                data-active-marks
              >
                <span className="text-muted-foreground">activeMarks:</span>
                {info.activeMarks.length ? (
                  info.activeMarks.map((mark) => (
                    <TypeLink
                      key={mark.name}
                      kind="mark"
                      name={mark.name}
                      onShow={(kind, name) => store.showType(editorId, name, kind)}
                      target24
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
          </>
        ) : (
          <span className="text-muted-foreground">No selection</span>
        )}
      </div>
      {/* Narrow, on its own line: a border between the two. */}
      <div
        role="group"
        aria-label="Editor status"
        className="-mx-2 flex min-h-7 basis-full items-center gap-x-3 border-t px-2 @4xl/bar:mx-0 @4xl/bar:ml-auto @4xl/bar:basis-auto @4xl/bar:border-t-0 @4xl/bar:px-0"
      >
        <span className="flex shrink-0 items-center gap-0.5">
          <span className="px-2 font-sans font-medium">Editor</span>
          <GuidePopover guide={EDITOR_BAR} label="About the editor bar" align="start" />
        </span>
        {/* The values wrap among themselves: the log button stays on the first line. */}
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 py-1">
          {view ? (
            statusItems(view).map(([label, value]) => (
              <span key={label}>
                <span className="text-muted-foreground">{label}:</span> {value}
              </span>
            ))
          ) : (
            <span className="text-muted-foreground">No editor</span>
          )}
        </span>
        <IconButton
          label="Log the editor to the console"
          onClick={() => fire(store.transport, { type: "logEditor", id: editorId })}
        >
          <CommandLineIcon />
        </IconButton>
      </div>
    </div>
  );
};
