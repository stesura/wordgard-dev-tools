import type { ExtensionNode } from "@stesura/wordgard-dev-tools";
import { useStore } from "@nanostores/react";
import { ArrowUpRightIcon, ClipboardDocumentIcon, CodeBracketIcon, CommandLineIcon } from "#icons";
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

export type ExtensionTarget = { id: string };

/** An extension's context menu, on its tree row and on the pane showing it. */
export const ExtensionMenu = ({
  anchor,
  nodeOf,
  focusBack,
  onLog,
  onShowField,
}: {
  anchor: MenuAnchor<ExtensionTarget>;
  nodeOf: (id: string) => ExtensionNode | null;
  /** Where focus goes when it closes; else the element it opened on. */
  focusBack: HTMLElement | null;
  onLog: (id: string, resolved: boolean) => void;
  onShowField: (index: number) => void;
}) => {
  const { target: opened, setTrigger } = anchor;
  const target = useStore(opened);
  const id = target?.id ?? null;
  const node = id == null ? null : nodeOf(id);
  const field = node?.field ?? null;
  return (
    <ContextMenu>
      <ContextMenuTrigger className="hidden">
        <span ref={setTrigger} />
      </ContextMenuTrigger>
      <ContextMenuContent
        className="w-52"
        finalFocus={() => focusBack ?? opened.get()?.row ?? true}
      >
        <CopySelection text={target?.selection} />
        <ContextMenuItem onClick={() => id != null && onLog(id, false)}>
          <CommandLineIcon /> Log to console
        </ContextMenuItem>
        {node?.facet != null && (
          <ContextMenuItem onClick={() => id != null && onLog(id, true)}>
            <CommandLineIcon /> Log its facet&apos;s value
          </ContextMenuItem>
        )}
        {field != null && (
          <ContextMenuItem onClick={() => onShowField(field)}>
            <ArrowUpRightIcon /> Show in Fields
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => node && void copy(node.label)}>
          <ClipboardDocumentIcon /> Copy name
        </ContextMenuItem>
        {node?.value != null && (
          <ContextMenuItem onClick={() => node.value != null && void copy(node.value)}>
            <ClipboardDocumentIcon /> Copy value
          </ContextMenuItem>
        )}
        <ContextMenuItem onClick={() => node && void copy(JSON.stringify(node, null, 2))}>
          <CodeBracketIcon /> Copy as JSON
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};
