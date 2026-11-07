import type { DecorationInfo, Path, StructureNode } from "@stesura/wordgard-dev-tools";
import { XMarkIcon } from "#icons";
import { IconButton } from "#components/icon-button";
import { paneHeader } from "#components/pane-header";
import { DecorationList } from "./decoration-views.tsx";
import { DecorationsNav, nameAt } from "./decorations-nav.tsx";
import { decorationsOf, type DecorationIndex } from "./decorations-source.ts";

/**
 * The decorations, beside the document and its node: the selected node's (else the document's),
 * the list of all and the stepping in its bar. Closed with its button or Escape, which turns
 * decorations off.
 */
export const DecorationsPane = ({
  index,
  error,
  doc,
  selected,
  onShow,
  onLog,
  onClose,
}: {
  index: DecorationIndex | null;
  error: string | null;
  doc: StructureNode | null;
  /** The selected node; null for the document. */
  selected: Path | null;
  onShow: (path: Path) => void;
  onLog: (item: DecorationInfo) => void;
  onClose: () => void;
}) => {
  const name = selected && nameAt(doc, selected);
  return (
    <aside
      aria-label="Decorations"
      className="flex h-full min-h-0 flex-col"
      onKeyDown={(event) => {
        // In the pane itself: a popup's Escape (the list's) bubbles here too, through React.
        if (
          event.key == "Escape" &&
          !event.defaultPrevented &&
          event.target instanceof Node &&
          event.currentTarget.contains(event.target)
        ) {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div className={paneHeader}>
        <h3 className="shrink-0 font-medium">Decorations</h3>
        {index && <DecorationsNav index={index} doc={doc} selected={selected} onShow={onShow} />}
        <IconButton label="Close the decorations" className="ml-auto" onClick={onClose}>
          <XMarkIcon />
        </IconButton>
      </div>
      {error != null && (
        <p role="alert" className="border-b px-2 py-1 text-xs text-destructive">
          Couldn't load the decorations: {error}
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {index ? (
          <DecorationList
            title={name ? `On the ${name}` : "On the document"}
            items={decorationsOf(index, selected ?? [])}
            index={index}
            onLog={onLog}
          />
        ) : (
          error == null && <p className="text-xs text-muted-foreground">Loading…</p>
        )}
      </div>
    </aside>
  );
};
