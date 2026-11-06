import { useStore } from "@nanostores/react";
import { CommandLineIcon, EyeIcon } from "#icons";
import { Button } from "#components/ui/button";
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
        <button
          type="button"
          className="cursor-pointer font-sans font-medium underline decoration-dotted underline-offset-2 hover:decoration-solid"
          onClick={() => store.setTab("selection")}
        >
          Selection
        </button>
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
          {info.empty && <span className="text-muted-foreground">empty</span>}
          {(info.activeMarks.length > 0 || info.storedMarks) && (
            <span className="inline-flex flex-wrap items-center gap-1" data-active-marks>
              <span className="text-muted-foreground">marks:</span>
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
            <Tip label="Show the node holding the selection's head in the Structure">
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Show the node holding the selection's head in the Structure"
                onClick={() => store.showNode(editorId, info.headPath)}
              >
                <EyeIcon />
              </Button>
            </Tip>
            <Tip label="Log the selection to the page's console">
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Log the selection to the page's console"
                onClick={() =>
                  store.transport
                    .send({ type: "logState", id: editorId, keys: ["selection"] })
                    .catch(() => {})
                }
              >
                <CommandLineIcon />
              </Button>
            </Tip>
            <CopyButton label="Copy the selection's JSON" text={() => json(info.json)} />
          </span>
        </>
      ) : (
        <span className="text-muted-foreground">No selection</span>
      )}
    </div>
  );
};
