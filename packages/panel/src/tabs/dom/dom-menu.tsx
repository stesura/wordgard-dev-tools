import { useStore } from "@nanostores/react";
import {
  ClipboardDocumentIcon,
  CodeBracketIcon,
  CommandLineIcon,
  RectangleGroupIcon,
} from "#icons";
import type { ViewNode } from "@stesura/wordgard-dev-tools";
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
import { pathOf } from "./dom-lines.ts";

/** The document node a line's element draws, else its nearest ancestor's (a text node draws none). */
const drawnBy = (root: ViewNode, id: string) => {
  let node: ViewNode | undefined = root;
  let found = root.node;
  for (const index of pathOf(id)) {
    node = node?.children[index];
    found = node?.node ?? found;
  }
  return found;
};

export type DomTarget = { id: string };

/** A DOM line's context menu. */
export const DomMenu = ({
  store,
  editorId,
  dom,
  anchor,
  tree,
  onElement,
}: {
  store: PanelStore;
  editorId: number;
  dom: ViewNode | null;
  anchor: MenuAnchor<DomTarget>;
  tree: HTMLElement | null;
  onElement: (id: string, action: "log" | "logHTML") => void;
}) => {
  const { target: opened, setTrigger } = anchor;
  const target = useStore(opened);
  const node = target && dom ? drawnBy(dom, target.id) : null;
  const copyHTML = async (id: string) =>
    copy(await store.transport.send({ type: "viewHTML", id: editorId, path: pathOf(id) }));
  return (
    <ContextMenu>
      <ContextMenuTrigger className="hidden">
        <span ref={setTrigger} />
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52" finalFocus={() => tree ?? true}>
        <CopySelection text={target?.selection} />
        <ContextMenuItem
          className="text-xs"
          disabled={node == null}
          onClick={() => node && store.showNode(editorId, node.path)}
        >
          <RectangleGroupIcon /> Show {node?.name ?? "its node"} in Structure
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem className="text-xs" onClick={() => target && onElement(target.id, "log")}>
          <CommandLineIcon /> Log element
        </ContextMenuItem>
        <ContextMenuItem
          className="text-xs"
          onClick={() => target && onElement(target.id, "logHTML")}
        >
          <CodeBracketIcon /> Log outer HTML
        </ContextMenuItem>
        <ContextMenuItem
          className="text-xs"
          onClick={() => target && void copyHTML(target.id).catch(() => {})}
        >
          <ClipboardDocumentIcon /> Copy outer HTML
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};
