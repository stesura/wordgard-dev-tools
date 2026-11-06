import { useStore } from "@nanostores/react";
import { ArrowUpRightIcon, ClipboardDocumentIcon, CommandLineIcon } from "#icons";
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

/** `log`: its last change's transaction in the log. */
export type MenuTarget = { index: number; log: number | null };

/** A field's context menu. */
export const FieldMenu = ({
  source,
  anchor,
  list,
  onLog,
}: {
  source: FieldsSource;
  anchor: MenuAnchor<MenuTarget>;
  list: HTMLElement | null;
  onLog: (index: number) => void;
}) => {
  const { target: opened, setTrigger } = anchor;
  const target = useStore(opened);
  const index = target?.index;
  const copyValue = async (index: number) => {
    const result = await source.detail(index, source.state.get().version);
    if (result.field) await copy(json(result.field.value));
  };
  return (
    <ContextMenu>
      <ContextMenuTrigger className="hidden">
        <span ref={setTrigger} />
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52" finalFocus={() => list ?? true}>
        <CopySelection text={target?.selection} />
        <ContextMenuItem onClick={() => index != null && source.logValue(index)}>
          <CommandLineIcon /> Log to console
        </ContextMenuItem>
        <ContextMenuItem onClick={() => index != null && void copyValue(index)}>
          <ClipboardDocumentIcon /> Copy value
        </ContextMenuItem>
        {target?.log != null && (
          <ContextMenuItem onClick={() => target.log != null && onLog(target.log)}>
            <ArrowUpRightIcon /> Show #{target.log} in Log
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
};
