import {
  BookOpenIcon,
  ClipboardDocumentIcon,
  CodeBracketIcon,
  CommandLineIcon,
  EyeIcon,
  MapPinIcon,
} from "#icons";
import { useSyncExternalStore } from "react";
import type { Path } from "@stesura/wordgard-dev-tools";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "./ui/context-menu.tsx";
import type { PanelStore } from "#stores/panel-store.ts";
import { type MenuAnchor, createMenuAnchor } from "#lib/menu-anchor.ts";
import { copy } from "#lib/clipboard.ts";
import { CopySelection } from "./copy-selection.tsx";

type Target = { path: Path; name: string | null };
export type NodeMenuAnchor = MenuAnchor<Target>;

const pathOf = (row: HTMLElement): Path => {
  const path = row.getAttribute("data-path") ?? "";
  return path ? path.split(".").map(Number) : [];
};

export const createNodeMenuAnchor = (
  focus: (row: HTMLElement, path: Path) => void
): NodeMenuAnchor =>
  createMenuAnchor(
    "[data-path]",
    (row) => ({ path: pathOf(row), name: row.getAttribute("data-name") }),
    (row, target) => focus(row, target.path)
  );

export const NodeMenu = ({
  store,
  editorId,
  anchor,
}: {
  store: PanelStore;
  editorId: number;
  anchor: NodeMenuAnchor;
}) => {
  const { subscribe, get, setTrigger } = anchor;
  const target = useSyncExternalStore(subscribe, get);
  const path = target?.path ?? [];
  const copyJSON = async () => {
    const node = await store.transport.send({ type: "node", id: editorId, path });
    await copy(JSON.stringify(node.json, null, 2));
  };
  return (
    <ContextMenu>
      <ContextMenuTrigger className="hidden">
        <span ref={setTrigger} />
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52" finalFocus={() => get()?.row ?? true}>
        <CopySelection text={target?.selection} />
        <ContextMenuItem
          className="text-xs"
          onClick={() =>
            store.transport.send({ type: "scrollIntoView", id: editorId, path }).catch(() => {})
          }
        >
          <EyeIcon /> Scroll into view in the page
        </ContextMenuItem>
        <ContextMenuItem
          className="text-xs"
          disabled={target?.name == null}
          onClick={() => target?.name != null && store.showType(editorId, target.name)}
        >
          <BookOpenIcon /> Show {target?.name ?? "its"} type in Schema
        </ContextMenuItem>
        <ContextMenuItem
          className="text-xs"
          onClick={() =>
            store.transport.send({ type: "logNode", id: editorId, path }).catch(() => {})
          }
        >
          <CommandLineIcon /> Log to console
        </ContextMenuItem>
        <ContextMenuItem
          className="text-xs"
          onClick={() =>
            store.transport
              .send({ type: "logNode", id: editorId, path, json: true })
              .catch(() => {})
          }
        >
          <CodeBracketIcon /> Log as JSON
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem className="text-xs" onClick={() => store.showDom(editorId, path)}>
          <CodeBracketIcon /> Show in DOM
        </ContextMenuItem>
        <ContextMenuItem
          className="text-xs"
          onClick={() =>
            store.transport.send({ type: "logNodeDOM", id: editorId, path }).catch(() => {})
          }
        >
          <CommandLineIcon /> Log DOM element
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          className="text-xs"
          disabled={!path.length}
          onClick={() => void copyJSON().catch(() => {})}
        >
          <ClipboardDocumentIcon /> Copy JSON
        </ContextMenuItem>
        <ContextMenuItem className="text-xs" onClick={() => void copy(`[${path.join(", ")}]`)}>
          <MapPinIcon /> Copy path
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};
