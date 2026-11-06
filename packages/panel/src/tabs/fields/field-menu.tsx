import { ClipboardDocumentIcon, CommandLineIcon } from "#icons";
import { useSyncExternalStore } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "#components/ui/context-menu";
import type { FieldsSource } from "./fields-source.ts";
import { CopySelection } from "#components/copy-selection";
import { copy } from "#lib/clipboard.ts";
import type { MenuAnchor } from "#lib/menu-anchor.ts";
import { json } from "#lib/json.ts";

export type MenuTarget = { index: number };

/** A field's context menu. */
export const FieldMenu = ({
  source,
  anchor,
  list,
}: {
  source: FieldsSource;
  anchor: MenuAnchor<MenuTarget>;
  list: HTMLElement | null;
}) => {
  const { subscribe, get, setTrigger } = anchor;
  const target = useSyncExternalStore(subscribe, get);
  const index = target?.index;
  const copyValue = async (index: number) => {
    const result = await source.detail(index, source.version());
    if (result.field) await copy(json(result.field.value));
  };
  return (
    <ContextMenu>
      <ContextMenuTrigger className="hidden">
        <span ref={setTrigger} />
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52" finalFocus={() => list ?? true}>
        <CopySelection text={target?.selection} />
        <ContextMenuItem
          className="text-xs"
          onClick={() => index != null && source.logValue(index)}
        >
          <CommandLineIcon /> Log to console
        </ContextMenuItem>
        <ContextMenuItem className="text-xs" onClick={() => index != null && void copyValue(index)}>
          <ClipboardDocumentIcon /> Copy value
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};
