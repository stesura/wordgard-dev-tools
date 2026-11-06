import { fire } from "../transport.ts";
import { dataPath } from "#lib/paths.ts";
import { useStore } from "@nanostores/react";
import {
  BookOpenIcon,
  ClipboardDocumentIcon,
  CodeBracketIcon,
  CommandLineIcon,
  EyeIcon,
  MapPinIcon,
} from "#icons";
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

export const createNodeMenuAnchor = (
  focus: (row: HTMLElement, path: Path) => void
): NodeMenuAnchor =>
  createMenuAnchor(
    "[data-path]",
    (row) => ({ path: dataPath(row) ?? [], name: row.getAttribute("data-name") }),
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
  const { target: opened, setTrigger } = anchor;
  const target = useStore(opened);
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
      <ContextMenuContent className="w-52" finalFocus={() => opened.get()?.row ?? true}>
        <CopySelection text={target?.selection} />
        <ContextMenuItem
          onClick={() => fire(store.transport, { type: "scrollIntoView", id: editorId, path })}
        >
          <EyeIcon /> Scroll into view in the page
        </ContextMenuItem>
        <ContextMenuItem
          disabled={target?.name == null}
          onClick={() => target?.name != null && store.showType(editorId, target.name)}
        >
          <BookOpenIcon /> Show {target?.name ?? "its"} type in Schema
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => fire(store.transport, { type: "logNode", id: editorId, path })}
        >
          <CommandLineIcon /> Log to console
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => fire(store.transport, { type: "logNode", id: editorId, path, json: true })}
        >
          <CodeBracketIcon /> Log as JSON
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => store.showDom(editorId, path)}>
          <CodeBracketIcon /> Show in DOM
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => fire(store.transport, { type: "logNodeDOM", id: editorId, path })}
        >
          <CommandLineIcon /> Log DOM element
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={!path.length} onClick={() => void copyJSON().catch(() => {})}>
          <ClipboardDocumentIcon /> Copy JSON
        </ContextMenuItem>
        <ContextMenuItem onClick={() => void copy(`[${path.join(", ")}]`)}>
          <MapPinIcon /> Copy path
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};
