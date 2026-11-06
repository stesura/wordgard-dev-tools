import {
  ClipboardDocumentIcon,
  CodeBracketIcon,
  CommandLineIcon,
  MapPinIcon,
  RectangleGroupIcon,
  ViewfinderCircleIcon,
} from "#icons";
import { useSyncExternalStore } from "react";
import { accessor, type Path } from "@stesura/wordgard-dev-tools";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "#components/ui/context-menu";
import { CopySelection } from "#components/copy-selection";
import { copy } from "#lib/clipboard.ts";
import type { MenuAnchor } from "#lib/menu-anchor.ts";
import type { PanelStore } from "#stores/panel-store.ts";
import { childOf, nodePathOf } from "./json-lines.ts";

export type MenuTarget = { keys: string[] };

/** A line's context menu. Highlighting is for node objects only; the rest is for any value. */
export const StateMenu = ({
  store,
  editorId,
  json,
  anchor,
  tree,
  onHighlight,
}: {
  store: PanelStore;
  editorId: number;
  json: unknown;
  anchor: MenuAnchor<MenuTarget>;
  tree: HTMLElement | null;
  onHighlight: (path: Path) => void;
}) => {
  const { subscribe, get, setTrigger } = anchor;
  const target = useSyncExternalStore(subscribe, get);
  const keys = target?.keys ?? [];
  const path = nodePathOf(keys);
  const log = (json: boolean) =>
    (path
      ? store.transport.send({ type: "logNode", id: editorId, path, json })
      : store.transport.send({ type: "logState", id: editorId, keys, json })
    ).catch(() => {});
  return (
    <ContextMenu>
      <ContextMenuTrigger className="hidden">
        <span ref={setTrigger} />
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52" finalFocus={() => tree ?? true}>
        <CopySelection text={target?.selection} />
        {path && (
          <>
            <ContextMenuItem className="text-xs" onClick={() => onHighlight(path)}>
              <ViewfinderCircleIcon /> Highlight in the editor
            </ContextMenuItem>
            <ContextMenuItem className="text-xs" onClick={() => store.showNode(editorId, path)}>
              <RectangleGroupIcon /> Show in Structure
            </ContextMenuItem>
          </>
        )}
        <ContextMenuItem className="text-xs" onClick={() => void log(false)}>
          <CommandLineIcon /> Log to console
        </ContextMenuItem>
        <ContextMenuItem className="text-xs" onClick={() => void log(true)}>
          <CodeBracketIcon /> Log as JSON
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          className="text-xs"
          onClick={() =>
            void copy(JSON.stringify(keys.reduce<unknown>(childOf, json), null, 2) ?? "undefined")
          }
        >
          <ClipboardDocumentIcon /> Copy JSON
        </ContextMenuItem>
        <ContextMenuItem
          className="text-xs"
          disabled={!keys.length}
          onClick={() => void copy(accessor(keys).replace(/^\./, ""))}
        >
          <MapPinIcon /> Copy path
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};
